"""
Platform Sync Routes
Handles syncing data from platforms and test connectivity
"""
from fastapi import APIRouter, HTTPException, Depends, Query, BackgroundTasks
from typing import Optional
from database import db
from auth import get_current_user, require_role
from services.google_api import get_google_api
from services.facebook_api import get_facebook_api
from services.youtube_api import get_youtube_api
from services.reddit_api import get_reddit_api
from services.yelp_api import get_yelp_api
from services.trustpilot_api import get_trustpilot_api
from services.foursquare_api import get_foursquare_api
from services.zomato_api import get_zomato_api
from services.justdial_api import get_justdial_api
from routes.notification_routes import create_notification
from datetime import datetime, timezone
import uuid
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


# In-memory short-lived cache for /test/{platform}.
# Repeated Test-button clicks within 60 seconds reuse the cached result rather
# than re-hitting the upstream API — important for rate-limited APIs like
# Google My Business Account Management (default quota: 1 req/min).
_TEST_CACHE: dict = {}
_TEST_CACHE_TTL_SECONDS = 60


def _cache_key(client_id: str, platform: str, branch_id: str | None) -> str:
    return f"{client_id}:{platform}:{branch_id or '_'}"


@router.get("/test/{platform}")
async def test_platform_connection(
    platform: str,
    branch_id: str = Query(None),
    force: bool = Query(False, description="Skip the 60s cache and re-test"),
    current_user=Depends(require_role("business_admin"))
):
    """Test connectivity to a platform API (60s cache to avoid burning rate-limited quotas)."""
    client_id = current_user.get("client_id")

    api_getters = {
        "google": get_google_api,
        "facebook": get_facebook_api,
        "youtube": get_youtube_api,
        "reddit": get_reddit_api,
        "yelp": get_yelp_api,
        "trustpilot": get_trustpilot_api,
        "foursquare": get_foursquare_api,
        "zomato": get_zomato_api,
        "justdial": get_justdial_api,
    }

    if platform not in api_getters:
        raise HTTPException(status_code=400, detail=f"Platform '{platform}' does not support API testing")

    # Cached result short-circuit (per client+branch+platform)
    key = _cache_key(client_id, platform, branch_id)
    now_ts = datetime.now(timezone.utc).timestamp()
    if not force:
        cached = _TEST_CACHE.get(key)
        if cached and cached[1] > now_ts:
            return {**cached[0], "cached": True, "cache_expires_in": int(cached[1] - now_ts)}

    api = await api_getters[platform](db, client_id, branch_id)

    if not api:
        result = {
            "platform": platform,
            "status": "not_connected",
            "message": "Platform not connected or no access token. Please connect via OAuth first.",
        }
        # Don't cache "not_connected" — user might connect & retry quickly
        return result

    result = await api.test_connection()
    response = {"platform": platform, **result}

    # Cache successful AND informative-error responses (auth_error, api_disabled,
    # rate_limited, etc.) so we don't keep hammering the upstream API.
    _TEST_CACHE[key] = (response, now_ts + _TEST_CACHE_TTL_SECONDS)

    # Update last_tested in platform_connections
    query = {"client_id": client_id, "platform": platform}
    if branch_id:
        query["branch_id"] = branch_id

    await db.platform_connections.update_one(
        query,
        {"$set": {"last_tested_at": datetime.now(timezone.utc).isoformat(), "test_result": result}}
    )

    return response


@router.post("/sync/{platform}")
async def sync_platform_data(
    platform: str,
    branch_id: str = Query(None),
    background_tasks: BackgroundTasks = None,
    current_user=Depends(require_role("business_admin"))
):
    """Manually trigger a sync for a platform"""
    client_id = current_user.get("client_id")
    
    # Start sync in background
    if background_tasks:
        background_tasks.add_task(run_platform_sync, client_id, platform, branch_id)
        return {"message": f"Sync started for {platform}", "status": "in_progress"}
    else:
        result = await run_platform_sync(client_id, platform, branch_id)
        return result


