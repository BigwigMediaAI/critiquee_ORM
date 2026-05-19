"""
Yelp Fusion API Integration
Read-only fetch of a business profile and its 3 most-recent review excerpts.

Auth model: Bearer API Key (no OAuth handshake).
Docs: https://docs.developer.yelp.com/docs/fusion-intro
"""
import httpx
import logging
from typing import Optional, Dict, Any

from encryption import decrypt_token, is_encrypted

logger = logging.getLogger(__name__)

YELP_API_BASE = "https://api.yelp.com/v3"


class YelpFusionAPI:
    def __init__(self, api_key: str, business_alias: str):
        self.api_key = api_key
        self.business_alias = business_alias
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        }

    async def test_connection(self) -> Dict[str, Any]:
        """Test API key + business alias resolve correctly."""
        if not self.business_alias:
            return {"status": "error", "error": "Business alias is missing — set the 'Client ID' to your Yelp business alias"}
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                res = await client.get(
                    f"{YELP_API_BASE}/businesses/{self.business_alias}",
                    headers=self.headers,
                )
                if res.status_code == 200:
                    body = res.json()
                    return {
                        "status": "connected",
                        "business_name": body.get("name"),
                        "business_alias": body.get("alias"),
                        "rating": body.get("rating"),
                        "review_count": body.get("review_count"),
                        "url": body.get("url"),
                    }
                if res.status_code == 401:
                    return {"status": "auth_error", "error": "Invalid Yelp API key"}
                if res.status_code == 404:
                    return {"status": "error", "error": f"Yelp business alias '{self.business_alias}' not found"}
                return {"status": "error", "error": f"Yelp API {res.status_code}: {res.text[:200]}"}
        except Exception as e:
            logger.error(f"Yelp API test failed: {e}")
            return {"status": "error", "error": str(e)}

    async def get_reviews(self, locale: str = "en_US") -> Dict[str, Any]:
        """Fetch up to 3 review excerpts for the configured business."""
        if not self.business_alias:
            return {"reviews": [], "error": "Business alias missing"}
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                res = await client.get(
                    f"{YELP_API_BASE}/businesses/{self.business_alias}/reviews",
                    headers=self.headers,
                    params={"locale": locale},
                )
                if res.status_code != 200:
                    return {"reviews": [], "error": f"Yelp reviews API {res.status_code}: {res.text[:200]}"}
                body = res.json()
                normalized = []
                for r in body.get("reviews", []):
                    user = r.get("user", {}) or {}
                    normalized.append({
                        "platform_review_id": r.get("id"),
                        "reviewer_name": user.get("name"),
                        "reviewer_photo": user.get("image_url"),
                        "rating": int(r.get("rating") or 0),
                        "text": r.get("text") or "",
                        "date": r.get("time_created"),  # ISO-ish "YYYY-MM-DD HH:MM:SS"
                        "url": r.get("url"),
                    })
                return {"reviews": normalized, "total": body.get("total", len(normalized))}
        except Exception as e:
            logger.error(f"Yelp get_reviews failed: {e}")
            return {"reviews": [], "error": str(e)}

    async def reply_to_review(self, review_url: Optional[str] = None, reply_text: Optional[str] = None) -> Dict[str, Any]:
        """Yelp Fusion API does NOT expose a reply endpoint — owners must reply
        manually on yelp.com. We surface a structured 'unsupported' response so
        the UI can show the user a helpful CTA with the original review URL.
        """
        return {
            "status": "unsupported",
            "platform": "yelp",
            "message": "Yelp Fusion API does not allow third-party replies. Please post your reply on Yelp directly.",
            "external_url": review_url or (f"https://www.yelp.com/biz/{self.business_alias}" if self.business_alias else None),
            "external_label": "Reply on Yelp",
        }


async def get_yelp_api(db, client_id: str, branch_id: Optional[str] = None) -> Optional[YelpFusionAPI]:
    """Resolve a configured YelpFusionAPI client for the given client/branch.

    Looks up the saved credentials (api_key + oauth_client_id which stores the
    business alias) and decrypts the api_key before instantiating the client.
    """
    query = {"client_id": client_id, "platform": "yelp"}
    if branch_id:
        query["branch_id"] = branch_id

    creds = await db.platform_credentials.find_one(query)
    if not creds or not creds.get("api_key"):
        return None

    api_key = creds["api_key"]
    if is_encrypted(api_key):
        api_key = decrypt_token(api_key)

    business_alias = (creds.get("oauth_client_id") or "").strip()
    return YelpFusionAPI(api_key=api_key, business_alias=business_alias)
