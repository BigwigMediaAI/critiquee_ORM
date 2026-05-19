"""
YouTube Data API v3 Integration
Handles fetching comments and posting replies
"""
import httpx
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from encryption import decrypt_token, is_encrypted

logger = logging.getLogger(__name__)

YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"


class YouTubeAPI:
    def __init__(self, access_token: str):
        self.access_token = access_token
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
    
    async def test_connection(self) -> Dict[str, Any]:
        """Test API connectivity by fetching channel info"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{YOUTUBE_API_BASE}/channels",
                    headers=self.headers,
                    params={
                        "part": "snippet,statistics",
                        "mine": "true"
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    channels = data.get("items", [])
                    if channels:
                        channel = channels[0]
                        return {
                            "status": "connected",
                            "channel_id": channel.get("id"),
                            "channel_title": channel.get("snippet", {}).get("title"),
                            "subscriber_count": channel.get("statistics", {}).get("subscriberCount"),
                            "video_count": channel.get("statistics", {}).get("videoCount")
                        }
                    return {"status": "connected", "channels": []}
                elif response.status_code == 401:
                    return {"status": "auth_error", "error": "Token expired or invalid"}
                else:
                    error_data = response.json()
                    return {"status": "error", "error": error_data.get("error", {}).get("message", response.text[:200])}
        except Exception as e:
            logger.error(f"YouTube API test failed: {e}")
            return {"status": "error", "error": str(e)}
    
    async def get_channel_videos(self, channel_id: str = None, max_results: int = 25) -> Dict:
        """Get videos from a channel"""
        try:
            params = {
                "part": "snippet",
                "maxResults": max_results,
                "order": "date",
                "type": "video"
            }
            
            if channel_id:
                params["channelId"] = channel_id
            else:
                params["forMine"] = "true"
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{YOUTUBE_API_BASE}/search",
                    headers=self.headers,
                    params=params
                )
                
                if response.status_code == 200:
                    data = response.json()
                    videos = []
                    for item in data.get("items", []):
                        video = {
                            "video_id": item.get("id", {}).get("videoId"),
                            "title": item.get("snippet", {}).get("title"),
                            "description": item.get("snippet", {}).get("description", "")[:200],
                            "published_at": item.get("snippet", {}).get("publishedAt"),
                            "thumbnail": item.get("snippet", {}).get("thumbnails", {}).get("default", {}).get("url"),
                            "channel_title": item.get("snippet", {}).get("channelTitle")
                        }
                        videos.append(video)
                    
                    return {
                        "videos": videos,
                        "next_page_token": data.get("nextPageToken")
                    }
                else:
                    error_data = response.json()
                    return {"error": error_data.get("error", {}).get("message", response.text[:200]), "videos": []}
        except Exception as e:
            logger.error(f"Failed to get videos: {e}")
            return {"error": str(e), "videos": []}
    
    async def get_video_comments(self, video_id: str, max_results: int = 100, page_token: str = None) -> Dict:
        """Fetch comments for a video"""
        try:
            params = {
                "part": "snippet,replies",
                "videoId": video_id,
                "maxResults": max_results,
                "order": "time"
            }
            if page_token:
                params["pageToken"] = page_token
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{YOUTUBE_API_BASE}/commentThreads",
                    headers=self.headers,
                    params=params
                )
                
                if response.status_code == 200:
                    data = response.json()
                    comments = []
                    for item in data.get("items", []):
                        top_comment = item.get("snippet", {}).get("topLevelComment", {})
                        snippet = top_comment.get("snippet", {})
                        
                        comment = {
                            "thread_id": item.get("id"),
                            "comment_id": top_comment.get("id"),
                            "author_name": snippet.get("authorDisplayName"),
                            "author_channel_id": snippet.get("authorChannelId", {}).get("value"),
                            "author_profile_image": snippet.get("authorProfileImageUrl"),
                            "text": snippet.get("textDisplay"),
                            "text_original": snippet.get("textOriginal"),
                            "like_count": snippet.get("likeCount", 0),
                            "published_at": snippet.get("publishedAt"),
                            "updated_at": snippet.get("updatedAt"),
                            "reply_count": item.get("snippet", {}).get("totalReplyCount", 0),
                            "can_reply": item.get("snippet", {}).get("canReply", True),
                            "replies": []
                        }
                        
                        # Include replies if present
                        replies_data = item.get("replies", {}).get("comments", [])
                        for reply in replies_data:
                            reply_snippet = reply.get("snippet", {})
                            comment["replies"].append({
                                "comment_id": reply.get("id"),
                                "author_name": reply_snippet.get("authorDisplayName"),
                                "text": reply_snippet.get("textDisplay"),
                                "like_count": reply_snippet.get("likeCount", 0),
                                "published_at": reply_snippet.get("publishedAt")
                            })
                        
                        comments.append(comment)
                    
                    return {
                        "comments": comments,
                        "next_page_token": data.get("nextPageToken"),
                        "total_results": data.get("pageInfo", {}).get("totalResults", len(comments))
                    }
                elif response.status_code == 403:
                    error_data = response.json()
                    if "commentsDisabled" in str(error_data):
                        return {"comments": [], "error": "Comments are disabled for this video"}
                    return {"error": error_data.get("error", {}).get("message", "Forbidden"), "comments": []}
                else:
                    error_data = response.json()
                    return {"error": error_data.get("error", {}).get("message", response.text[:200]), "comments": []}
        except Exception as e:
            logger.error(f"Failed to fetch comments: {e}")
            return {"error": str(e), "comments": []}
    
    async def reply_to_comment(self, parent_comment_id: str, text: str) -> Dict:
        """Reply to a comment"""
        try:
            payload = {
                "snippet": {
                    "parentId": parent_comment_id,
                    "textOriginal": text
                }
            }
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{YOUTUBE_API_BASE}/comments",
                    headers=self.headers,
                    params={"part": "snippet"},
                    json=payload
                )
                
                if response.status_code in [200, 201]:
                    data = response.json()
                    return {
                        "status": "success",
                        "comment_id": data.get("id"),
                        "data": data
                    }
                else:
                    error_data = response.json()
                    return {"status": "error", "error": error_data.get("error", {}).get("message", response.text[:200])}
        except Exception as e:
            logger.error(f"Failed to reply to comment: {e}")
            return {"status": "error", "error": str(e)}
    
    async def update_comment(self, comment_id: str, text: str) -> Dict:
        """Update an existing comment"""
        try:
            payload = {
                "id": comment_id,
                "snippet": {
                    "textOriginal": text
                }
            }
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.put(
                    f"{YOUTUBE_API_BASE}/comments",
                    headers=self.headers,
                    params={"part": "snippet"},
                    json=payload
                )
                
                if response.status_code == 200:
                    return {"status": "success", "data": response.json()}
                else:
                    error_data = response.json()
                    return {"status": "error", "error": error_data.get("error", {}).get("message", response.text[:200])}
        except Exception as e:
            logger.error(f"Failed to update comment: {e}")
            return {"status": "error", "error": str(e)}
    
    async def delete_comment(self, comment_id: str) -> Dict:
        """Delete a comment"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.delete(
                    f"{YOUTUBE_API_BASE}/comments",
                    headers=self.headers,
                    params={"id": comment_id}
                )
                
                if response.status_code in [200, 204]:
                    return {"status": "success"}
                else:
                    error_data = response.json()
                    return {"status": "error", "error": error_data.get("error", {}).get("message", response.text[:200])}
        except Exception as e:
            logger.error(f"Failed to delete comment: {e}")
            return {"status": "error", "error": str(e)}
    
    async def set_moderation_status(self, comment_id: str, status: str = "published") -> Dict:
        """
        Set moderation status for a comment
        status: published, heldForReview, rejected
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{YOUTUBE_API_BASE}/comments/setModerationStatus",
                    headers=self.headers,
                    params={
                        "id": comment_id,
                        "moderationStatus": status
                    }
                )
                
                if response.status_code in [200, 204]:
                    return {"status": "success"}
                else:
                    error_data = response.json()
                    return {"status": "error", "error": error_data.get("error", {}).get("message", response.text[:200])}
        except Exception as e:
            logger.error(f"Failed to set moderation status: {e}")
            return {"status": "error", "error": str(e)}


async def get_youtube_api(db, client_id: str, branch_id: str = None) -> Optional[YouTubeAPI]:
    """Get configured YouTube API client for a client/branch"""
    query = {"client_id": client_id, "platform": "youtube", "status": "connected"}
    if branch_id:
        query["branch_id"] = branch_id
    
    connection = await db.platform_connections.find_one(query)
    if not connection or not connection.get("access_token"):
        return None
    
    access_token = connection["access_token"]
    if is_encrypted(access_token):
        access_token = decrypt_token(access_token)
    
    return YouTubeAPI(access_token)