async def run_platform_sync(client_id: str, platform: str, branch_id: str = None) -> dict:
    """Run sync for a specific platform"""
    now = datetime.now(timezone.utc).isoformat()
    
    # Update sync status
    query = {"client_id": client_id, "platform": platform}
    if branch_id:
        query["branch_id"] = branch_id
    
    await db.platform_connections.update_one(
        query,
        {"$set": {"sync_status": "syncing", "sync_started_at": now}}
    )
    
    try:
        if platform == "google":
            result = await sync_google_reviews(client_id, branch_id)
        elif platform == "facebook":
            result = await sync_facebook_data(client_id, branch_id)
        elif platform == "youtube":
            result = await sync_youtube_comments(client_id, branch_id)
        elif platform == "reddit":
            result = await sync_reddit_data(client_id, branch_id)
        elif platform == "yelp":
            result = await sync_yelp_reviews(client_id, branch_id)
        elif platform == "trustpilot":
            result = await sync_trustpilot_reviews(client_id, branch_id)
        elif platform == "foursquare":
            result = await sync_foursquare_tips(client_id, branch_id)
        elif platform == "zomato":
            result = await sync_zomato_reviews(client_id, branch_id)
        elif platform == "justdial":
            result = await sync_justdial_reviews(client_id, branch_id)
        else:
            result = {"status": "error", "error": f"Sync not implemented for {platform}"}
        
        # Update sync status
        await db.platform_connections.update_one(
            query,
            {"$set": {
                "sync_status": "completed" if result.get("status") == "success" else "error",
                "last_synced_at": now,
                "sync_result": result
            }}
        )
        
        return result
    except Exception as e:
        logger.error(f"Sync failed for {platform}: {e}")
        await db.platform_connections.update_one(
            query,
            {"$set": {"sync_status": "error", "sync_error": str(e)}}
        )
        return {"status": "error", "error": str(e)}


async def sync_google_reviews(client_id: str, branch_id: str = None) -> dict:
    """Sync reviews from Google Business Profile"""
    api = await get_google_api(db, client_id, branch_id)
    if not api:
        return {"status": "error", "error": "Not connected"}
    
    test = await api.test_connection()
    if test.get("status") != "connected":
        return {"status": "error", "error": test.get("error", "Connection failed")}
    
    synced_count = 0
    errors = []
    now = datetime.now(timezone.utc).isoformat()

    for account in test.get("accounts", []):
        account_id = account.get("id")
        locations = await api.get_locations(account_id)
        
        for location in locations:
            google_location_name = location.get("name")  # accounts/xxx/locations/yyy
            
            # Paginate through ALL reviews
            page_token = None
            while True:
                reviews_data = await api.get_reviews(google_location_name, page_size=50, page_token=page_token)
                
                if reviews_data.get("error"):
                    errors.append(f"Location {google_location_name}: {reviews_data['error']}")
                    break
                
                for review in reviews_data.get("reviews", []):
                    review_doc = {
                        "client_id": client_id,
                        "branch_id": branch_id,
                        "location_id": branch_id,              # internal branch UUID for queries
                        "google_location_name": google_location_name,  # full Google path for API calls
                        "platform": "google",
                        "platform_review_id": review["platform_review_id"],
                        "reviewer_name": review["reviewer_name"],
                        "reviewer_photo": review.get("reviewer_photo"),
                        "rating": review["rating"],
                        "text": review["text"],
                        "date": review["date"],
                        "reply_text": review.get("reply_text"),
                        "reply_time": review.get("reply_time"),
                        "is_seen": False,
                        "status": "new",
                        "synced_at": now
                    }
                    
                    await db.reviews.update_one(
                        {"client_id": client_id, "platform": "google", "platform_review_id": review["platform_review_id"]},
                        {"$set": review_doc, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now}},
                        upsert=True
                    )
                    synced_count += 1
                
                # Check for more pages
                page_token = reviews_data.get("next_page_token")
                if not page_token:
                    break
    
    # Generate notification for new reviews
    if synced_count > 0 and branch_id:
        msg = f"{synced_count} new Google review{'s' if synced_count > 1 else ''} synced"
        await create_notification(client_id, branch_id, msg, "review", "/admin/reviews")
    
    return {
        "status": "success" if not errors else "partial",
        "synced_count": synced_count,
        "errors": errors
    }


