"""
X (Twitter) API v2 Integration
Publishes tweets via the v2 Tweets endpoint
"""
import httpx
import logging
from typing import Optional, Dict, Any
from encryption import decrypt_token, is_encrypted

logger = logging.getLogger(__name__)

X_API = "https://api.twitter.com/2"


class XAPI:
    def __init__(self, access_token: str):
        self.access_token = access_token
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

    async def test_connection(self) -> Dict[str, Any]:
        """Test API connectivity by fetching authenticated user info"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{X_API}/users/me",
                    headers=self.headers,
                    params={"user.fields": "id,name,username,public_metrics"},
                )
                if response.status_code == 200:
                    data = response.json().get("data", {})
                    return {
                        "status": "connected",
                        "user_id": data.get("id"),
                        "username": data.get("username"),
                        "name": data.get("name"),
                        "followers": data.get("public_metrics", {}).get("followers_count"),
                    }
                elif response.status_code == 401:
                    return {"status": "auth_error", "error": "Token expired or invalid"}
                else:
                    return {"status": "error", "error": response.text[:200]}
        except Exception as e:
            logger.error(f"X API test failed: {e}")
            return {"status": "error", "error": str(e)}

    async def publish_tweet(self, text: str) -> Dict[str, Any]:
        """Post a tweet (max 280 chars; auto-truncates)"""
        try:
            # Twitter v2 limit
            tweet_text = text[:280]

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{X_API}/tweets",
                    headers=self.headers,
                    json={"text": tweet_text},
                )
                if response.status_code in [200, 201]:
                    data = response.json().get("data", {})
                    return {"status": "success", "tweet_id": data.get("id")}
                else:
                    error_data = response.json() if response.text else {}
                    detail = error_data.get("detail") or error_data.get("errors", [{}])[0].get("message", response.text[:200])
                    return {"status": "error", "error": detail}
        except Exception as e:
            logger.error(f"X publish_tweet failed: {e}")
            return {"status": "error", "error": str(e)}


async def get_x_api(db, client_id: str, branch_id: str = None) -> Optional[XAPI]:
    query = {"client_id": client_id, "platform": "x", "status": "connected"}
    if branch_id:
        query["branch_id"] = branch_id

    connection = await db.platform_connections.find_one(query)
    if not connection or not connection.get("access_token"):
        return None

    token = connection["access_token"]
    if is_encrypted(token):
        token = decrypt_token(token)

    return XAPI(token)
