from fastapi import APIRouter, HTTPException, Depends, Query
from database import db
from auth import get_current_user, require_role
from models import ScheduledPostCreate, ScheduledPostUpdate
from services.publisher import publish_to_platform
from datetime import datetime, timezone
import uuid
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/")
async def get_scheduled_posts(
    branch_id: str = Query(None),
    status: str = Query(None),
    page: int = Query(1),
    limit: int = Query(20),
    current_user=Depends(get_current_user)
):
    """Get all scheduled posts for a client/branch"""
    client_id = current_user.get("client_id")
    if not client_id:
        raise HTTPException(status_code=403, detail="No client context")
    
    query = {"client_id": client_id}
    if branch_id:
        query["branch_id"] = branch_id
    if status:
        query["status"] = status
    
    skip = (page - 1) * limit
    posts = await db.scheduled_posts.find(query, {"_id": 0}).sort("scheduled_at", 1).skip(skip).limit(limit).to_list(limit)
    total = await db.scheduled_posts.count_documents(query)
    
    return {"posts": posts, "total": total, "page": page}


@router.post("/")
async def create_scheduled_post(
    req: ScheduledPostCreate,
    current_user=Depends(require_role("business_admin"))
):
    """Create a new scheduled post"""
    client_id = current_user.get("client_id")
    
    if not req.platforms or len(req.platforms) == 0:
        raise HTTPException(status_code=400, detail="At least one platform is required")
    
    if not req.content.strip():
        raise HTTPException(status_code=400, detail="Post content is required")
    
    # Validate scheduled_at is in the future
    try:
        scheduled_dt = datetime.fromisoformat(req.scheduled_at.replace('Z', '+00:00'))
        if scheduled_dt <= datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Scheduled time must be in the future")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid datetime format")
    
    now = datetime.now(timezone.utc).isoformat()
    
    post = {
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "branch_id": req.branch_id,
        "platforms": req.platforms,
        "content": req.content,
        "image_urls": req.image_urls or [],
        "scheduled_at": req.scheduled_at,
        "status": "scheduled",  # scheduled, publishing, published, failed, cancelled
        "created_by": current_user.get("user_id"),
        "created_at": now,
        "updated_at": now,
        "publish_results": {}  # Store per-platform results
    }
    
    await db.scheduled_posts.insert_one(post)
    post.pop("_id", None)
    
    return post


