"""
Sync handler tests for Yelp, Trustpilot, and Foursquare integrations.

Each test mocks `httpx.AsyncClient.get` so no real network calls are made.
These tests verify:
1. The service modules normalise upstream responses correctly
2. The shared `_upsert_review` helper writes/upserts to db.reviews
3. `run_platform_sync` dispatches to the right handler and returns success
"""
import os
import sys
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Ensure /app/backend is importable when pytest is invoked from elsewhere
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

# Load backend/.env so MONGO_URL is available when sync_routes imports database
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(ROOT, ".env"))
except Exception:
    pass

from services.yelp_api import YelpFusionAPI
from services.trustpilot_api import TrustpilotAPI
from services.foursquare_api import FoursquareAPI


def _mock_httpx_response(status_code: int, json_payload):
    res = MagicMock()
    res.status_code = status_code
    res.json.return_value = json_payload
    res.text = "" if status_code == 200 else "error body"
    return res


def _patched_async_client(response):
    """Return a context-manager mock for `httpx.AsyncClient(...)` that yields a client whose .get returns `response`."""
    client_mock = MagicMock()
    client_mock.get = AsyncMock(return_value=response)
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=client_mock)
    cm.__aexit__ = AsyncMock(return_value=None)
    return MagicMock(return_value=cm)


# ─── Yelp ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_yelp_test_connection_ok():
    api = YelpFusionAPI(api_key="dummy", business_alias="pizza-hub-sf")
    payload = {
        "name": "Pizza Hub", "alias": "pizza-hub-sf",
        "rating": 4.5, "review_count": 312, "url": "https://yelp.com/biz/pizza-hub-sf",
    }
    with patch("services.yelp_api.httpx.AsyncClient", _patched_async_client(_mock_httpx_response(200, payload))):
        result = await api.test_connection()
    assert result["status"] == "connected"
    assert result["business_name"] == "Pizza Hub"
    assert result["rating"] == 4.5


@pytest.mark.asyncio
async def test_yelp_get_reviews_normalises():
    api = YelpFusionAPI(api_key="dummy", business_alias="pizza-hub-sf")
    payload = {
        "reviews": [
            {
                "id": "rev123",
                "rating": 5,
                "text": "Excellent pizza!",
                "time_created": "2026-04-15 10:00:00",
                "url": "https://yelp.com/biz/pizza-hub-sf?hrid=rev123",
                "user": {"name": "Jane D.", "image_url": "https://img/j.png"},
            },
        ],
        "total": 1,
    }
    with patch("services.yelp_api.httpx.AsyncClient", _patched_async_client(_mock_httpx_response(200, payload))):
        result = await api.get_reviews()
    assert result.get("error") is None
    assert len(result["reviews"]) == 1
    rev = result["reviews"][0]
    assert rev["platform_review_id"] == "rev123"
    assert rev["reviewer_name"] == "Jane D."
    assert rev["rating"] == 5
    assert rev["text"] == "Excellent pizza!"


@pytest.mark.asyncio
async def test_yelp_missing_alias_returns_error():
    api = YelpFusionAPI(api_key="dummy", business_alias="")
    result = await api.test_connection()
    assert result["status"] == "error"
    assert "alias" in result["error"].lower()


# ─── Trustpilot ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_trustpilot_test_connection_ok():
    api = TrustpilotAPI(api_key="dummy", business_unit_id="4f0a4b2deeeeeeeeeeeeeeee")
    payload = {
        "id": "4f0a4b2deeeeeeeeeeeeeeee",
        "displayName": "Demo Hotel",
        "trustScore": 4.6,
        "stars": 5,
        "numberOfReviews": {"total": 1234},
        "websiteUrl": "https://demo-hotel.com",
    }
    with patch("services.trustpilot_api.httpx.AsyncClient", _patched_async_client(_mock_httpx_response(200, payload))):
        result = await api.test_connection()
    assert result["status"] == "connected"
    assert result["business_name"] == "Demo Hotel"
    assert result["trust_score"] == 4.6
    assert result["review_count"] == 1234


