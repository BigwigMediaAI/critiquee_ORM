"""
Iteration 16 backend tests:
- /api/ai/compose-post (new)
- /api/ai/suggest-reply with signature toggle (updated)
- /api/settings GET/PUT with signature stored at client level (updated)
- /api/review-link/platform-categories (new)
- /api/review-link/custom-platforms with category (updated)
"""

import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
# Test credentials are sourced from environment with safe defaults that match
# /app/memory/test_credentials.md for local development. Override in CI by
# exporting HANDLEEY_TEST_EMAIL / HANDLEEY_TEST_PASSWORD / HANDLEEY_TEST_BUSINESS_KEY / HANDLEEY_TEST_BRANCH_ID.
ADMIN_EMAIL = os.environ.get("HANDLEEY_TEST_EMAIL", "manager@grandhotel.com")
ADMIN_PASSWORD = os.environ.get("HANDLEEY_TEST_PASSWORD", "Test1234!")
BUSINESS_KEY = os.environ.get("HANDLEEY_TEST_BUSINESS_KEY", "EOW-69RH8F")
BRANCH_ID = os.environ.get("HANDLEEY_TEST_BRANCH_ID", "6edd50b6-b316-4103-b1e2-593e768ae9b3")


@pytest.fixture(scope="session")
def auth_token():
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={
            "key": BUSINESS_KEY,
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
        },
        timeout=20,
    )
    if r.status_code != 200:
        pytest.skip(f"Auth failed: {r.status_code} {r.text}")
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="session")
def client(auth_token):
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json",
    })
    return s


# ─── Platform Categories ──────────────────────────────────────────────────────

