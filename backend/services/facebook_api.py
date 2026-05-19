"""
Facebook Graph API Integration
Handles fetching posts/comments and posting replies
"""
import httpx
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from encryption import decrypt_token, is_encrypted

logger = logging.getLogger(__name__)

FACEBOOK_GRAPH_API = "https://graph.facebook.com/v18.0"


class FacebookGraphAPI:
    def __init__(self, access_token: str):
        self.access_token = access_token
    
    async def test_connection(self) -> Dict[str, Any]:
        """Test API connectivity by fetching user/page info"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Get user info and pages
                response = await client.get(
                    f"{FACEBOOK_GRAPH_API}/me",
                    params={
                        "access_token": self.access_token,
                        "fields": "id,name,accounts{id,name,access_token,category}"
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    pages_data = data.get("accounts", {}).get("data", [])
                    return {
                        "status": "connected",
                        "user_name": data.get("name"),
                        "user_id": data.get("id"),
                        "pages_count": len(pages_data),
                        "pages": [
                            {
                                "id": p.get("id"),
                                "name": p.get("name"),
                                "category": p.get("category"),
                                "access_token": p.get("access_token"),  # page-level token
                            }
                            for p in pages_data[:10]
                        ],
                    }
                elif response.status_code == 401:
                    return {"status": "auth_error", "error": "Token expired or invalid"}
                else:
                    error_data = response.json()
                    return {"status": "error", "error": error_data.get("error", {}).get("message", response.text[:200])}
        except Exception as e:
            logger.error(f"Facebook API test failed: {e}")
            return {"status": "error", "error": str(e)}
    
    async def get_page_posts(self, page_id: str, page_access_token: str = None, limit: int = 25) -> Dict:
        """Fetch posts from a Facebook page"""
        try:
            token = page_access_token or self.access_token
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{FACEBOOK_GRAPH_API}/{page_id}/posts",
                    params={
                        "access_token": token,
                        "fields": "id,message,created_time,full_picture,permalink_url,shares,reactions.summary(true),comments.summary(true)",
                        "limit": limit
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    posts = []
                    for p in data.get("data", []):
                        post = {
                            "platform_post_id": p.get("id"),
                            "content": p.get("message", ""),
                            "created_time": p.get("created_time"),
                            "image_url": p.get("full_picture"),
                            "permalink": p.get("permalink_url"),
                            "shares_count": p.get("shares", {}).get("count", 0),
                            "reactions_count": p.get("reactions", {}).get("summary", {}).get("total_count", 0),
                            "comments_count": p.get("comments", {}).get("summary", {}).get("total_count", 0),
                            "raw_data": p
                        }
                        posts.append(post)
                    
                    return {
                        "posts": posts,
                        "paging": data.get("paging", {})
                    }
                else:
                    error_data = response.json()
                    return {"error": error_data.get("error", {}).get("message", response.text[:200]), "posts": []}
        except Exception as e:
            logger.error(f"Failed to fetch posts: {e}")
            return {"error": str(e), "posts": []}
    
    async def get_post_comments(self, post_id: str, page_access_token: str = None, limit: int = 50) -> Dict:
        """Fetch comments for a post"""
        try:
            token = page_access_token or self.access_token
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{FACEBOOK_GRAPH_API}/{post_id}/comments",
                    params={
                        "access_token": token,
                        "fields": "id,message,created_time,from{id,name},like_count,comment_count,parent",
                        "limit": limit
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    comments = []
                    for c in data.get("data", []):
                        comment = {
                            "platform_comment_id": c.get("id"),
                            "text": c.get("message", ""),
                            "created_time": c.get("created_time"),
                            "author_name": c.get("from", {}).get("name", "Unknown"),
                            "author_id": c.get("from", {}).get("id"),
                            "like_count": c.get("like_count", 0),
                            "reply_count": c.get("comment_count", 0),
                            "parent_id": c.get("parent", {}).get("id"),
                            "raw_data": c
                        }
                        comments.append(comment)
                    
                    return {
                        "comments": comments,
                        "paging": data.get("paging", {})
                    }
                else:
                    error_data = response.json()
                    return {"error": error_data.get("error", {}).get("message", response.text[:200]), "comments": []}
        except Exception as e:
            logger.error(f"Failed to fetch comments: {e}")
            return {"error": str(e), "comments": []}
    
    async def reply_to_comment(self, comment_id: str, message: str, page_access_token: str = None) -> Dict:
        """Reply to a comment"""
        try:
            token = page_access_token or self.access_token
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{FACEBOOK_GRAPH_API}/{comment_id}/comments",
                    params={"access_token": token},
                    json={"message": message}
                )
                
                if response.status_code in [200, 201]:
                    data = response.json()
                    return {"status": "success", "comment_id": data.get("id")}
                else:
                    error_data = response.json()
                    return {"status": "error", "error": error_data.get("error", {}).get("message", response.text[:200])}
        except Exception as e:
            logger.error(f"Failed to reply to comment: {e}")
            return {"status": "error", "error": str(e)}
    
    async def publish_post(self, page_id: str, message: str, page_access_token: str = None) -> Dict:
        """Publish a text post to a page feed"""
        try:
            token = page_access_token or self.access_token
            payload = {"message": message}

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{FACEBOOK_GRAPH_API}/{page_id}/feed",
                    params={"access_token": token},
                    json=payload,
                )

                if response.status_code in [200, 201]:
                    data = response.json()
                    return {"status": "success", "post_id": data.get("id")}
                else:
                    error_data = response.json()
                    return {"status": "error", "error": error_data.get("error", {}).get("message", response.text[:200])}
        except Exception as e:
            logger.error(f"Failed to publish post: {e}")
            return {"status": "error", "error": str(e)}

    async def publish_post_with_photo(self, page_id: str, message: str, photo_url: str, page_access_token: str = None) -> Dict:
        """Publish a post with a single photo"""
        try:
            token = page_access_token or self.access_token
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{FACEBOOK_GRAPH_API}/{page_id}/photos",
                    params={"access_token": token},
                    json={"message": message, "url": photo_url},
                )
                if response.status_code in [200, 201]:
                    data = response.json()
                    return {"status": "success", "post_id": data.get("post_id") or data.get("id")}
                else:
                    error_data = response.json()
                    return {"status": "error", "error": error_data.get("error", {}).get("message", response.text[:200])}
        except Exception as e:
            logger.error(f"Failed to publish photo post: {e}")
            return {"status": "error", "error": str(e)}

    async def publish_post_with_photos(self, page_id: str, message: str, photo_urls: List[str], page_access_token: str = None) -> Dict:
        """Publish a post with multiple photos (album)"""
        try:
            token = page_access_token or self.access_token
            photo_ids = []

            async with httpx.AsyncClient(timeout=30.0) as client:
                for url in photo_urls:
                    r = await client.post(
                        f"{FACEBOOK_GRAPH_API}/{page_id}/photos",
                        params={"access_token": token},
                        json={"url": url, "published": False},
                    )
                    if r.status_code in [200, 201]:
                        photo_ids.append({"media_fbid": r.json().get("id")})

                if not photo_ids:
                    return await self.publish_post(page_id, message, token)

                import json as _json
                r = await client.post(
                    f"{FACEBOOK_GRAPH_API}/{page_id}/feed",
                    params={"access_token": token},
                    json={"message": message, "attached_media": _json.dumps(photo_ids)},
                )
                if r.status_code in [200, 201]:
                    return {"status": "success", "post_id": r.json().get("id")}
                error_data = r.json()
                return {"status": "error", "error": error_data.get("error", {}).get("message", r.text[:200])}
        except Exception as e:
            logger.error(f"Failed to publish multi-photo post: {e}")
            return {"status": "error", "error": str(e)}
    
    async def delete_comment(self, comment_id: str, page_access_token: str = None) -> Dict:
        """Delete a comment"""
        try:
            token = page_access_token or self.access_token
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.delete(
                    f"{FACEBOOK_GRAPH_API}/{comment_id}",
                    params={"access_token": token}
                )
                
                if response.status_code in [200, 204]:
                    return {"status": "success"}
                else:
                    error_data = response.json()
                    return {"status": "error", "error": error_data.get("error", {}).get("message", response.text[:200])}
        except Exception as e:
            logger.error(f"Failed to delete comment: {e}")
            return {"status": "error", "error": str(e)}


async def get_facebook_api(db, client_id: str, branch_id: str = None) -> Optional[FacebookGraphAPI]:
    """Get configured Facebook API client for a client/branch"""
    query = {"client_id": client_id, "platform": "facebook", "status": "connected"}
    if branch_id:
        query["branch_id"] = branch_id
    
    connection = await db.platform_connections.find_one(query)
    if not connection or not connection.get("access_token"):
        return None
    
    access_token = connection["access_token"]
    if is_encrypted(access_token):
        access_token = decrypt_token(access_token)
    
    return FacebookGraphAPI(access_token)