@pytest.mark.asyncio
async def test_trustpilot_get_reviews_normalises():
    api = TrustpilotAPI(api_key="dummy", business_unit_id="biz123")
    payload = {
        "reviews": [
            {
                "id": "tp-rev-1",
                "stars": 4,
                "title": "Great stay",
                "text": "Loved the rooftop bar!",
                "createdAt": "2026-04-12T08:30:00Z",
                "consumer": {"displayName": "Sam K.", "imageUrl": None},
            },
            {
                "id": "tp-rev-2",
                "stars": 1,
                "title": "Not happy",
                "text": "Slow check-in",
                "createdAt": "2026-04-11T22:00:00Z",
                "consumer": {"displayName": "Anon"},
            },
        ],
    }
    with patch("services.trustpilot_api.httpx.AsyncClient", _patched_async_client(_mock_httpx_response(200, payload))):
        result = await api.get_reviews(page=1, per_page=10)
    assert result.get("error") is None
    assert len(result["reviews"]) == 2
    assert result["reviews"][0]["rating"] == 4
    assert result["reviews"][0]["title"] == "Great stay"
    assert result["reviews"][1]["rating"] == 1


# ─── Foursquare ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_foursquare_test_connection_ok():
    api = FoursquareAPI(api_key="dummy", fsq_id="4b8f8e0ef964a520aa9933e3")
    payload = {
        "fsq_id": "4b8f8e0ef964a520aa9933e3",
        "name": "Cafe Olive",
        "rating": 8.7,
        "stats": {"total_tips": 24},
        "location": {"formatted_address": "123 Main St, NYC"},
    }
    with patch("services.foursquare_api.httpx.AsyncClient", _patched_async_client(_mock_httpx_response(200, payload))):
        result = await api.test_connection()
    assert result["status"] == "connected"
    assert result["venue_name"] == "Cafe Olive"
    assert result["rating"] == 8.7
    assert result["tips_count"] == 24


@pytest.mark.asyncio
async def test_foursquare_get_tips_normalises():
    api = FoursquareAPI(api_key="dummy", fsq_id="venue1")
    payload = {
        "tips": [
            {
                "id": "tip1",
                "text": "Try the espresso!",
                "created_at": "2026-04-10T12:00:00Z",
                "agree_count": 5,
                "disagree_count": 0,
                "user": {"name": "Alice"},
            },
        ],
    }
    with patch("services.foursquare_api.httpx.AsyncClient", _patched_async_client(_mock_httpx_response(200, payload))):
        result = await api.get_tips()
    assert result.get("error") is None
    assert len(result["reviews"]) == 1
    tip = result["reviews"][0]
    assert tip["platform_review_id"] == "tip1"
    assert tip["text"] == "Try the espresso!"
    assert tip["reviewer_name"] == "Alice"
    assert tip["rating"] is None  # tips don't have per-tip ratings


@pytest.mark.asyncio
async def test_yelp_reply_returns_unsupported():
    """reply_to_review() must surface a 'unsupported' status with an external_url."""
    api = YelpFusionAPI(api_key="dummy", business_alias="pizza-hub-sf")
    result = await api.reply_to_review(review_url="https://yelp.com/biz/pizza-hub-sf?hrid=rev123", reply_text="Thanks!")
    assert result["status"] == "unsupported"
    assert result["platform"] == "yelp"
    assert "yelp.com" in (result["external_url"] or "")
    assert result["external_label"] == "Reply on Yelp"


@pytest.mark.asyncio
async def test_trustpilot_reply_returns_unsupported_with_business_link():
    api = TrustpilotAPI(api_key="dummy", business_unit_id="biz123")
    result = await api.reply_to_review(reply_text="Thank you!")
    assert result["status"] == "unsupported"
    assert result["platform"] == "trustpilot"
    # Should fall back to the Trustpilot Business app for that BU
    assert "businessapp.b2b.trustpilot.com" in (result["external_url"] or "")


