"""
Trustpilot Business Units API Integration
Read public reviews + (optionally) post replies via OAuth password grant.

Auth model:
- Reads use the API Key as a `apikey` query param.
- Replies require an OAuth2 access token obtained via the password grant
  (POST /oauth/oauth-business-users-for-applications/accesstoken). The grant
  uses Basic auth with `Base64(api_key:api_secret)` and a body containing
  `grant_type=password&username=...&password=...`. Reply credentials are
  optional — when absent the connector returns a structured `unsupported`
  status and the UI guides the user to the Trustpilot Business app.

Docs:
  - https://developers.trustpilot.com/business-units-api
  - https://developers.trustpilot.com/authentication
  - https://developers.trustpilot.com/business-user-api
"""
import base64
import logging
from typing import Optional, Dict, Any, List

import httpx

from encryption import decrypt_token, is_encrypted

logger = logging.getLogger(__name__)

TRUSTPILOT_API_BASE = "https://api.trustpilot.com/v1"
TRUSTPILOT_OAUTH_TOKEN_URL = (
    "https://api.trustpilot.com/v1/oauth/oauth-business-users-for-applications/accesstoken"
)


class TrustpilotAPI:
    def __init__(
        self,
        api_key: str,
        business_unit_id: str,
        api_secret: Optional[str] = None,
        business_username: Optional[str] = None,
        business_password: Optional[str] = None,
    ):
        self.api_key = api_key
        self.business_unit_id = business_unit_id
        # Reply credentials (all optional — only required for posting replies)
        self.api_secret = api_secret
        self.business_username = business_username
        self.business_password = business_password
        # In-memory access-token cache for the lifetime of this instance
        self._reply_access_token: Optional[str] = None

    # ─── helpers ─────────────────────────────────────────────────────────

    def _params(self, **extra) -> Dict[str, str]:
        params = {"apikey": self.api_key}
        params.update({k: v for k, v in extra.items() if v is not None})
        return params

    def _has_reply_credentials(self) -> bool:
        return bool(self.api_secret and self.business_username and self.business_password)

    async def _get_reply_token(self) -> Optional[str]:
        """Fetch (or reuse) an OAuth access token for posting replies.

        Returns None when the necessary reply credentials aren't configured.
        Raises an exception only on transport failures — auth failures from
        Trustpilot are returned as None and logged.
        """
        if not self._has_reply_credentials():
            return None
        if self._reply_access_token:
            return self._reply_access_token

        basic = base64.b64encode(f"{self.api_key}:{self.api_secret}".encode()).decode()
        headers = {
            "Authorization": f"Basic {basic}",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        body = {
            "grant_type": "password",
            "username": self.business_username,
            "password": self.business_password,
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(TRUSTPILOT_OAUTH_TOKEN_URL, headers=headers, data=body)
            if res.status_code != 200:
                logger.warning(
                    "Trustpilot password-grant failed: %s %s",
                    res.status_code, res.text[:200],
                )
                return None
            token = (res.json() or {}).get("access_token")
            if token:
                self._reply_access_token = token
            return token
        except Exception as e:
            logger.error("Trustpilot OAuth token request failed: %s", e)
            return None

    # ─── read endpoints ──────────────────────────────────────────────────

    async def test_connection(self) -> Dict[str, Any]:
        """Test API key + business unit ID combination."""
        if not self.business_unit_id:
            return {"status": "error", "error": "Business Unit ID missing — set the 'Client ID' to your Trustpilot Business Unit ID"}
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                res = await client.get(
                    f"{TRUSTPILOT_API_BASE}/business-units/{self.business_unit_id}",
                    params=self._params(),
                )
                if res.status_code == 200:
                    body = res.json()
                    return {
                        "status": "connected",
                        "business_name": body.get("displayName") or (body.get("name", {}) or {}).get("identifying"),
                        "business_unit_id": body.get("id"),
                        "trust_score": body.get("trustScore"),
                        "stars": body.get("stars"),
                        "review_count": (body.get("numberOfReviews") or {}).get("total"),
                        "website": body.get("websiteUrl"),
                        "reply_capable": self._has_reply_credentials(),
                    }
                if res.status_code == 401:
                    return {"status": "auth_error", "error": "Invalid Trustpilot API key"}
                if res.status_code == 404:
                    return {"status": "error", "error": f"Trustpilot business unit '{self.business_unit_id}' not found"}
                return {"status": "error", "error": f"Trustpilot API {res.status_code}: {res.text[:200]}"}
        except Exception as e:
            logger.error("Trustpilot API test failed: %s", e)
            return {"status": "error", "error": str(e)}

    async def get_reviews(self, page: int = 1, per_page: int = 100) -> Dict[str, Any]:
        """Fetch reviews (paginated) for the configured business unit."""
        if not self.business_unit_id:
            return {"reviews": [], "error": "Business Unit ID missing"}
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.get(
                    f"{TRUSTPILOT_API_BASE}/business-units/{self.business_unit_id}/reviews",
                    params=self._params(page=page, perPage=per_page),
                )
                if res.status_code != 200:
                    return {"reviews": [], "error": f"Trustpilot reviews API {res.status_code}: {res.text[:200]}"}
                body = res.json()
                normalized: List[Dict[str, Any]] = []
                for r in body.get("reviews", []):
                    consumer = r.get("consumer", {}) or {}
                    normalized.append({
                        "platform_review_id": r.get("id"),
                        "reviewer_name": consumer.get("displayName"),
                        "reviewer_photo": (consumer.get("imageUrl") or None),
                        "rating": int(r.get("stars") or 0),
                        "text": (r.get("text") or "").strip(),
                        "title": r.get("title") or "",
                        "date": r.get("createdAt"),
                        "url": (r.get("links", {}) or {}).get("href") if isinstance(r.get("links"), dict) else None,
                        "language": r.get("language"),
                    })
                total = (
                    (body.get("links") or [{}])[0].get("total")
                    if isinstance(body.get("links"), list)
                    else len(normalized)
                )
                return {"reviews": normalized, "total": total}
        except Exception as e:
            logger.error("Trustpilot get_reviews failed: %s", e)
            return {"reviews": [], "error": str(e)}

    # ─── reply endpoint ──────────────────────────────────────────────────

    async def reply_to_review(
        self,
        review_url: Optional[str] = None,
        reply_text: Optional[str] = None,
        platform_review_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Post a reply via the Business User API when reply credentials are
        configured; otherwise return a structured `unsupported` response.
        """
        external_fallback = {
            "status": "unsupported",
            "platform": "trustpilot",
            "message": "Trustpilot replies require the Business OAuth flow. Please reply via the Trustpilot Business app.",
            "external_url": review_url or (
                f"https://businessapp.b2b.trustpilot.com/reviews/list?bu={self.business_unit_id}"
                if self.business_unit_id else "https://businessapp.b2b.trustpilot.com"
            ),
            "external_label": "Reply on Trustpilot Business",
        }

        if not (self._has_reply_credentials() and platform_review_id and reply_text):
            return external_fallback

        token = await self._get_reply_token()
        if not token:
            return {
                **external_fallback,
                "message": "Could not obtain a Trustpilot access token (check the API Secret + Business email/password). Reply was not posted.",
            }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(
                    f"{TRUSTPILOT_API_BASE}/private/reviews/{platform_review_id}/reply",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                    },
                    json={"message": reply_text},
                )
            if res.status_code in (200, 201, 204):
                return {"status": "success", "platform": "trustpilot"}
            # 401 likely means the cached token was invalidated mid-call — drop it so
            # a subsequent call refreshes
            if res.status_code == 401:
                self._reply_access_token = None
            logger.warning(
                "Trustpilot reply post failed: %s %s",
                res.status_code, res.text[:200],
            )
            return {
                **external_fallback,
                "message": f"Trustpilot rejected the reply ({res.status_code}). Saved internally — please post manually.",
            }
        except Exception as e:
            logger.error("Trustpilot reply request failed: %s", e)
            return {**external_fallback, "message": f"Network error contacting Trustpilot: {e}"}


async def get_trustpilot_api(db, client_id: str, branch_id: Optional[str] = None) -> Optional[TrustpilotAPI]:
    """Resolve a configured TrustpilotAPI client for the given client/branch.

    Pulls reply credentials from `additional_config` (if present) and decrypts
    the encrypted entries (`trustpilot_username`, `trustpilot_password`).
    """
    query = {"client_id": client_id, "platform": "trustpilot"}
    if branch_id:
        query["branch_id"] = branch_id

    creds = await db.platform_credentials.find_one(query)
    if not creds or not creds.get("api_key"):
        return None

    def _decrypt_or_none(value: Optional[str]) -> Optional[str]:
        if not value:
            return None
        try:
            return decrypt_token(value) if is_encrypted(value) else value
        except Exception:
            logger.error("Failed to decrypt Trustpilot credential")
            return None

    api_key = _decrypt_or_none(creds.get("api_key"))
    api_secret = _decrypt_or_none(creds.get("client_secret"))
    business_unit_id = (creds.get("oauth_client_id") or "").strip()

    additional = creds.get("additional_config") or {}
    business_username = _decrypt_or_none(additional.get("trustpilot_username"))
    business_password = _decrypt_or_none(additional.get("trustpilot_password"))

    return TrustpilotAPI(
        api_key=api_key,
        business_unit_id=business_unit_id,
        api_secret=api_secret,
        business_username=business_username,
        business_password=business_password,
    )