async def sync_facebook_data(client_id: str, branch_id: str = None) -> dict:
    """Sync posts and comments from Facebook pages"""
    api = await get_facebook_api(db, client_id, branch_id)
    if not api:
        return {"status": "error", "error": "Not connected"}
    
    test = await api.test_connection()
    if test.get("status") != "connected":
        return {"status": "error", "error": test.get("error", "Connection failed")}
    
    synced_posts = 0
    synced_comments = 0
    errors = []
    now = datetime.now(timezone.utc).isoformat()
    
    for page in test.get("pages", []):
        page_id = page.get("id")
        page_token = page.get("access_token") or api.access_token
        posts_data = await api.get_page_posts(page_id, page_access_token=page_token)
        
        if posts_data.get("error"):
            errors.append(f"Page {page_id}: {posts_data['error']}")
            continue
        
        for post in posts_data.get("posts", []):
            post_doc = {
                "client_id": client_id,
                "branch_id": branch_id,
                "location_id": branch_id,              # internal UUID for queries
                "platform_location_id": page_id,       # Facebook page ID
                "platform": "facebook",
                "platform_post_id": post["platform_post_id"],
                "content": post["content"],
                "posted_at": post["created_time"],
                "media_urls": [post["image_url"]] if post.get("image_url") else [],
                "permalink": post.get("permalink"),
                "likes_count": post.get("reactions_count", 0),
                "comments_count": post.get("comments_count", 0),
                "shares_count": post.get("shares_count", 0),
                "is_seen": False,
                "synced_at": now
            }
            
            await db.social_posts.update_one(
                {"client_id": client_id, "platform": "facebook", "platform_post_id": post["platform_post_id"]},
                {"$set": post_doc, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now}},
                upsert=True
            )
            synced_posts += 1
            
            # Fetch the internal ID of the upserted post for use in comments
            saved_post = await db.social_posts.find_one(
                {"client_id": client_id, "platform": "facebook", "platform_post_id": post["platform_post_id"]},
                {"id": 1}
            )
            internal_post_id = saved_post["id"] if saved_post else post["platform_post_id"]
            
            comments_data = await api.get_post_comments(post["platform_post_id"], page_access_token=page_token)
            for comment in comments_data.get("comments", []):
                comment_doc = {
                    "client_id": client_id,
                    "branch_id": branch_id,
                    "location_id": branch_id,
                    "platform": "facebook",
                    "post_id": internal_post_id,   # internal post ID for queries
                    "platform_post_id": post["platform_post_id"],
                    "platform_comment_id": comment["platform_comment_id"],
                    "author_name": comment["author_name"],
                    "author_id": comment.get("author_id"),
                    "text": comment["text"],
                    "posted_at": comment["created_time"],
                    "like_count": comment.get("like_count", 0),
                    "is_seen": False,
                    "status": "new",
                    "synced_at": now
                }
                
                await db.social_comments.update_one(
                    {"client_id": client_id, "platform": "facebook", "platform_comment_id": comment["platform_comment_id"]},
                    {"$set": comment_doc, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now}},
                    upsert=True
                )
                synced_comments += 1
    
    # Generate notifications for new Facebook data
    if (synced_posts > 0 or synced_comments > 0) and branch_id:
        parts = []
        if synced_posts > 0:
            parts.append(f"{synced_posts} post{'s' if synced_posts > 1 else ''}")
        if synced_comments > 0:
            parts.append(f"{synced_comments} comment{'s' if synced_comments > 1 else ''}")
        msg = f"Facebook sync: {' and '.join(parts)} synced"
        await create_notification(client_id, branch_id, msg, "comment", "/admin/social")

    return {
        "status": "success" if not errors else "partial",
        "synced_posts": synced_posts,
        "synced_comments": synced_comments,
        "errors": errors
    }