@pytest.mark.asyncio
async def test_trustpilot_reply_posts_when_credentials_configured(monkeypatch):
    """When api_secret + business email + password are configured, Trustpilot
    should obtain an access token via password grant and POST the reply."""
    api = TrustpilotAPI(
        api_key="API_KEY",
        business_unit_id="biz123",
        api_secret="API_SECRET",
        business_username="biz@example.com",
        business_password="hunter2",
    )

    # First call (httpx.post) → password grant → access token
    # Second call (httpx.post) → reply post → 201
    token_res = MagicMock()
    token_res.status_code = 200
    token_res.json = MagicMock(return_value={"access_token": "TP_TOKEN_xyz", "expires_in": 3600})
    token_res.text = ""

    reply_res = MagicMock()
    reply_res.status_code = 201
    reply_res.json = MagicMock(return_value={})
    reply_res.text = ""

    client_mock = MagicMock()
    client_mock.post = AsyncMock(side_effect=[token_res, reply_res])

    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=client_mock)
    cm.__aexit__ = AsyncMock(return_value=None)
    async_client_factory = MagicMock(return_value=cm)

    with patch("services.trustpilot_api.httpx.AsyncClient", async_client_factory):
        result = await api.reply_to_review(
            review_url="https://trustpilot.com/reviews/abc",
            reply_text="Thanks for your feedback!",
            platform_review_id="rev-xyz",
        )

    assert result["status"] == "success", result
    assert result["platform"] == "trustpilot"
    # Two POST calls were made (token + reply)
    assert client_mock.post.call_count == 2
    # The reply call must include the bearer token from the first response
    reply_call = client_mock.post.call_args_list[1]
    assert "Bearer TP_TOKEN_xyz" in reply_call.kwargs["headers"]["Authorization"]
    assert reply_call.kwargs["json"] == {"message": "Thanks for your feedback!"}


@pytest.mark.asyncio
async def test_trustpilot_reply_falls_back_when_token_fetch_fails():
    """If the password grant returns 4xx, reply_to_review must surface a
    helpful error message so the UI keeps the manual-reply CTA visible."""
    api = TrustpilotAPI(
        api_key="API_KEY",
        business_unit_id="biz123",
        api_secret="API_SECRET",
        business_username="biz@example.com",
        business_password="wrong-password",
    )

    failed_res = MagicMock()
    failed_res.status_code = 401
    failed_res.json = MagicMock(return_value={})
    failed_res.text = "invalid_grant"

    client_mock = MagicMock()
    client_mock.post = AsyncMock(return_value=failed_res)
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=client_mock)
    cm.__aexit__ = AsyncMock(return_value=None)
    async_client_factory = MagicMock(return_value=cm)

    with patch("services.trustpilot_api.httpx.AsyncClient", async_client_factory):
        result = await api.reply_to_review(
            review_url=None,
            reply_text="Thanks!",
            platform_review_id="rev-xyz",
        )

    assert result["status"] == "unsupported"
    assert "access token" in (result["message"] or "").lower()
    # Only the token call was attempted; no reply POST went through
    assert client_mock.post.call_count == 1


@pytest.mark.asyncio
async def test_trustpilot_reply_token_is_cached():
    """A successful token fetch should be cached for subsequent reply posts."""
    api = TrustpilotAPI(
        api_key="API_KEY",
        business_unit_id="biz123",
        api_secret="API_SECRET",
        business_username="biz@example.com",
        business_password="hunter2",
    )

    token_res = MagicMock()
    token_res.status_code = 200
    token_res.json = MagicMock(return_value={"access_token": "TP_TOKEN_xyz"})
    token_res.text = ""

    reply_ok = MagicMock()
    reply_ok.status_code = 200
    reply_ok.json = MagicMock(return_value={})
    reply_ok.text = ""

    client_mock = MagicMock()
    # 1st call: token, 2nd: reply, 3rd: reply (no token refetch)
    client_mock.post = AsyncMock(side_effect=[token_res, reply_ok, reply_ok])
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=client_mock)
    cm.__aexit__ = AsyncMock(return_value=None)
    async_client_factory = MagicMock(return_value=cm)

    with patch("services.trustpilot_api.httpx.AsyncClient", async_client_factory):
        a = await api.reply_to_review(reply_text="One", platform_review_id="r1")
        b = await api.reply_to_review(reply_text="Two", platform_review_id="r2")

    assert a["status"] == "success"
    assert b["status"] == "success"
    # Token should have been fetched exactly once + 2 reply calls = 3 POSTs total
    assert client_mock.post.call_count == 3


