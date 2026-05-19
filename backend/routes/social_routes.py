from fastapi import APIRouter, HTTPException, Depends, Query
from database import db
from auth import get_current_user, require_role
from models import SocialCommentReplyRequest, AssignRequest, PostCreate
from services.facebook_api import get_facebook_api
from services.youtube_api import get_youtube_api
from services.reddit_api import get_reddit_api
from services.publisher import publish_to_platform
from datetime import datetime, timezone
import uuid
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/counts")
async def get_counts(branch_id: str = Query(None), current_user=Depends(get_current_user)):
    client_id = current_user.get("client_id")
    if not client_id:
        return {"unseen": 0}
    query = {"client_id": client_id, "is_seen": False}
    if branch_id:
        query["location_id"] = branch_id
    unseen = await db.social_comments.count_documents(query)
    return {"unseen": unseen}


@router.get("/posts")
async def get_posts(
    platform: str = Query(None),
    branch_id: str = Query(None),
    page: int = Query(1),
    limit: int = Query(20),
    current_user=Depends(get_current_user)
):
    client_id = current_user.get("client_id")
    if not client_id:
        raise HTTPException(status_code=403, detail="No client context")

    query = {"client_id": client_id}
    if platform:
        query["platform"] = platform
    if branch_id:
        query["location_id"] = branch_id

    skip = (page - 1) * limit
    posts = await db.social_posts.find(query, {"_id": 0}).sort("posted_at", -1).skip(skip).limit(limit).to_list(limit)

    for post in posts:
        post["unseen_comments"] = await db.social_comments.count_documents(
            {"post_id": post["id"], "is_seen": False}
        )
        post["total_comments"] = await db.social_comments.count_documents({"post_id": post["id"]})

    total = await db.social_posts.count_documents(query)
    return {"posts": posts, "total": total, "page": page}


@router.post("/posts")
async def create_post(req: PostCreate, current_user=Depends(require_role("business_admin"))):
    client_id = current_user.get("client_id")
    now = datetime.now(timezone.utc).isoformat()

    # Attempt real platform publish (non-blocking on failure)
    pub = await publish_to_platform(
        db, client_id, req.location_id, req.platform, req.content, req.image_urls or []
    )

    platform_post_id = pub.get("platform_post_id") or f"manual-{uuid.uuid4()}"

    post = {
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "branch_id": req.location_id,
        "location_id": req.location_id,
        "platform": req.platform,
        "content": req.content,
        "platform_post_id": platform_post_id,
        "media_urls": req.image_urls or [],
        "posted_at": now,
        "likes_count": 0,
        "comments_count": 0,
        "is_seen": True,
        "status": "posted",
        "platform_published": pub.get("status") == "published",
        "publish_note": pub.get("note") or pub.get("error"),
        "created_at": now,
    }
    await db.social_posts.insert_one(post)
    post.pop("_id", None)
    return post


@router.get("/posts/{post_id}")
async def get_post(post_id: str, current_user=Depends(get_current_user)):
    client_id = current_user.get("client_id")
    post = await db.social_posts.find_one({"id": post_id, "client_id": client_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    comments = await db.social_comments.find({"post_id": post_id}, {"_id": 0}).sort("created_at", 1).to_list(100)
    post["comments"] = comments

    await db.social_posts.update_one({"id": post_id}, {"$set": {"is_seen": True}})
    return post


@router.post("/posts/{post_id}/comments/{comment_id}/reply")
async def reply_to_comment(
    post_id: str,
    comment_id: str,
    req: SocialCommentReplyRequest,
    current_user=Depends(get_current_user)
):
    client_id = current_user.get("client_id")
    comment = await db.social_comments.find_one({"id": comment_id, "client_id": client_id})
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    # Get approval_required from branch settings, fallback to client
    post = await db.social_posts.find_one({"id": post_id}, {"location_id": 1})
    branch_id = post.get("location_id") if post else None
    approval_required = True
    if branch_id:
        branch = await db.branches.find_one({"id": branch_id, "client_id": client_id})
        approval_required = branch.get("approval_required", True) if branch else True
    else:
        client = await db.clients.find_one({"id": client_id})
        approval_required = client.get("approval_required", True)

    if current_user.get("role") == "department" and approval_required and not req.post_immediately:
        await db.social_comments.update_one(
            {"id": comment_id},
            {"$set": {"draft_reply": req.reply_text, "status": "draft"}}
        )
        await db.assignments.update_one(
            {"item_id": comment_id, "item_type": "comment", "status": "pending"},
            {"$set": {"status": "submitted", "draft_reply": req.reply_text}}
        )
        return {"message": "Reply submitted for approval"}

    now = datetime.now(timezone.utc).isoformat()
    await db.social_comments.update_one(
        {"id": comment_id},
        {"$set": {"reply_text": req.reply_text, "reply_sent_at": now, "status": "replied", "is_seen": True, "draft_reply": None}}
    )
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "user_id": current_user.get("user_id"),
        "action": "comment_reply_posted",
        "item_type": "comment",
        "item_id": comment_id,
        "details": "",
        "created_at": now
    })

    # Post reply to platform API (non-blocking)
    platform = comment.get("platform")
    branch_id_for_api = comment.get("branch_id")
    try:
        if platform == "facebook":
            fb_api = await get_facebook_api(db, client_id, branch_id_for_api)
            if fb_api and comment.get("platform_comment_id"):
                api_result = await fb_api.reply_to_comment(comment["platform_comment_id"], req.reply_text)
                if api_result.get("status") == "success":
                    await db.social_comments.update_one({"id": comment_id}, {"$set": {"platform_reply_id": api_result.get("comment_id"), "platform_reply_posted": True}})
                else:
                    logger.warning(f"Facebook reply API failed for {comment_id}: {api_result}")
        elif platform == "youtube":
            yt_api = await get_youtube_api(db, client_id, branch_id_for_api)
            if yt_api and comment.get("platform_comment_id"):
                api_result = await yt_api.reply_to_comment(comment["platform_comment_id"], req.reply_text)
                if api_result.get("status") == "success":
                    await db.social_comments.update_one({"id": comment_id}, {"$set": {"platform_reply_id": api_result.get("comment_id"), "platform_reply_posted": True}})
                else:
                    logger.warning(f"YouTube reply API failed for {comment_id}: {api_result}")
        elif platform == "reddit":
            rd_api = await get_reddit_api(db, client_id, branch_id_for_api)
            if rd_api and comment.get("platform_comment_id"):
                fullname = comment.get("reddit_fullname") or f"t1_{comment['platform_comment_id']}"
                api_result = await rd_api.reply_to_comment(fullname, req.reply_text)
                if api_result.get("status") == "success":
                    await db.social_comments.update_one({"id": comment_id}, {"$set": {"platform_reply_id": api_result.get("comment_id"), "platform_reply_posted": True}})
                else:
                    logger.warning(f"Reddit reply API failed for {comment_id}: {api_result}")
    except Exception as e:
        logger.error(f"Platform reply post error ({platform}): {e}")

    return {"message": "Reply posted successfully"}