async def sync_youtube_comments(client_id: str, branch_id: str = None) -> dict:
    """Sync comments from YouTube videos"""
    api = await get_youtube_api(db, client_id, branch_id)
    if not api:
        return {"status": "error", "error": "Not connected"}
    
    test = await api.test_connection()
    if test.get("status") != "connected":
        return {"status": "error", "error": test.get("error", "Connection failed")}
    
    synced_videos = 0
    synced_comments = 0
    errors = []
    now = datetime.now(timezone.utc).isoformat()
    
    videos_data = await api.get_channel_videos()
    
    for video in videos_data.get("videos", []):
        video_id = video.get("video_id")
        if not video_id:
            continue
        
        post_doc = {
            "client_id": client_id,
            "branch_id": branch_id,
            "location_id": branch_id,              # internal UUID for queries
            "platform": "youtube",
            "platform_post_id": video_id,
            "content": video.get("title", ""),
            "posted_at": video.get("published_at"),
            "media_urls": [video.get("thumbnail")] if video.get("thumbnail") else [],
            "is_seen": False,
            "synced_at": now
        }
        
        await db.social_posts.update_one(
            {"client_id": client_id, "platform": "youtube", "platform_post_id": video_id},
            {"$set": post_doc, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now}},
            upsert=True
        )
        synced_videos += 1
        
        # Fetch internal ID for comment linking
        saved_post = await db.social_posts.find_one(
            {"client_id": client_id, "platform": "youtube", "platform_post_id": video_id},
            {"id": 1}
        )
        internal_post_id = saved_post["id"] if saved_post else video_id
        
        comments_data = await api.get_video_comments(video_id)
        
        if comments_data.get("error"):
            if "disabled" not in comments_data.get("error", "").lower():
                errors.append(f"Video {video_id}: {comments_data['error']}")
            continue
        
        for comment in comments_data.get("comments", []):
            comment_doc = {
                "client_id": client_id,
                "branch_id": branch_id,
                "location_id": branch_id,
                "platform": "youtube",
                "post_id": internal_post_id,       # internal post ID for queries
                "platform_post_id": video_id,
                "thread_id": comment.get("thread_id"),
                "platform_comment_id": comment["comment_id"],
                "author_name": comment["author_name"],
                "author_channel_id": comment.get("author_channel_id"),
                "author_profile_image": comment.get("author_profile_image"),
                "text": comment["text"],
                "posted_at": comment["published_at"],
                "like_count": comment.get("like_count", 0),
                "reply_count": comment.get("reply_count", 0),
                "is_seen": False,
                "status": "new",
                "synced_at": now
            }
            
            await db.social_comments.update_one(
                {"client_id": client_id, "platform": "youtube", "platform_comment_id": comment["comment_id"]},
                {"$set": comment_doc, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now}},
                upsert=True
            )
            synced_comments += 1
    
    # Generate notifications for new YouTube data
    if (synced_videos > 0 or synced_comments > 0) and branch_id:
        parts = []
        if synced_videos > 0:
            parts.append(f"{synced_videos} video{'s' if synced_videos > 1 else ''}")
        if synced_comments > 0:
            parts.append(f"{synced_comments} comment{'s' if synced_comments > 1 else ''}")
        msg = f"YouTube sync: {' and '.join(parts)} synced"
        await create_notification(client_id, branch_id, msg, "comment", "/admin/social")

    return {
        "status": "success" if not errors else "partial",
        "synced_videos": synced_videos,
        "synced_comments": synced_comments,
        "errors": errors
    }


async def sync_reddit_data(client_id: str, branch_id: str = None) -> dict:
    """Sync posts and comments from Reddit"""
    api = await get_reddit_api(db, client_id, branch_id)
    if not api:
        return {"status": "error", "error": "Not connected"}
    
    test = await api.test_connection()
    if test.get("status") != "connected":
        return {"status": "error", "error": test.get("error", "Connection failed")}
    
    # Get user's own comments (for tracking replies)
    synced_comments = 0
    
    comments_data = await api.get_user_comments()
    for comment in comments_data.get("comments", []):
        comment_doc = {
            "client_id": client_id,
            "branch_id": branch_id,
            "platform": "reddit",
            "platform_comment_id": comment.get("comment_id"),
            "subreddit": comment.get("subreddit"),
            "text": comment.get("body"),
            "posted_at": datetime.fromtimestamp(comment.get("created_utc", 0), tz=timezone.utc).isoformat(),
            "score": comment.get("score", 0),
            "is_own": True,
            "is_seen": True,
            "synced_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.social_comments.update_one(
            {"client_id": client_id, "platform": "reddit", "platform_comment_id": comment["comment_id"]},
            {"$set": comment_doc, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True
        )
        synced_comments += 1
    
    # Generate notification for Reddit sync
    if synced_comments > 0 and branch_id:
        msg = f"Reddit sync: {synced_comments} comment{'s' if synced_comments > 1 else ''} synced"
        await create_notification(client_id, branch_id, msg, "comment", "/admin/social")

    return {
        "status": "success",
        "username": test.get("username"),
        "synced_comments": synced_comments
    }


# Platforms whose reviews land in `db.reviews` but which do NOT expose any
# public reply-to-review API. Reviews from these platforms are flagged with
# `platform_reply_unsupported=True` at sync time so the UI surfaces the
# "Manual reply needed" badge + an external CTA from day one.
_REPLY_UNSUPPORTED_AT_SYNC = {
    "yelp": {
        "message": "Yelp Fusion API does not allow third-party replies. Reply on yelp.com.",
        "external_label": "Open on Yelp",
    },
    "foursquare": {
        "message": "Foursquare tips cannot be replied to via API. Engage on Foursquare.",
        "external_label": "Open on Foursquare",
    },
    "zomato": {
        "message": "Zomato does not allow third-party replies via API. Use the Zomato Business app to respond.",
        "external_label": "Open on Zomato Business",
    },
    "justdial": {
        "message": "JustDial does not allow third-party replies via API. Use the JustDial Business dashboard to respond.",
        "external_label": "Open on JustDial Business",
    },
}


async def _upsert_review(client_id: str, branch_id: Optional[str], platform: str, review: dict, now_iso: str) -> bool:
    """Upsert a review document into db.reviews. Returns True if a NEW review was inserted."""
    pid = review.get("platform_review_id")
    if not pid:
        return False
    review_doc = {
        "client_id": client_id,
        "branch_id": branch_id,
        "location_id": branch_id,
        "platform": platform,
        "platform_review_id": pid,
        "reviewer_name": review.get("reviewer_name"),
        "reviewer_photo": review.get("reviewer_photo"),
        "rating": review.get("rating"),
        "text": review.get("text") or "",
        "date": review.get("date"),
        "title": review.get("title"),
        "url": review.get("url"),
        "is_seen": False,
        "status": "new",
        "synced_at": now_iso,
    }
    # Pre-set reply-unsupported metadata for read-only review platforms so
    # the manual-reply badge shows up immediately, even before the admin
    # attempts a reply.
    unsupported = _REPLY_UNSUPPORTED_AT_SYNC.get(platform)
    if unsupported:
        review_doc["platform_reply_unsupported"] = True
        review_doc["platform_reply_message"] = unsupported["message"]
        review_doc["platform_external_label"] = unsupported["external_label"]
        if review.get("url"):
            review_doc["platform_external_url"] = review["url"]
    res = await db.reviews.update_one(
        {"client_id": client_id, "platform": platform, "platform_review_id": pid},
        {"$set": review_doc, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now_iso}},
        upsert=True,
    )
    return bool(res.upserted_id)


