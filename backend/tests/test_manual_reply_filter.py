"""
Tests for the manual_reply_needed filter and counts on the Reviews list.
Verifies the API contract used by the "Manual reply needed" badge + filter chip.
"""
import os
import sys
import uuid

import pytest
import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(ROOT, ".env"))
except Exception:
    pass

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
ADMIN_EMAIL = os.environ.get("HANDLEEY_TEST_EMAIL", "manager@grandhotel.com")
ADMIN_PASSWORD = os.environ.get("HANDLEEY_TEST_PASSWORD", "Test1234!")
BUSINESS_KEY = os.environ.get("HANDLEEY_TEST_BUSINESS_KEY", "EOW-69RH8F")
BRANCH_ID = os.environ.get("HANDLEEY_TEST_BRANCH_ID", "6edd50b6-b316-4103-b1e2-593e768ae9b3")


def _login_token() -> str:
    res = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"key": BUSINESS_KEY, "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=10,
    )
    res.raise_for_status()
    return res.json()["token"]


@pytest.fixture(scope="module")
def auth_headers():
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL not set")
    token = _login_token()
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def seeded_reviews(auth_headers):
    """Insert one review needing manual reply + one regular replied review."""
    from motor.motor_asyncio import AsyncIOMotorClient
    from datetime import datetime, timezone
    import asyncio

    rid_manual = "test-mr-" + uuid.uuid4().hex[:8]
    rid_normal = "test-ok-" + uuid.uuid4().hex[:8]

    async def _seed():
        db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
        cli = await db.clients.find_one({"business_key": BUSINESS_KEY}, {"id": 1})
        base = {
            "client_id": cli["id"],
            "branch_id": BRANCH_ID,
            "location_id": BRANCH_ID,
            "date": datetime.now(timezone.utc).isoformat(),
            "is_seen": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.reviews.insert_many([
            {"id": rid_manual, **base, "platform": "yelp", "platform_review_id": "rev-mr-1",
             "reviewer_name": "Test Manual", "rating": 5, "text": "Awesome!", "status": "replied",
             "reply_text": "Thanks!", "platform_reply_unsupported": True,
             "platform_reply_message": "Yelp Fusion API does not allow third-party replies.",
             "platform_external_url": "https://yelp.com/biz/test",
             "platform_external_label": "Reply on Yelp"},
            {"id": rid_normal, **base, "platform": "google", "platform_review_id": "rev-ok-1",
             "reviewer_name": "Test Normal", "rating": 5, "text": "Lovely.", "status": "replied",
             "reply_text": "Thanks!", "platform_reply_posted": True},
        ])

    asyncio.run(_seed())
    yield {"manual": rid_manual, "normal": rid_normal}

    async def _clean():
        db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
        await db.reviews.delete_many({"id": {"$in": [rid_manual, rid_normal]}})

    asyncio.run(_clean())


def test_counts_includes_manual_reply_needed(auth_headers, seeded_reviews):
    res = requests.get(
        f"{BASE_URL}/api/reviews/counts",
        params={"branch_id": BRANCH_ID},
        headers=auth_headers,
        timeout=10,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert "manual_reply_needed" in body
    assert body["manual_reply_needed"] >= 1, body


def test_filter_manual_reply_needed_true_includes_only_unsupported(auth_headers, seeded_reviews):
    res = requests.get(
        f"{BASE_URL}/api/reviews/",
        params={"manual_reply_needed": "true", "branch_id": BRANCH_ID, "limit": 50},
        headers=auth_headers,
        timeout=10,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    ids = [r["id"] for r in body.get("reviews", [])]
    assert seeded_reviews["manual"] in ids
    assert seeded_reviews["normal"] not in ids
    # Every returned row must have the unsupported flag + a saved reply
    for r in body.get("reviews", []):
        assert r.get("platform_reply_unsupported") is True
        assert r.get("reply_text")


def test_filter_manual_reply_needed_false_excludes_unsupported(auth_headers, seeded_reviews):
    res = requests.get(
        f"{BASE_URL}/api/reviews/",
        params={"manual_reply_needed": "false", "branch_id": BRANCH_ID, "limit": 50},
        headers=auth_headers,
        timeout=10,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    ids = [r["id"] for r in body.get("reviews", [])]
    assert seeded_reviews["manual"] not in ids
    assert seeded_reviews["normal"] in ids
