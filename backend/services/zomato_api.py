"""
Zomato Partner API Integration.

Zomato's PUBLIC v2.1 API (developers.zomato.com) was deprecated in 2021 and
no longer accepts new keys. Active *Restaurant Partner* program participants
get private credentials from their Zomato account rep that work against the
modern partner endpoint (`https://api.zomato.com/...`) with the `user-key`
header.

This service is structured so that:
  1. If the partner provides a valid user-key + restaurant_id it actually
     fetches reviews from the partner endpoint.
  2. If the credentials are missing or rejected, the service returns clean
     `auth_error` / `not_connected` responses so the UI can show a friendly
     CTA instead of crashing.
  3. Reply-back is *always* graceful-degraded — Zomato does not expose any
     public reply API, so we surface a deep link to the Zomato Business
     dashboard.

Exact partner endpoints vary by onboarding agreement. We default to the
most commonly documented path and allow override via
`additional_config.api_base_url` so different onboarding cohorts can plug
in their own base URL without code changes.
"""
import httpx
import logging
from typing import Optional, Dict, Any, List

from encryption import decrypt_token, is_encrypted

logger = logging.getLogger(__name__)

ZOMATO_DEFAULT_API_BASE = "https://api.zomato.com/v3"


class ZomatoAPI:
    def __init__(
        self,
        api_key: str,
        restaurant_id: str,
        api_base_url: Optional[str] = None,
    ):
        self.api_key = api_key
        self.restaurant_id = restaurant_id
        self.api_base = (api_base_url or ZOMATO_DEFAULT_API_BASE).rstrip("/")
        # Zomato partner endpoints traditionally accept the key in `user-key`.
        # We send Bearer too so newer cohorts that use OAuth-style keys also work.
        self.headers = {
            "user-key": api_key,
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        }

    async def test_connection(self) -> Dict[str, Any]:
        """Resolve the restaurant to confirm the partner key + restaurant_id."""
        if not self.restaurant_id:
            return {
                "status": "error",
                "error": "Restaurant ID missing — paste the numeric Zomato Restaurant ID into the 'Restaurant ID' field.",
            }
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                res = await client.get(
                    f"{self.api_base}/restaurant/{self.restaurant_id}",
                    headers=self.headers,
                )
                if res.status_code == 200:
                    body = res.json()
                    info = body.get("restaurant") or body
                    return {
                        "status": "connected",
                        "restaurant_name": info.get("name"),
                        "restaurant_id": str(info.get("id") or self.restaurant_id),
                        "rating": (info.get("user_rating") or {}).get("aggregate_rating"),
                        "votes": (info.get("user_rating") or {}).get("votes"),
                        "url": info.get("url"),
                        "address": (info.get("location") or {}).get("address"),
                    }
                if res.status_code in (401, 403):
                    return {
                        "status": "auth_error",
                        "error": (
                            "Zomato API rejected the partner key. The public Zomato API "
                            "(developers.zomato.com) was deprecated in 2021 — partner "
                            "credentials from your Zomato account rep are required."
                        ),
                    }
                if res.status_code == 404:
                    return {
                        "status": "error",
                        "error": f"Zomato restaurant '{self.restaurant_id}' not found at {self.api_base}",
                    }
                return {
                    "status": "error",
                    "error": f"Zomato API {res.status_code}: {res.text[:200]}",
                }
        except Exception as e:
            logger.error(f"Zomato API test failed: {e}")
            return {"status": "error", "error": str(e)}

    async def get_reviews(self, limit: int = 50) -> Dict[str, Any]:
        """Fetch reviews for the configured restaurant."""
        if not self.restaurant_id:
            return {"reviews": [], "error": "Restaurant ID missing"}
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.get(
                    f"{self.api_base}/restaurant/{self.restaurant_id}/reviews",
                    headers=self.headers,
                    params={"count": min(max(limit, 1), 100)},
                )
                if res.status_code != 200:
                    return {
                        "reviews": [],
                        "error": f"Zomato reviews API {res.status_code}: {res.text[:200]}",
                    }
                body = res.json()
                raw_reviews = body.get("user_reviews") or body.get("reviews") or []
                normalized: List[Dict[str, Any]] = []
                for wrapper in raw_reviews:
                    r = wrapper.get("review") if isinstance(wrapper, dict) and "review" in wrapper else wrapper
                    if not isinstance(r, dict):
                        continue
                    user = r.get("user") or {}
                    normalized.append({
                        "platform_review_id": str(r.get("id") or r.get("review_id") or ""),
                        "reviewer_name": user.get("name") or "Anonymous",
                        "reviewer_photo": user.get("profile_image"),
                        "rating": float(r.get("rating") or 0) or None,
                        "text": (r.get("review_text") or "").strip(),
                        "date": r.get("review_time_friendly") or r.get("timestamp"),
                        "url": r.get("url"),
                    })
                return {"reviews": normalized, "total": len(normalized)}
        except Exception as e:
            logger.error(f"Zomato get_reviews failed: {e}")
            return {"reviews": [], "error": str(e)}

    async def reply_to_review(
        self,
        review_url: Optional[str] = None,
        reply_text: Optional[str] = None,
        **_kwargs,
    ) -> Dict[str, Any]:
        """Zomato does not expose a public reply-to-review endpoint. Replies
        are handled inside the Zomato Business app/dashboard. We surface a
        clean unsupported response with a deep link the UI can render as a CTA.
        """
        external = review_url or "https://www.zomato.com/business"
        return {
            "status": "unsupported",
            "platform": "zomato",
            "message": (
                "Zomato does not allow third-party replies via API. "
                "Use the Zomato Business app or dashboard to respond to this review."
            ),
            "external_url": external,
            "external_label": "Open on Zomato Business",
        }


async def get_zomato_api(
    db,
    client_id: str,
    branch_id: Optional[str] = None,
) -> Optional[ZomatoAPI]:
    """Resolve a configured ZomatoAPI client for the given client/branch.

    Storage convention (mirrors Yelp / Trustpilot / Foursquare):
      api_key                          → encrypted partner user-key
      oauth_client_id                  → numeric Restaurant ID
      additional_config.api_base_url   → optional override for the partner endpoint
    """
    query = {"client_id": client_id, "platform": "zomato"}
    if branch_id:
        query["branch_id"] = branch_id

    creds = await db.platform_credentials.find_one(query)
    if not creds or not creds.get("api_key"):
        return None

    api_key = creds["api_key"]
    if is_encrypted(api_key):
        api_key = decrypt_token(api_key)

    restaurant_id = (creds.get("oauth_client_id") or "").strip()
    api_base_url = (creds.get("additional_config") or {}).get("api_base_url")
    return ZomatoAPI(api_key=api_key, restaurant_id=restaurant_id, api_base_url=api_base_url)