@router.get("/{post_id}")
async def get_scheduled_post(post_id: str, current_user=Depends(get_current_user)):
    """Get a single scheduled post"""
    client_id = current_user.get("client_id")
    post = await db.scheduled_posts.find_one({"id": post_id, "client_id": client_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Scheduled post not found")
    return post


@router.put("/{post_id}")
async def update_scheduled_post(
    post_id: str,
    req: ScheduledPostUpdate,
    current_user=Depends(require_role("business_admin"))
):
    """Update a scheduled post (only if still scheduled)"""
    client_id = current_user.get("client_id")
    
    post = await db.scheduled_posts.find_one({"id": post_id, "client_id": client_id})
    if not post:
        raise HTTPException(status_code=404, detail="Scheduled post not found")
    
    if post["status"] not in ["scheduled", "failed"]:
        raise HTTPException(status_code=400, detail="Cannot update post that is not scheduled")
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if req.content is not None:
        update_data["content"] = req.content
    if req.scheduled_at is not None:
        # Validate new time is in future
        try:
            scheduled_dt = datetime.fromisoformat(req.scheduled_at.replace('Z', '+00:00'))
            if scheduled_dt <= datetime.now(timezone.utc):
                raise HTTPException(status_code=400, detail="Scheduled time must be in the future")
            update_data["scheduled_at"] = req.scheduled_at
            update_data["status"] = "scheduled"  # Reset status if rescheduling
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid datetime format")
    if req.platforms is not None:
        update_data["platforms"] = req.platforms
    if req.status is not None and req.status in ["scheduled", "cancelled"]:
        update_data["status"] = req.status
    
    await db.scheduled_posts.update_one({"id": post_id}, {"$set": update_data})
    return {"message": "Scheduled post updated"}


@router.delete("/{post_id}")
async def delete_scheduled_post(post_id: str, current_user=Depends(require_role("business_admin"))):
    """Delete/cancel a scheduled post"""
    client_id = current_user.get("client_id")
    
    post = await db.scheduled_posts.find_one({"id": post_id, "client_id": client_id})
    if not post:
        raise HTTPException(status_code=404, detail="Scheduled post not found")
    
    if post["status"] == "published":
        raise HTTPException(status_code=400, detail="Cannot delete already published post")
    
    await db.scheduled_posts.delete_one({"id": post_id})
    return {"message": "Scheduled post deleted"}


@router.post("/{post_id}/publish-now")
async def publish_now(post_id: str, current_user=Depends(require_role("business_admin"))):
    """Immediately publish a scheduled post"""
    client_id = current_user.get("client_id")
    
    post = await db.scheduled_posts.find_one({"id": post_id, "client_id": client_id})
    if not post:
        raise HTTPException(status_code=404, detail="Scheduled post not found")
    
    if post["status"] not in ["scheduled", "failed"]:
        raise HTTPException(status_code=400, detail="Post cannot be published")
    
    # Update status to publishing
    await db.scheduled_posts.update_one(
        {"id": post_id},
        {"$set": {"status": "publishing", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    now = datetime.now(timezone.utc).isoformat()
    results = {}
    branch_id = post.get("branch_id")

    for platform in post["platforms"]:
        pub = await publish_to_platform(
            db, client_id, branch_id, platform,
            post["content"], post.get("image_urls") or []
        )

        if pub["status"] == "published":
            results[platform] = {"status": "success", "published_at": now, "platform_post_id": pub.get("platform_post_id"), "note": pub.get("note")}
            # Record the social post
            social_post = {
                "id": str(uuid.uuid4()),
                "client_id": client_id,
                "branch_id": branch_id,
                "location_id": branch_id,
                "platform": platform,
                "content": post["content"],
                "platform_post_id": pub.get("platform_post_id") or f"scheduled-{post_id}",
                "media_urls": post.get("image_urls") or [],
                "posted_at": now,
                "likes_count": 0,
                "comments_count": 0,
                "is_seen": True,
                "status": "posted",
                "platform_published": True,
                "scheduled_post_id": post_id,
                "created_at": now,
            }
            await db.social_posts.insert_one(social_post)
        elif pub["status"] == "saved_only":
            # Platform not connected — still record locally
            results[platform] = {"status": "saved_only", "note": pub.get("note"), "published_at": now}
            social_post = {
                "id": str(uuid.uuid4()),
                "client_id": client_id,
                "branch_id": branch_id,
                "location_id": branch_id,
                "platform": platform,
                "content": post["content"],
                "platform_post_id": f"scheduled-{post_id}",
                "media_urls": post.get("image_urls") or [],
                "posted_at": now,
                "likes_count": 0,
                "comments_count": 0,
                "is_seen": True,
                "status": "posted",
                "platform_published": False,
                "scheduled_post_id": post_id,
                "created_at": now,
            }
            await db.social_posts.insert_one(social_post)
        else:
            results[platform] = {"status": "failed", "error": pub.get("error"), "published_at": now}
            logger.warning(f"Scheduled post {post_id} failed for {platform}: {pub.get('error')}")

    failed = [p for p, r in results.items() if r["status"] == "failed"]

    final_status = "published"
    if len(failed) == len(post["platforms"]):
        final_status = "failed"
    elif failed:
        final_status = "partial"
    await db.scheduled_posts.update_one(
        {"id": post_id},
        {"$set": {
            "status": final_status,
            "publish_results": results,
            "published_at": now,
            "updated_at": now
        }}
    )
    
    return {"message": "Post published", "status": final_status, "results": results}
