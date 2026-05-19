"""
Foursquare Places API Integration
Read tips (the closest analog of reviews) for a Foursquare venue.

Auth model: Service API key passed in the Authorization header (no Bearer prefix).
Docs: https://docs.foursquare.com/developer/reference/places-api-overview
"""
import httpx
import logging
from typing import Optional, Dict, Any, List

from encryption import decrypt_token, is_encrypted

logger = logging.getLogger(__name__)

FOURSQUARE_API_BASE = "https://api.foursquare.com/v3"


class FoursquareAPI:
    def __init__(self, api_key: str, fsq_id: str):
        self.api_key = api_key
        self.fsq_id = fsq_id
        # v3 expects the API key in Authorization header without the Bearer prefix.
        self.headers = {
            "Authorization": api_key,
            "Accept": "application/json",
        }

    async def test_connection(self) -> Dict[str, Any]:
        """Resolve the venue to confirm API key + fsq_id are valid."""
        if not self.fsq_id:
            return {"status": "error", "error": "Venue fsq_id missing — set the 'Client ID' to your Foursquare venue fsq_id"}
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                res = await client.get(
                    f"{FOURSQUARE_API_BASE}/places/{self.fsq_id}",
                    headers=self.headers,
                    params={"fields": "fsq_id,name,rating,stats,location"},
                )
                if res.status_code == 200:
                    body = res.json()
                    location = body.get("location") or {}
                    stats = body.get("stats") or {}
                    return {
                        "status": "connected",
                        "venue_name": body.get("name"),
                        "fsq_id": body.get("fsq_id"),
                        "rating": body.get("rating"),  # 0–10 scale
                        "tips_count": stats.get("total_tips") or stats.get("tips_count") or 0,
                        "address": location.get("formatted_address"),
                    }
                if res.status_code in (401, 403):
                    return {"status": "auth_error", "error": "Invalid Foursquare API key"}
                if res.status_code == 404:
                    return {"status": "error", "error": f"Foursquare venue '{self.fsq_id}' not found"}
                return {"status": "error", "error": f"Foursquare API {res.status_code}: {res.text[:200]}"}
        except Exception as e:
            logger.error(f"Foursquare API test failed: {e}")
            return {"status": "error", "error": str(e)}

    async def get_tips(self, limit: int = 50) -> Dict[str, Any]:
        """Fetch tips (review-equivalents) for the configured venue."""
        if not self.fsq_id:
            return {"reviews": [], "error": "Venue fsq_id missing"}
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.get(
                    f"{FOURSQUARE_API_BASE}/places/{self.fsq_id}/tips",
                    headers=self.headers,
                    params={"limit": min(max(limit, 1), 50)},
                )
                if res.status_code != 200:
                    return {"reviews": [], "error": f"Foursquare tips API {res.status_code}: {res.text[:200]}"}
                body = res.json()
                normalized: List[Dict[str, Any]] = []
                # v3 returns either a flat list or {"tips": [...]} depending on endpoint version
                tips = body if isinstance(body, list) else body.get("tips", [])
                for t in tips:
                    user = t.get("user", {}) or {}
                    name = user.get("name") or " ".join(filter(None, [user.get("first_name"), user.get("last_name")])) or "Anonymous"
                    normalized.append({
                        "platform_review_id": t.get("id"),
                        "reviewer_name": name.strip(),
                        "reviewer_photo": user.get("photo"),
                        "rating": None,  # Foursquare tips don't include per-tip ratings
                        "text": (t.get("text") or "").strip(),
                        "date": t.get("created_at"),
                        "agree_count": t.get("agree_count") or 0,
                        "disagree_count": t.get("disagree_count") or 0,
                    })
                return {"reviews": normalized, "total": len(normalized)}
        except Exception as e:
            logger.error(f"Foursquare get_tips failed: {e}")
            return {"reviews": [], "error": str(e)}

    async def reply_to_review(self, review_url: Optional[str] = None, reply_text: Optional[str] = None) -> Dict[str, Any]:
        """Foursquare's Places API does not expose any endpoint for replying to
        tips. We surface a structured 'unsupported' response so the UI can guide
        the user to the Foursquare web venue page for manual engagement.
        """
        external = review_url or (f"https://foursquare.com/v/{self.fsq_id}" if self.fsq_id else "https://foursquare.com")
        return {
            "status": "unsupported",
            "platform": "foursquare",
            "message": "Foursquare tips cannot be replied to via API. Engage with users directly on the Foursquare app or website.",
            "external_url": external,
            "external_label": "Open on Foursquare",
        }


async def get_foursquare_api(db, client_id: str, branch_id: Optional[str] = None) -> Optional[FoursquareAPI]:
    """Resolve a configured FoursquareAPI client for the given client/branch."""
    query = {"client_id": client_id, "platform": "foursquare"}
    if branch_id:
        query["branch_id"] = branch_id

    creds = await db.platform_credentials.find_one(query)
    if not creds or not creds.get("api_key"):
        return None

    api_key = creds["api_key"]
    if is_encrypted(api_key):
        api_key = decrypt_token(api_key)

    fsq_id = (creds.get("oauth_client_id") or "").strip()
    return FoursquareAPI(api_key=api_key, fsq_id=fsq_id)
