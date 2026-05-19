"""
Tests for the friendlier Google `test_connection` error parsing + 60s cache
on the /api/sync/test/{platform} endpoint.

Verifies that:
1. A 200 response surfaces status='connected' with accounts_count.
2. A 403 SERVICE_DISABLED response is mapped to status='api_disabled' with a
   ready-to-render details_url + details_label.
3. A 429 / RATE_LIMIT_EXCEEDED response is mapped to status='rate_limited'
   with a quotas console link.
4. Repeated test calls within 60s short-circuit through the in-memory cache
   (the upstream API is hit at most once).
"""
import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(ROOT, ".env"))
except Exception:
    pass

from services.google_api import GoogleBusinessAPI


def _httpx_response(status_code: int, json_payload):
    res = MagicMock()
    res.status_code = status_code
    res.json = MagicMock(return_value=json_payload)
    res.text = "" if status_code == 200 else "raw text body"
    return res


def _client_factory(response):
    client_mock = MagicMock()
    client_mock.get = AsyncMock(return_value=response)
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=client_mock)
    cm.__aexit__ = AsyncMock(return_value=None)
    return MagicMock(return_value=cm)


# ─── Service-layer error parsing ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_test_connection_ok_returns_accounts_count():
    api = GoogleBusinessAPI(access_token="dummy")
    payload = {"accounts": [
        {"name": "accounts/111", "accountName": "Demo Hotel"},
        {"name": "accounts/222", "accountName": "Demo Spa"},
    ]}
    with patch("services.google_api.httpx.AsyncClient", _client_factory(_httpx_response(200, payload))):
        result = await api.test_connection()
    assert result["status"] == "connected"
    assert result["accounts_count"] == 2
    assert len(result["accounts"]) == 2


@pytest.mark.asyncio
async def test_test_connection_403_service_disabled_maps_to_api_disabled():
    api = GoogleBusinessAPI(access_token="dummy")
    google_error = {
        "error": {
            "code": 403,
            "message": "My Business Account Management API has not been used in project 430113304489 before or it is disabled.",
            "details": [{
                "reason": "SERVICE_DISABLED",
                "metadata": {
                    "consumer": "projects/430113304489",
                    "service": "mybusinessaccountmanagement.googleapis.com",
                },
            }],
        }
    }
    with patch("services.google_api.httpx.AsyncClient", _client_factory(_httpx_response(403, google_error))):
        result = await api.test_connection()
    assert result["status"] == "api_disabled"
    assert result["error_code"] == "SERVICE_DISABLED"
    assert "430113304489" in result["details_url"]
    assert "mybusinessaccountmanagement.googleapis.com" in result["details_url"]
    assert result["details_label"] == "Enable API in Google Cloud Console"
    assert result["project_id"] == "430113304489"


@pytest.mark.asyncio
async def test_test_connection_429_rate_limit_maps_to_rate_limited():
    api = GoogleBusinessAPI(access_token="dummy")
    google_error = {
        "error": {
            "code": 429,
            "message": "Quota exceeded for quota metric 'Requests' and limit 'Requests per minute'",
            "details": [{
                "reason": "RATE_LIMIT_EXCEEDED",
                "metadata": {
                    "consumer": "projects/430113304489",
                    "service": "mybusinessaccountmanagement.googleapis.com",
                },
            }],
        }
    }
    with patch("services.google_api.httpx.AsyncClient", _client_factory(_httpx_response(429, google_error))):
        result = await api.test_connection()
    assert result["status"] == "rate_limited"
    assert result["error_code"] == "RATE_LIMIT_EXCEEDED"
    assert "quotas" in (result["details_url"] or "")
    assert "430113304489" in result["details_url"]
    assert result["details_label"] == "Configure higher quota"


@pytest.mark.asyncio
async def test_test_connection_401_auth_error():
    api = GoogleBusinessAPI(access_token="bad")
    with patch("services.google_api.httpx.AsyncClient", _client_factory(_httpx_response(401, {}))):
        result = await api.test_connection()
    assert result["status"] == "auth_error"


# ─── /test/{platform} 60s cache ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_test_endpoint_caches_for_60_seconds(monkeypatch):
    """Repeated /test/google calls must reuse the cached response so the
    upstream Google API is hit at most once per 60s window."""
    from routes import sync_routes

    # Reset the cache to ensure isolation between tests
    sync_routes._TEST_CACHE.clear()

    fake_api = MagicMock()
    fake_api.test_connection = AsyncMock(return_value={"status": "connected", "accounts_count": 1})
    fake_get = AsyncMock(return_value=fake_api)
    monkeypatch.setattr(sync_routes, "get_google_api", fake_get)

    fake_db = MagicMock()
    fake_db.platform_connections.update_one = AsyncMock()
    monkeypatch.setattr(sync_routes, "db", fake_db)

    user = {"client_id": "client-1", "user_id": "u-1", "role": "business_admin"}

    # First call → upstream invoked
    r1 = await sync_routes.test_platform_connection(
        platform="google", branch_id="branch-1", force=False, current_user=user,
    )
    # Second call → served from cache (no extra upstream call)
    r2 = await sync_routes.test_platform_connection(
        platform="google", branch_id="branch-1", force=False, current_user=user,
    )

    assert fake_api.test_connection.call_count == 1
    assert r1["status"] == "connected"
    assert r2["status"] == "connected"
    assert r2.get("cached") is True
    assert r2.get("cache_expires_in", 0) > 0

    # force=True bypasses the cache and re-hits upstream
    r3 = await sync_routes.test_platform_connection(
        platform="google", branch_id="branch-1", force=True, current_user=user,
    )
    assert fake_api.test_connection.call_count == 2
    assert r3["status"] == "connected"