async def sync_yelp_reviews(client_id: str, branch_id: Optional[str] = None) -> dict:
    """Sync the latest review excerpts from Yelp Fusion."""
    api = await get_yelp_api(db, client_id, branch_id)
    if not api:
        return {"status": "error", "error": "Yelp not configured (missing API key or business alias)"}

    test = await api.test_connection()
    if test.get("status") != "connected":
        return {"status": "error", "error": test.get("error", "Yelp connection failed")}

    reviews_data = await api.get_reviews()
    if reviews_data.get("error"):
        return {"status": "error", "error": reviews_data["error"]}

    now = datetime.now(timezone.utc).isoformat()
    new_count = 0
    total = 0
    for r in reviews_data.get("reviews", []):
        total += 1
        if await _upsert_review(client_id, branch_id, "yelp", r, now):
            new_count += 1

    if new_count > 0 and branch_id:
        msg = f"Yelp sync: {new_count} new review{'s' if new_count > 1 else ''} synced"
        await create_notification(client_id, branch_id, msg, "review", "/admin/reviews")

    return {
        "status": "success",
        "business_name": test.get("business_name"),
        "rating": test.get("rating"),
        "synced_count": total,
        "new_count": new_count,
    }


async def sync_trustpilot_reviews(client_id: str, branch_id: Optional[str] = None) -> dict:
    """Sync reviews from Trustpilot for the configured Business Unit."""
    api = await get_trustpilot_api(db, client_id, branch_id)
    if not api:
        return {"status": "error", "error": "Trustpilot not configured (missing API key or Business Unit ID)"}

    test = await api.test_connection()
    if test.get("status") != "connected":
        return {"status": "error", "error": test.get("error", "Trustpilot connection failed")}

    now = datetime.now(timezone.utc).isoformat()
    new_count = 0
    total = 0
    page = 1
    # Cap to a few pages per sync to stay within rate limits
    while page <= 5:
        reviews_data = await api.get_reviews(page=page, per_page=100)
        if reviews_data.get("error"):
            if page == 1:
                return {"status": "error", "error": reviews_data["error"]}
            break
        batch = reviews_data.get("reviews", [])
        if not batch:
            break
        for r in batch:
            total += 1
            if await _upsert_review(client_id, branch_id, "trustpilot", r, now):
                new_count += 1
        if len(batch) < 100:
            break
        page += 1

    if new_count > 0 and branch_id:
        msg = f"Trustpilot sync: {new_count} new review{'s' if new_count > 1 else ''} synced"
        await create_notification(client_id, branch_id, msg, "review", "/admin/reviews")

    return {
        "status": "success",
        "business_name": test.get("business_name"),
        "trust_score": test.get("trust_score"),
        "synced_count": total,
        "new_count": new_count,
    }


