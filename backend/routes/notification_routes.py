"""
Notification Routes
Handles notification CRUD and marking as read.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from database import db
from auth import get_current_user
from datetime import datetime, timezone
import uuid
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


async def create_notification(
    client_id: str,
    branch_id: str,
    message: str,
    notif_type: str,
    link: str = "",
    target_roles: list = None,
):
    """
    Create a notification for all relevant users in a branch.
    target_roles: which roles should see it (default: business_admin + department)
    """
    if target_roles is None:
        target_roles = ["business_admin", "department"]

    query = {"client_id": client_id, "is_active": {"$ne": False}, "role": {"$in": target_roles}}
    if "department" in target_roles and "business_admin" not in target_roles:
        query["branch_id"] = branch_id

    users = await db.users.find(query, {"_id": 0, "id": 1, "role": 1, "branch_id": 1}).to_list(500)

    now = datetime.now(timezone.utc).isoformat()
    docs = []
    for u in users:
        # For department users, only notify if they belong to this branch
        if u.get("role") == "department" and u.get("branch_id") != branch_id:
            continue
        docs.append({
            "id": str(uuid.uuid4()),
            "user_id": u["id"],
            "client_id": client_id,
            "branch_id": branch_id,
            "message": message,
            "type": notif_type,
            "link": link,
            "read": False,
            "created_at": now,
        })

    if docs:
        await db.notifications.insert_many(docs)
        logger.info(f"Created {len(docs)} notifications: {message}")


async def create_notification_for_user(
    user_id: str,
    client_id: str,
    branch_id: str,
    message: str,
    notif_type: str,
    link: str = "",
):
    """Create a single notification for a specific user."""
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "client_id": client_id,
        "branch_id": branch_id,
        "message": message,
        "type": notif_type,
        "link": link,
        "read": False,
        "created_at": now,
    }
    await db.notifications.insert_one(doc)


@router.get("/")
async def get_notifications(
    branch_id: str = Query(None),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    current_user=Depends(get_current_user),
):
    """Fetch notifications for the current user."""
    user_id = current_user.get("sub") or current_user.get("user_id")
    query = {"user_id": user_id}
    if branch_id:
        query["branch_id"] = branch_id

    total = await db.notifications.count_documents(query)
    items = await db.notifications.find(
        query, {"_id": 0}
    ).sort("created_at", -1).skip(offset).limit(limit).to_list(limit)

    return {"notifications": items, "total": total}


@router.get("/unread-count")
async def get_unread_count(
    branch_id: str = Query(None),
    current_user=Depends(get_current_user),
):
    """Get the count of unread notifications."""
    user_id = current_user.get("sub") or current_user.get("user_id")
    query = {"user_id": user_id, "read": False}
    if branch_id:
        query["branch_id"] = branch_id

    count = await db.notifications.count_documents(query)
    return {"unread_count": count}


@router.post("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user=Depends(get_current_user),
):
    """Mark a single notification as read."""
    user_id = current_user.get("sub") or current_user.get("user_id")
    result = await db.notifications.update_one(
        {"id": notification_id, "user_id": user_id},
        {"$set": {"read": True}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"status": "ok"}


@router.post("/read-all")
async def mark_all_read(
    branch_id: str = Query(None),
    current_user=Depends(get_current_user),
):
    """Mark all notifications as read for the current user."""
    user_id = current_user.get("sub") or current_user.get("user_id")
    query = {"user_id": user_id, "read": False}
    if branch_id:
        query["branch_id"] = branch_id

    result = await db.notifications.update_many(query, {"$set": {"read": True}})
    return {"status": "ok", "updated": result.modified_count}