@pytest.mark.asyncio
async def test_foursquare_reply_returns_unsupported_with_venue_link():
    api = FoursquareAPI(api_key="dummy", fsq_id="venue1")
    result = await api.reply_to_review(reply_text="Hi there")
    assert result["status"] == "unsupported"
    assert result["platform"] == "foursquare"
    assert "foursquare.com/v/venue1" in (result["external_url"] or "")


@pytest.mark.asyncio
async def test_review_reply_dispatch_records_unsupported_for_yelp(monkeypatch):
    """When a Yelp review is replied to, _post_reply_to_platform must return
    fields that the frontend uses to render the manual-reply CTA."""
    from routes import review_routes

    fake_api = MagicMock()
    fake_api.reply_to_review = AsyncMock(return_value={
        "status": "unsupported",
        "platform": "yelp",
        "message": "Yelp Fusion API does not allow third-party replies.",
        "external_url": "https://www.yelp.com/biz/pizza-hub-sf?hrid=rev123",
        "external_label": "Reply on Yelp",
    })
    monkeypatch.setattr(review_routes, "get_yelp_api", AsyncMock(return_value=fake_api))

    review_doc = {
        "id": "review-id-1",
        "platform": "yelp",
        "branch_id": "branch-1",
        "platform_review_id": "rev123",
        "url": "https://www.yelp.com/biz/pizza-hub-sf?hrid=rev123",
    }
    update = await review_routes._post_reply_to_platform("client-1", review_doc, "Thanks!")
    assert update.get("platform_reply_unsupported") is True
    assert "yelp" in (update.get("platform_external_url") or "").lower()
    assert update.get("platform_external_label") == "Reply on Yelp"
    assert update.get("platform_reply_message")  # human-readable explanation present


@pytest.mark.asyncio
async def test_review_reply_dispatch_no_op_when_unconfigured(monkeypatch):
    """If credentials aren't configured, _post_reply_to_platform must not throw
    and must return an empty update so the DB row stays clean."""
    from routes import review_routes

    monkeypatch.setattr(review_routes, "get_yelp_api", AsyncMock(return_value=None))
    monkeypatch.setattr(review_routes, "get_trustpilot_api", AsyncMock(return_value=None))
    monkeypatch.setattr(review_routes, "get_foursquare_api", AsyncMock(return_value=None))

    update = await review_routes._post_reply_to_platform(
        "client-1",
        {"platform": "trustpilot", "branch_id": "branch-1", "platform_review_id": "tp1"},
        "Thanks",
    )
    assert update == {}


# ─── Sync dispatcher integration ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_sync_yelp_via_run_platform_sync(monkeypatch):
    """Confirm run_platform_sync('yelp', ...) dispatches to the yelp handler and writes to db.reviews."""
    from routes import sync_routes

    # Stub get_yelp_api to return a fake API client
    fake_api = MagicMock()
    fake_api.test_connection = AsyncMock(return_value={
        "status": "connected", "business_name": "Pizza Hub", "rating": 4.5,
    })
    fake_api.get_reviews = AsyncMock(return_value={
        "reviews": [
            {
                "platform_review_id": "rev-int-1",
                "reviewer_name": "Test User",
                "reviewer_photo": None,
                "rating": 5,
                "text": "Awesome!",
                "date": "2026-04-15 10:00:00",
                "url": None,
            },
        ],
    })
    monkeypatch.setattr(sync_routes, "get_yelp_api", AsyncMock(return_value=fake_api))

    # Replace the entire db reference inside sync_routes with a mock so neither
    # platform_connections nor reviews touch the real database.
    fake_reviews_update = AsyncMock(return_value=MagicMock(upserted_id="upsertedID"))
    fake_db = MagicMock()
    fake_db.reviews.update_one = fake_reviews_update
    fake_db.platform_connections.update_one = AsyncMock()
    monkeypatch.setattr(sync_routes, "db", fake_db)
    monkeypatch.setattr(sync_routes, "create_notification", AsyncMock())

    test_client_id = "client-test-" + uuid.uuid4().hex[:6]
    result = await sync_routes.run_platform_sync(test_client_id, "yelp", "branch-1")
    assert result["status"] == "success", result
    assert result["synced_count"] == 1
    assert result["new_count"] == 1
    fake_reviews_update.assert_called()  # the upsert must have happened