async def sync_foursquare_tips(client_id: str, branch_id: Optional[str] = None) -> dict:
    """Sync tips (review-equivalents) from Foursquare for the configured venue."""
    api = await get_foursquare_api(db, client_id, branch_id)
    if not api:
        return {"status": "error", "error": "Foursquare not configured (missing API key or venue fsq_id)"}

    test = await api.test_connection()
    if test.get("status") != "connected":
        return {"status": "error", "error": test.get("error", "Foursquare connection failed")}

    tips_data = await api.get_tips(limit=50)
    if tips_data.get("error"):
        return {"status": "error", "error": tips_data["error"]}

    now = datetime.now(timezone.utc).isoformat()
    new_count = 0
    total = 0
    for r in tips_data.get("reviews", []):
        total += 1
        if await _upsert_review(client_id, branch_id, "foursquare", r, now):
            new_count += 1

    if new_count > 0 and branch_id:
        msg = f"Foursquare sync: {new_count} new tip{'s' if new_count > 1 else ''} synced"
        await create_notification(client_id, branch_id, msg, "review", "/admin/reviews")

    return {
        "status": "success",
        "venue_name": test.get("venue_name"),
        "rating": test.get("rating"),
        "synced_count": total,
        "new_count": new_count,
    }


async def sync_zomato_reviews(client_id: str, branch_id: Optional[str] = None) -> dict:
    """Sync reviews from Zomato for the configured restaurant via the
    Restaurant Partner API. Reply-back is graceful-degraded (see service)."""
    api = await get_zomato_api(db, client_id, branch_id)
    if not api:
        return {"status": "error", "error": "Zomato not configured (missing partner key or restaurant ID)"}

    test = await api.test_connection()
    if test.get("status") != "connected":
        return {"status": "error", "error": test.get("error", "Zomato connection failed")}

    reviews_data = await api.get_reviews(limit=50)
    if reviews_data.get("error"):
        return {"status": "error", "error": reviews_data["error"]}

    now = datetime.now(timezone.utc).isoformat()
    new_count = 0
    total = 0
    for r in reviews_data.get("reviews", []):
        total += 1
        if await _upsert_review(client_id, branch_id, "zomato", r, now):
            new_count += 1

    if new_count > 0 and branch_id:
        msg = f"Zomato sync: {new_count} new review{'s' if new_count > 1 else ''} synced"
        await create_notification(client_id, branch_id, msg, "review", "/admin/reviews")

    return {
        "status": "success",
        "restaurant_name": test.get("restaurant_name"),
        "rating": test.get("rating"),
        "synced_count": total,
        "new_count": new_count,
    }


async def sync_justdial_reviews(client_id: str, branch_id: Optional[str] = None) -> dict:
    """Sync reviews from JustDial Business Connect for the configured listing.
    Reply-back is graceful-degraded (see service)."""
    api = await get_justdial_api(db, client_id, branch_id)
    if not api:
        return {"status": "error", "error": "JustDial not configured (missing partner key or listing ID)"}

    test = await api.test_connection()
    if test.get("status") != "connected":
        return {"status": "error", "error": test.get("error", "JustDial connection failed")}

    reviews_data = await api.get_reviews(limit=50)
    if reviews_data.get("error"):
        return {"status": "error", "error": reviews_data["error"]}

    now = datetime.now(timezone.utc).isoformat()
    new_count = 0
    total = 0
    for r in reviews_data.get("reviews", []):
        total += 1
        if await _upsert_review(client_id, branch_id, "justdial", r, now):
            new_count += 1

    if new_count > 0 and branch_id:
        msg = f"JustDial sync: {new_count} new review{'s' if new_count > 1 else ''} synced"
        await create_notification(client_id, branch_id, msg, "review", "/admin/reviews")

    return {
        "status": "success",
        "listing_name": test.get("listing_name"),
        "rating": test.get("rating"),
        "synced_count": total,
        "new_count": new_count,
    }


@router.get("/status")
async def get_sync_status(
    branch_id: str = Query(None),
    current_user=Depends(get_current_user)
):
    """Get sync status for all platforms"""
    client_id = current_user.get("client_id")
    if not client_id:
        raise HTTPException(status_code=403, detail="No client context")
    
    query = {"client_id": client_id, "status": "connected"}
    if branch_id:
        query["branch_id"] = branch_id
    
    connections = await db.platform_connections.find(
        query,
        {"_id": 0, "access_token": 0, "refresh_token": 0}
    ).to_list(100)
    
    return {"platforms": connections}
