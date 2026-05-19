"""
Reddit API Integration
Handles fetching posts/comments and posting replies
"""
import httpx
import base64
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from encryption import decrypt_token, is_encrypted

logger = logging.getLogger(__name__)

REDDIT_API_BASE = "https://oauth.reddit.com"
REDDIT_AUTH_BASE = "https://www.reddit.com"


class RedditAPI:
    def __init__(self, access_token: str, user_agent: str = "Critiquee:v1.0 (by /u/critiquee)"):
        self.access_token = access_token
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "User-Agent": user_agent
        }
    
    async def test_connection(self) -> Dict[str, Any]:
        """Test API connectivity by fetching user info"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{REDDIT_API_BASE}/api/v1/me",
                    headers=self.headers
                )
                
                if response.status_code == 200:
                    data = response.json()
                    return {
                        "status": "connected",
                        "username": data.get("name"),
                        "karma": {
                            "link": data.get("link_karma", 0),
                            "comment": data.get("comment_karma", 0)
                        },
                        "is_mod": data.get("is_mod", False),
                        "created_utc": data.get("created_utc")
                    }
                elif response.status_code == 401:
                    return {"status": "auth_error", "error": "Token expired or invalid"}
                else:
                    return {"status": "error", "error": response.text[:200]}
        except Exception as e:
            logger.error(f"Reddit API test failed: {e}")
            return {"status": "error", "error": str(e)}
    
    async def get_subreddit_posts(self, subreddit: str, sort: str = "new", limit: int = 25, time_filter: str = "all") -> Dict:
        """Fetch posts from a subreddit"""
        try:
            params = {
                "limit": limit,
                "t": time_filter  # hour, day, week, month, year, all
            }
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{REDDIT_API_BASE}/r/{subreddit}/{sort}",
                    headers=self.headers,
                    params=params
                )
                
                if response.status_code == 200:
                    data = response.json()
                    posts = []
                    for child in data.get("data", {}).get("children", []):
                        post_data = child.get("data", {})
                        post = {
                            "post_id": post_data.get("id"),
                            "name": post_data.get("name"),  # fullname like t3_abc123
                            "title": post_data.get("title"),
                            "author": post_data.get("author"),
                            "selftext": post_data.get("selftext", ""),
                            "url": post_data.get("url"),
                            "permalink": f"https://reddit.com{post_data.get('permalink', '')}",
                            "score": post_data.get("score", 0),
                            "upvote_ratio": post_data.get("upvote_ratio", 0),
                            "num_comments": post_data.get("num_comments", 0),
                            "created_utc": post_data.get("created_utc"),
                            "subreddit": post_data.get("subreddit"),
                            "is_self": post_data.get("is_self", False),
                            "thumbnail": post_data.get("thumbnail")
                        }
                        posts.append(post)
                    
                    return {
                        "posts": posts,
                        "after": data.get("data", {}).get("after"),
                        "before": data.get("data", {}).get("before")
                    }
                elif response.status_code == 403:
                    return {"error": "Subreddit is private or quarantined", "posts": []}
                else:
                    return {"error": response.text[:200], "posts": []}
        except Exception as e:
            logger.error(f"Failed to fetch subreddit posts: {e}")
            return {"error": str(e), "posts": []}
    
    async def get_post_comments(self, subreddit: str, post_id: str, sort: str = "best", limit: int = 100) -> Dict:
        """Fetch comments for a post"""
        try:
            params = {
                "sort": sort,
                "limit": limit,
                "depth": 5
            }
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{REDDIT_API_BASE}/r/{subreddit}/comments/{post_id}",
                    headers=self.headers,
                    params=params
                )
                
                if response.status_code == 200:
                    data = response.json()
                    # Reddit returns [post, comments] array
                    comments_data = data[1] if len(data) > 1 else {"data": {"children": []}}
                    
                    comments = self._parse_comments(comments_data.get("data", {}).get("children", []))
                    
                    return {"comments": comments}
                else:
                    return {"error": response.text[:200], "comments": []}
        except Exception as e:
            logger.error(f"Failed to fetch comments: {e}")
            return {"error": str(e), "comments": []}
    
    def _parse_comments(self, children: List, depth: int = 0) -> List[Dict]:
        """Recursively parse comment tree"""
        comments = []
        for child in children:
            if child.get("kind") != "t1":  # t1 = comment
                continue
            
            comment_data = child.get("data", {})
            comment = {
                "comment_id": comment_data.get("id"),
                "name": comment_data.get("name"),  # fullname like t1_abc123
                "author": comment_data.get("author"),
                "body": comment_data.get("body", ""),
                "body_html": comment_data.get("body_html", ""),
                "score": comment_data.get("score", 0),
                "created_utc": comment_data.get("created_utc"),
                "permalink": f"https://reddit.com{comment_data.get('permalink', '')}",
                "is_submitter": comment_data.get("is_submitter", False),
                "depth": depth,
                "parent_id": comment_data.get("parent_id"),
                "replies": []
            }
            
            # Parse nested replies
            replies = comment_data.get("replies")
            if replies and isinstance(replies, dict):
                reply_children = replies.get("data", {}).get("children", [])
                comment["replies"] = self._parse_comments(reply_children, depth + 1)
            
            comments.append(comment)
        
        return comments
    
    async def reply_to_comment(self, parent_fullname: str, text: str) -> Dict:
        """
        Reply to a comment or post
        parent_fullname: t1_xxx for comment, t3_xxx for post
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{REDDIT_API_BASE}/api/comment",
                    headers=self.headers,
                    data={
                        "thing_id": parent_fullname,
                        "text": text,
                        "api_type": "json"
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    json_data = data.get("json", {})
                    errors = json_data.get("errors", [])
                    
                    if errors:
                        return {"status": "error", "error": str(errors)}
                    
                    # Get the new comment data
                    things = json_data.get("data", {}).get("things", [])
                    if things:
                        new_comment = things[0].get("data", {})
                        return {
                            "status": "success",
                            "comment_id": new_comment.get("id"),
                            "name": new_comment.get("name")
                        }
                    return {"status": "success"}
                else:
                    return {"status": "error", "error": response.text[:200]}
        except Exception as e:
            logger.error(f"Failed to reply: {e}")
            return {"status": "error", "error": str(e)}
    
    async def edit_comment(self, thing_id: str, text: str) -> Dict:
        """Edit a comment or post"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{REDDIT_API_BASE}/api/editusertext",
                    headers=self.headers,
                    data={
                        "thing_id": thing_id,
                        "text": text,
                        "api_type": "json"
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    errors = data.get("json", {}).get("errors", [])
                    if errors:
                        return {"status": "error", "error": str(errors)}
                    return {"status": "success"}
                else:
                    return {"status": "error", "error": response.text[:200]}
        except Exception as e:
            logger.error(f"Failed to edit: {e}")
            return {"status": "error", "error": str(e)}
    
    async def delete_comment(self, thing_id: str) -> Dict:
        """Delete a comment or post"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{REDDIT_API_BASE}/api/del",
                    headers=self.headers,
                    data={"id": thing_id}
                )
                
                if response.status_code == 200:
                    return {"status": "success"}
                else:
                    return {"status": "error", "error": response.text[:200]}
        except Exception as e:
            logger.error(f"Failed to delete: {e}")
            return {"status": "error", "error": str(e)}
    
    async def submit_post(self, subreddit: str, title: str, text: str = None, url: str = None) -> Dict:
        """Submit a new post to a subreddit"""
        try:
            data = {
                "sr": subreddit,
                "title": title,
                "api_type": "json"
            }
            
            if url:
                data["kind"] = "link"
                data["url"] = url
            else:
                data["kind"] = "self"
                data["text"] = text or ""
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{REDDIT_API_BASE}/api/submit",
                    headers=self.headers,
                    data=data
                )
                
                if response.status_code == 200:
                    result = response.json()
                    json_data = result.get("json", {})
                    errors = json_data.get("errors", [])
                    
                    if errors:
                        return {"status": "error", "error": str(errors)}
                    
                    post_data = json_data.get("data", {})
                    return {
                        "status": "success",
                        "post_id": post_data.get("id"),
                        "name": post_data.get("name"),
                        "url": post_data.get("url")
                    }
                else:
                    return {"status": "error", "error": response.text[:200]}
        except Exception as e:
            logger.error(f"Failed to submit post: {e}")
            return {"status": "error", "error": str(e)}
    
    async def get_user_comments(self, username: str = None, limit: int = 25) -> Dict:
        """Get comments by a user (or self if username is None)"""
        try:
            endpoint = f"{REDDIT_API_BASE}/user/{username}/comments" if username else f"{REDDIT_API_BASE}/user/me/comments"
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    endpoint,
                    headers=self.headers,
                    params={"limit": limit}
                )
                
                if response.status_code == 200:
                    data = response.json()
                    comments = []
                    for child in data.get("data", {}).get("children", []):
                        comment_data = child.get("data", {})
                        comments.append({
                            "comment_id": comment_data.get("id"),
                            "body": comment_data.get("body"),
                            "score": comment_data.get("score"),
                            "subreddit": comment_data.get("subreddit"),
                            "link_title": comment_data.get("link_title"),
                            "created_utc": comment_data.get("created_utc")
                        })
                    return {"comments": comments}
                else:
                    return {"error": response.text[:200], "comments": []}
        except Exception as e:
            logger.error(f"Failed to get user comments: {e}")
            return {"error": str(e), "comments": []}


async def get_reddit_api(db, client_id: str, branch_id: str = None) -> Optional[RedditAPI]:
    """Get configured Reddit API client for a client/branch"""
    query = {"client_id": client_id, "platform": "reddit", "status": "connected"}
    if branch_id:
        query["branch_id"] = branch_id
    
    connection = await db.platform_connections.find_one(query)
    if not connection or not connection.get("access_token"):
        return None
    
    access_token = connection["access_token"]
    if is_encrypted(access_token):
        access_token = decrypt_token(access_token)
    
    return RedditAPI(access_token)