class TestPlatformCategories:
    def test_returns_categorized_list(self, client):
        r = client.get(f"{BASE_URL}/api/review-link/platform-categories", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "categories" in data
        cats = data["categories"]
        assert isinstance(cats, list) and len(cats) >= 11
        cat_values = [c["value"] for c in cats]
        for must in [
            "hospitality", "healthcare", "travel", "real_estate", "automotive",
            "ecommerce_retail", "beauty_wellness", "education",
            "professional_b2b", "local_general", "other",
        ]:
            assert must in cat_values, f"Missing category {must}"
        # Each cat has platforms list
        for c in cats:
            assert isinstance(c.get("platforms"), list)
            assert len(c["platforms"]) >= 1
            for p in c["platforms"]:
                assert "value" in p and "label" in p

    def test_required_regional_platforms_present(self, client):
        r = client.get(f"{BASE_URL}/api/review-link/platform-categories", timeout=20)
        cats = r.json()["categories"]
        all_keys = {p["value"] for c in cats for p in c["platforms"]}
        for key in ["practo", "okadoc", "healthgrades", "bayut", "ninety_nine_acres",
                    "zillow", "zomato", "tripadvisor"]:
            assert key in all_keys, f"Required platform '{key}' missing from catalog"

    def test_other_category_has_other_platform(self, client):
        cats = client.get(f"{BASE_URL}/api/review-link/platform-categories").json()["categories"]
        other = next(c for c in cats if c["value"] == "other")
        keys = [p["value"] for p in other["platforms"]]
        assert "other" in keys


# ─── AI Compose Post ──────────────────────────────────────────────────────────

class TestComposePost:
    def test_compose_post_valid_prompt(self, client):
        r = client.post(
            f"{BASE_URL}/api/ai/compose-post",
            json={
                "prompt": "Announce our new weekend brunch at the Grand Hotel pool deck",
                "tone": "engaging",
                "include_hashtags": True,
                "include_keywords": True,
            },
            timeout=60,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data.get("content"), str) and len(data["content"]) > 0
        assert isinstance(data.get("hashtags"), list) and len(data["hashtags"]) >= 1
        for h in data["hashtags"]:
            assert isinstance(h, str) and h.startswith("#"), f"bad hashtag: {h}"
        assert isinstance(data.get("keywords"), list) and len(data["keywords"]) >= 1
        for k in data["keywords"]:
            assert isinstance(k, str) and len(k) > 0

    def test_compose_post_short_prompt_returns_400(self, client):
        r = client.post(
            f"{BASE_URL}/api/ai/compose-post",
            json={"prompt": "ab"},
            timeout=20,
        )
        assert r.status_code == 400

    def test_compose_post_disable_flags(self, client):
        r = client.post(
            f"{BASE_URL}/api/ai/compose-post",
            json={
                "prompt": "Promote our spa wellness package this winter",
                "include_hashtags": False,
                "include_keywords": False,
            },
            timeout=60,
        )
        assert r.status_code == 200
        data = r.json()
        assert data.get("hashtags") == []
        assert data.get("keywords") == []


# ─── Settings: Signature stored at client level ───────────────────────────────

class TestSettingsSignature:
    SIGNATURE_TEXT = "TEST_SIG_— Best, Grand Hotel Team"

    def test_put_signature_with_branch_id_persists_at_client_level(self, client):
        # Update settings with branch_id — signature must still go to client
        r = client.put(
            f"{BASE_URL}/api/settings/?branch_id={BRANCH_ID}",
            json={
                "signature": self.SIGNATURE_TEXT,
                "signature_enabled": True,
                "brand_tone": "friendly",
            },
            timeout=20,
        )
        assert r.status_code == 200, r.text

        # GET with branch_id should mirror signature from client + branch fields
        g = client.get(f"{BASE_URL}/api/settings/?branch_id={BRANCH_ID}", timeout=20)
        assert g.status_code == 200
        data = g.json()
        assert data.get("signature") == self.SIGNATURE_TEXT
        assert data.get("signature_enabled") is True
        assert data.get("brand_tone") == "friendly"

        # GET without branch_id (client) should also have signature
        g2 = client.get(f"{BASE_URL}/api/settings/", timeout=20)
        assert g2.status_code == 200
        client_data = g2.json()
        assert client_data.get("signature") == self.SIGNATURE_TEXT
        assert client_data.get("signature_enabled") is True

    def test_suggest_reply_appends_signature_when_enabled(self, client):
        # Make sure it's enabled
        client.put(
            f"{BASE_URL}/api/settings/",
            json={
                "signature": self.SIGNATURE_TEXT,
                "signature_enabled": True,
            },
            timeout=20,
        )
        time.sleep(0.5)
        r = client.post(
            f"{BASE_URL}/api/ai/suggest-reply",
            json={
                "platform": "google",
                "item_type": "review",
                "text": "Loved the breakfast and rooftop pool, staff was amazing!",
                "rating": 5,
                "reviewer_name": "John D.",
                "business_name": "Grand Hotel",
                "business_type": "hotel",
                "brand_tone": "friendly",
                "language": "English",
            },
            timeout=90,
        )
        assert r.status_code == 200, r.text
        suggestions = r.json().get("suggestions", [])
        assert len(suggestions) >= 1
        for s in suggestions:
            assert self.SIGNATURE_TEXT in s, f"signature missing in: {s[:200]}..."

    def test_suggest_reply_omits_signature_when_disabled(self, client):
        # Disable signature
        client.put(
            f"{BASE_URL}/api/settings/",
            json={"signature_enabled": False},
            timeout=20,
        )
        time.sleep(0.5)
        # Verify GET shows disabled
        g = client.get(f"{BASE_URL}/api/settings/?branch_id={BRANCH_ID}").json()
        assert g.get("signature_enabled") is False

        r = client.post(
            f"{BASE_URL}/api/ai/suggest-reply",
            json={
                "platform": "google",
                "item_type": "review",
                "text": "Average stay, room was a bit small.",
                "rating": 3,
                "business_name": "Grand Hotel",
                "business_type": "hotel",
                "brand_tone": "professional",
            },
            timeout=90,
        )
        assert r.status_code == 200
        for s in r.json().get("suggestions", []):
            assert self.SIGNATURE_TEXT not in s


# ─── Custom platforms with category ───────────────────────────────────────────

class TestCustomPlatformsWithCategory:
    created_ids = []

    def test_create_known_platform_resolves_name(self, client):
        r = client.post(
            f"{BASE_URL}/api/review-link/custom-platforms?branch_id={BRANCH_ID}",
            json={
                "platform_key": "practo",
                "review_url": "https://www.practo.com/test-grand-hotel",
                "category": "healthcare",
            },
            timeout=20,
        )
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc.get("platform_name") == "Practo"
        assert doc.get("category") == "healthcare"
        assert doc.get("platform_key") == "practo"
        TestCustomPlatformsWithCategory.created_ids.append(doc["id"])

        # GET to verify persistence
        g = client.get(
            f"{BASE_URL}/api/review-link/custom-platforms?branch_id={BRANCH_ID}",
            timeout=20,
        )
        assert g.status_code == 200
        platforms = g.json().get("platforms", [])
        assert any(p["id"] == doc["id"] and p["platform_name"] == "Practo" for p in platforms)

    def test_create_other_platform_with_custom_name(self, client):
        r = client.post(
            f"{BASE_URL}/api/review-link/custom-platforms?branch_id={BRANCH_ID}",
            json={
                "platform_key": "other",
                "platform_name": "TEST_My Custom Site",
                "review_url": "https://example.com/review",
                "category": "other",
            },
            timeout=20,
        )
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc.get("platform_name") == "TEST_My Custom Site"
        assert doc.get("category") == "other"
        TestCustomPlatformsWithCategory.created_ids.append(doc["id"])

    def test_other_without_name_fails(self, client):
        r = client.post(
            f"{BASE_URL}/api/review-link/custom-platforms?branch_id={BRANCH_ID}",
            json={
                "platform_key": "other",
                "review_url": "https://example.com",
                "category": "other",
            },
            timeout=20,
        )
        assert r.status_code == 400

    @classmethod
    def teardown_class(cls):
        # best-effort cleanup
        try:
            s = requests.Session()
            r = s.post(
                f"{BASE_URL}/api/auth/login",
                json={
                    "key": BUSINESS_KEY,
                    "email": ADMIN_EMAIL,
                    "password": ADMIN_PASSWORD,
                },
                timeout=15,
            )
            tok = r.json().get("access_token") or r.json().get("token")
            s.headers.update({"Authorization": f"Bearer {tok}"})
            for pid in cls.created_ids:
                s.delete(f"{BASE_URL}/api/review-link/custom-platforms/{pid}", timeout=10)
        except Exception:
            pass