@router.post("/posts/{post_id}/comments/{comment_id}/mark-seen")
async def mark_comment_seen(post_id: str, comment_id: str, current_user=Depends(get_current_user)):
    client_id = current_user.get("client_id")
    await db.social_comments.update_one(
        {"id": comment_id, "client_id": client_id},
        {"$set": {"is_seen": True, "status": "seen"}}
    )
    return {"message": "Marked as seen"}


@router.post("/posts/{post_id}/comments/{comment_id}/assign")
async def assign_comment(
    post_id: str,
    comment_id: str,
    req: AssignRequest,
    current_user=Depends(require_role("business_admin"))
):
    client_id = current_user.get("client_id")
    comment = await db.social_comments.find_one({"id": comment_id, "client_id": client_id})
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    now = datetime.now(timezone.utc).isoformat()
    await db.social_comments.update_one(
        {"id": comment_id},
        {"$set": {"assigned_dept_id": req.department_id, "status": "assigned"}}
    )

    await db.assignments.insert_one({
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "item_type": "comment",
        "item_id": comment_id,
        "post_id": post_id,
        "assigned_to_dept_id": req.department_id,
        "assigned_by": current_user["user_id"],
        "notes": req.notes,
        "status": "pending",
        "draft_reply": None,
        "created_at": now
    })
    return {"message": "Comment assigned successfully"}


@router.put("/posts/{post_id}/comments/{comment_id}/approve-reply")
async def approve_comment_reply(
    post_id: str,
    comment_id: str,
    current_user=Depends(require_role("business_admin"))
):
    client_id = current_user.get("client_id")
    comment = await db.social_comments.find_one({"id": comment_id, "client_id": client_id})
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    draft = comment.get("draft_reply")
    if not draft:
        raise HTTPException(status_code=400, detail="No draft reply found")

    now = datetime.now(timezone.utc).isoformat()
    await db.social_comments.update_one(
        {"id": comment_id},
        {"$set": {"reply_text": draft, "reply_sent_at": now, "status": "replied", "draft_reply": None}}
    )
    await db.assignments.update_one(
        {"item_id": comment_id, "item_type": "comment"},
        {"$set": {"status": "approved"}}
    )

    # Post approved reply to platform API
    platform = comment.get("platform")
    branch_id_for_api = comment.get("branch_id")
    try:
        if platform == "facebook":
            fb_api = await get_facebook_api(db, client_id, branch_id_for_api)
            if fb_api and comment.get("platform_comment_id"):
                await fb_api.reply_to_comment(comment["platform_comment_id"], draft)
        elif platform == "youtube":
            yt_api = await get_youtube_api(db, client_id, branch_id_for_api)
            if yt_api and comment.get("platform_comment_id"):
                await yt_api.reply_to_comment(comment["platform_comment_id"], draft)
        elif platform == "reddit":
            rd_api = await get_reddit_api(db, client_id, branch_id_for_api)
            if rd_api and comment.get("platform_comment_id"):
                fullname = comment.get("reddit_fullname") or f"t1_{comment['platform_comment_id']}"
                await rd_api.reply_to_comment(fullname, draft)
    except Exception as e:
        logger.error(f"Platform reply (approval) post error ({platform}): {e}")

    return {"message": "Reply approved and posted"}
