"""
LinkedIn API Integration
Publishes posts via LinkedIn UGC Posts API (v2)
"""
import httpx
import logging
from typing import Optional, Dict, Any
from encryption import decrypt_token, is_encrypted

logger = logging.getLogger(__name__)

LINKEDIN_API = "https://api.linkedin.com/v2"


class LinkedInAPI:
    def __init__(self, access_token: str):
        self.access_token = access_token
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0",
        }

    async def get_profile(self) -> Dict[str, Any]:
        """Get authenticated user's LinkedIn profile (to get person URN)"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{LINKEDIN_API}/me",
                    headers=self.headers,
                    params={"projection": "(id,localizedFirstName,localizedLastName)"},
                )
                if response.status_code == 200:
                    data = response.json()
                    return {"status": "connected", "id": data.get("id"), "name": f"{data.get('localizedFirstName', '')} {data.get('localizedLastName', '')}".strip()}
                elif response.status_code == 401:
                    return {"status": "auth_error", "error": "Token expired or invalid"}
                else:
                    return {"status": "error", "error": response.text[:200]}
        except Exception as e:
            logger.error(f"LinkedIn get_profile failed: {e}")
            return {"status": "error", "error": str(e)}

    async def test_connection(self) -> Dict[str, Any]:
        return await self.get_profile()

    async def publish_post(self, text: str, author_urn: str = None) -> Dict[str, Any]:
        """Publish a text post via UGC Posts API"""
        try:
            # Get author URN if not provided
            if not author_urn:
                profile = await self.get_profile()
                if profile.get("status") != "connected":
                    return {"status": "error", "error": profile.get("error", "Could not fetch profile")}
                author_urn = f"urn:li:person:{profile['id']}"

            payload = {
                "author": author_urn,
                "lifecycleState": "PUBLISHED",
                "specificContent": {
                    "com.linkedin.ugc.ShareContent": {
                        "shareCommentary": {"text": text},
                        "shareMediaCategory": "NONE",
                    }
                },
                "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
            }

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{LINKEDIN_API}/ugcPosts",
                    headers=self.headers,
                    json=payload,
                )
                if response.status_code in [200, 201]:
                    data = response.json()
                    return {"status": "success", "post_id": data.get("id")}
                else:
                    error_data = response.json() if response.text else {}
                    return {"status": "error", "error": error_data.get("message", response.text[:200])}
        except Exception as e:
            logger.error(f"LinkedIn publish_post failed: {e}")
            return {"status": "error", "error": str(e)}


async def get_linkedin_api(db, client_id: str, branch_id: str = None) -> Optional[LinkedInAPI]:
    query = {"client_id": client_id, "platform": "linkedin", "status": "connected"}
    if branch_id:
        query["branch_id"] = branch_id

    connection = await db.platform_connections.find_one(query)
    if not connection or not connection.get("access_token"):
        return None

    token = connection["access_token"]
    if is_encrypted(token):
        token = decrypt_token(token)

    return LinkedInAPI(token)
