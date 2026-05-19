"""
JustDial Business Connect API Integration.

Like Zomato, JustDial does not publish a fully public review API. Live review
sync requires onboarding through the *JustDial Business Connect* programme —
your JustDial account manager issues a partner key (API key) bound to your
listing ID (`docid`).

This service is structured so that:
  1. With valid partner credentials it actually fetches reviews from the
     Business Connect endpoint.
  2. With missing or rejected credentials it returns clean `auth_error` /
     `not_connected` responses so the UI shows a friendly CTA.
  3. Reply-back is *always* graceful-degraded — JustDial does not expose a
     public reply-to-review API. The UI surfaces a deep link to the
     JustDial Business dashboard.

The exact partner endpoint varies by onboarding cohort, so we accept an
optional override via `additional_config.api_base_url`.
"""
import httpx
import logging
from typing import Optional, Dict, Any, List

from encryption import decrypt_token, is_encrypted

logger = logging.getLogger(__name__)

JUSTDIAL_DEFAULT_API_BASE = "https://api.justdial.com/businessconnect/v1"


class JustDialAPI:
    def __init__(
        self,
        api_key: str,
        listing_id: str,
        api_base_url: Optional[str] = None,
    ):
        self.api_key = api_key
        self.listing_id = listing_id
        self.api_base = (api_base_url or JUSTDIAL_DEFAULT_API_BASE).rstrip("/")
        # JustDial Business Connect typically accepts the partner key as an
        # `apikey` header; we also send Bearer for newer cohorts that switched
        # to OAuth-style tokens.
        self.headers = {
            "apikey": api_key,
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        }

    async def test_connection(self) -> Dict[str, Any]:
        """Resolve the listing to confirm the partner key + listing_id."""
        if not self.listing_id:
            return {
                "status": "error",
                "error": "Listing ID missing — paste your JustDial 'docid' (listing ID) into the field below.",
            }
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                res = await client.get(
                    f"{self.api_base}/listings/{self.listing_id}",
                    headers=self.headers,
                )
                if res.status_code == 200:
                    body = res.json()
                    info = body.get("listing") or body.get("data") or body
                    return {
                        "status": "connected",
                        "listing_name": info.get("name") or info.get("company_name"),
                        "listing_id": str(info.get("docid") or info.get("id") or self.listing_id),
                        "rating": info.get("rating") or info.get("avg_rating"),
                        "votes": info.get("totalvotes") or info.get("votes"),
                        "url": info.get("url") or info.get("listing_url"),
                        "address": info.get("address"),
                    }
                if res.status_code in (401, 403):
                    return {
                        "status": "auth_error",
                        "error": (
                            "JustDial Business Connect rejected the partner key. "
                            "Live review sync requires partner credentials issued "
                            "by your JustDial account manager."
                        ),
                    }
                if res.status_code == 404:
                    return {
                        "status": "error",
                        "error": f"JustDial listing '{self.listing_id}' not found at {self.api_base}",
                    }
                return {
                    "status": "error",
                    "error": f"JustDial API {res.status_code}: {res.text[:200]}",
                }
        except Exception as e:
            logger.error(f"JustDial API test failed: {e}")
            return {"status": "error", "error": str(e)}

    async def get_reviews(self, limit: int = 50) -> Dict[str, Any]:
        """Fetch reviews for the configured listing."""
        if not self.listing_id:
            return {"reviews": [], "error": "Listing ID missing"}
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.get(
                    f"{self.api_base}/listings/{self.listing_id}/reviews",
                    headers=self.headers,
                    params={"limit": min(max(limit, 1), 100)},
                )
                if res.status_code != 200:
                    return {
                        "reviews": [],
                        "error": f"JustDial reviews API {res.status_code}: {res.text[:200]}",
                    }
                body = res.json()
                raw_reviews = body.get("reviews") or body.get("data") or []
                normalized: List[Dict[str, Any]] = []
                for r in raw_reviews:
                    if not isinstance(r, dict):
                        continue
                    normalized.append({
                        "platform_review_id": str(r.get("review_id") or r.get("id") or ""),
                        "reviewer_name": r.get("user_name") or r.get("reviewer") or "Anonymous",
                        "reviewer_photo": r.get("user_image"),
                        "rating": float(r.get("rating") or 0) or None,
                        "text": (r.get("review_text") or r.get("text") or "").strip(),
                        "date": r.get("review_date") or r.get("date") or r.get("timestamp"),
                        "url": r.get("url") or r.get("review_url"),
                    })
                return {"reviews": normalized, "total": len(normalized)}
        except Exception as e:
            logger.error(f"JustDial get_reviews failed: {e}")
            return {"reviews": [], "error": str(e)}

    async def reply_to_review(
        self,
        review_url: Optional[str] = None,
        reply_text: Optional[str] = None,
        **_kwargs,
    ) -> Dict[str, Any]:
        """JustDial does not expose a public reply-to-review endpoint. Replies
        are handled inside the JustDial Business dashboard. We surface a
        clean unsupported response with a deep link for the UI."""
        external = review_url or "https://accounts.justdial.com/businessuser"
        return {
            "status": "unsupported",
            "platform": "justdial",
            "message": (
                "JustDial does not allow third-party replies via API. "
                "Use the JustDial Business dashboard to respond to this review."
            ),
            "external_url": external,
            "external_label": "Open on JustDial Business",
        }


async def get_justdial_api(
    db,
    client_id: str,
    branch_id: Optional[str] = None,
) -> Optional[JustDialAPI]:
    """Resolve a configured JustDialAPI client for the given client/branch.

    Storage convention (mirrors Zomato):
      api_key                          → encrypted partner key
      oauth_client_id                  → JustDial listing ID (`docid`)
      additional_config.api_base_url   → optional override for the partner endpoint
    """
    query = {"client_id": client_id, "platform": "justdial"}
    if branch_id:
        query["branch_id"] = branch_id

    creds = await db.platform_credentials.find_one(query)
    if not creds or not creds.get("api_key"):
        return None

    api_key = creds["api_key"]
    if is_encrypted(api_key):
        api_key = decrypt_token(api_key)

    listing_id = (creds.get("oauth_client_id") or "").strip()
    api_base_url = (creds.get("additional_config") or {}).get("api_base_url")
    return JustDialAPI(api_key=api_key, listing_id=listing_id, api_base_url=api_base_url)
