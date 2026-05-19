from fastapi import APIRouter, HTTPException, Depends, Query
from database import db
from auth import get_current_user, require_role
from models import ReviewReplyRequest, AssignRequest
from utils.sentiment import compute_sentiment
from services.google_api import get_google_api
from services.yelp_api import get_yelp_api
from services.trustpilot_api import get_trustpilot_api
from services.foursquare_api import get_foursquare_api
from services.zomato_api import get_zomato_api
from services.justdial_api import get_justdial_api
from datetime import datetime, timezone
import uuid
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


async def _log(client_id, user_id, action, item_type, item_id, details=""):
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "user_id": user_id,
        "action": action,
        "item_type": item_type,
        "item_id": item_id,
        "details": details,
        "created_at": datetime.now(timezone.utc).isoformat()
    })


@router.get("/counts")
async def get_counts(branch_id: str = Query(None), current_user=Depends(get_current_user)):
    client_id = current_user.get("client_id")
    if not client_id:
        return {"unseen": 0, "manual_reply_needed": 0}
    base = {"client_id": client_id}
    if branch_id:
        base["location_id"] = branch_id

    unseen = await db.reviews.count_documents({**base, "is_seen": False})
    manual_reply = await db.reviews.count_documents({
        **base,
        "platform_reply_unsupported": True,
        "reply_text": {"$ne": None},
    })
    return {"unseen": unseen, "manual_reply_needed": manual_reply}


@router.get("/pending-approvals")
async def get_pending_approvals(branch_id: str = Query(None), current_user=Depends(require_role("business_admin"))):
    client_id = current_user.get("client_id")
    rq = {"client_id": client_id, "status": "draft"}
    cq = {"client_id": client_id, "status": "draft"}
    if branch_id:
        rq["location_id"] = branch_id
        cq["location_id"] = branch_id
    reviews = await db.reviews.find(rq, {"_id": 0}).to_list(100)
    comments = await db.social_comments.find(cq, {"_id": 0}).to_list(100)
    return {"reviews": reviews, "comments": comments, "total": len(reviews) + len(comments)}


@router.get("/")
async def get_reviews(
    platform: str = Query(None),
    rating: int = Query(None),
    status: str = Query(None),
    sentiment: str = Query(None),
    manual_reply_needed: bool = Query(None),
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
    if rating:
        query["rating"] = rating
    if status:
        query["status"] = status
    if sentiment:
        query["sentiment"] = sentiment
    if branch_id:
        query["location_id"] = branch_id
    if manual_reply_needed is True:
        # Reply was saved internally but the platform's API can't post it —
        # surfaces in the UI as a "Manual reply needed" badge so admins can
        # close the loop on yelp.com / Foursquare etc. directly.
        query["platform_reply_unsupported"] = True
        query["reply_text"] = {"$ne": None}
    elif manual_reply_needed is False:
        query["$or"] = [
            {"platform_reply_unsupported": {"$ne": True}},
            {"reply_text": None},
            {"reply_text": {"$exists": False}},
        ]

    if current_user.get("role") == "department":
        query["assigned_dept_id"] = current_user.get("department_id")
        if current_user.get("branch_id") and not branch_id:
            query["location_id"] = current_user.get("branch_id")

    skip = (page - 1) * limit
    reviews = await db.reviews.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.reviews.count_documents(query)
    return {"reviews": reviews, "total": total, "page": page}


@router.post("/analyze-sentiment")
async def analyze_sentiment_batch(
    branch_id: str = Query(None),
    current_user=Depends(require_role("business_admin"))
):
    """Compute and store sentiment for all reviews in a branch that don't have it yet."""
    from pymongo import UpdateOne as PyUpdateOne

    client_id = current_user.get("client_id")
    query = {"client_id": client_id, "sentiment": {"$exists": False}}
    if branch_id:
        query["location_id"] = branch_id

    reviews = await db.reviews.find(query, {"_id": 0, "id": 1, "text": 1, "rating": 1}).to_list(500)

    if not reviews:
        return {"message": "All reviews already analyzed", "updated": 0}

    ops = [
        PyUpdateOne(
            {"id": r["id"]},
            {"$set": {"sentiment": compute_sentiment(r.get("text", ""), r.get("rating"))}}
        )
        for r in reviews
    ]
    result = await db.reviews.bulk_write(ops)
    updated = result.modified_count

    return {"message": f"Analyzed {updated} reviews", "updated": updated}


@router.get("/{review_id}")
async def get_review(review_id: str, current_user=Depends(get_current_user)):
    client_id = current_user.get("client_id")
    review = await db.reviews.find_one({"id": review_id, "client_id": client_id}, {"_id": 0})
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    if review.get("assigned_dept_id"):
        dept = await db.departments.find_one({"id": review["assigned_dept_id"]}, {"_id": 0})
        review["assigned_dept"] = dept

    await db.reviews.update_one({"id": review_id}, {"$set": {"is_seen": True}})
    return review


@router.post("/{review_id}/mark-seen")
async def mark_seen(review_id: str, current_user=Depends(get_current_user)):
    client_id = current_user.get("client_id")
    await db.reviews.update_one(
        {"id": review_id, "client_id": client_id},
        {"$set": {"is_seen": True, "status": "seen"}}
    )
    return {"message": "Marked as seen"}


@router.post("/{review_id}/reply")
async def reply_to_review(review_id: str, req: ReviewReplyRequest, current_user=Depends(get_current_user)):
    client_id = current_user.get("client_id")
    review = await db.reviews.find_one({"id": review_id, "client_id": client_id})
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    # Get approval_required from branch settings, fallback to client
    branch_id = review.get("location_id")
    approval_required = True
    if branch_id:
        branch = await db.branches.find_one({"id": branch_id, "client_id": client_id})
        approval_required = branch.get("approval_required", True) if branch else True
    else:
        client = await db.clients.find_one({"id": client_id})
        approval_required = client.get("approval_required", True)

    if current_user.get("role") == "department" and approval_required and not req.post_immediately:
        await db.reviews.update_one(
            {"id": review_id},
            {"$set": {"draft_reply": req.reply_text, "status": "draft"}}
        )
        await db.assignments.update_one(
            {"item_id": review_id, "item_type": "review", "status": "pending"},
            {"$set": {"status": "submitted", "draft_reply": req.reply_text}}
        )
        await _log(client_id, current_user["user_id"], "reply_draft_submitted", "review", review_id)
        return {"message": "Reply submitted for approval"}

    now = datetime.now(timezone.utc).isoformat()
    await db.reviews.update_one(
        {"id": review_id},
        {"$set": {"reply_text": req.reply_text, "reply_sent_at": now, "status": "replied", "is_seen": True, "draft_reply": None}}
    )
    await _log(client_id, current_user["user_id"], "reply_posted", "review", review_id)

    # Best-effort attempt to post the reply on the source platform.
    # The DB record above is the source of truth; platform posting is a non-blocking enhancement.
    platform_result = await _post_reply_to_platform(client_id, review, req.reply_text)
    if platform_result:
        await db.reviews.update_one({"id": review_id}, {"$set": platform_result})

    response = {"message": "Reply posted successfully"}
    if platform_result and platform_result.get("platform_reply_unsupported"):
        response["platform_reply_unsupported"] = True
        response["platform_reply_message"] = platform_result.get("platform_reply_message")
        response["platform_external_url"] = platform_result.get("platform_external_url")
        response["platform_external_label"] = platform_result.get("platform_external_label")
    return response


async def _post_reply_to_platform(client_id: str, review: dict, reply_text: str) -> dict:
    """Try to post the reply on the originating platform.

    Returns a dict of fields to merge into the review document. Possible keys:
      platform_reply_posted          — True when the reply was actually posted via API
      platform_reply_unsupported     — True when the platform does not allow API replies
      platform_reply_message         — Human-readable explanation (shown in the UI)
      platform_external_url          — Where the user should go to reply manually
      platform_external_label        — Button label for the external CTA
    """
    platform = (review.get("platform") or "").lower()
    branch_id = review.get("branch_id")
    update: dict = {}

    try:
        if platform == "google":
            api = await get_google_api(db, client_id, branch_id)
            if api:
                google_location = review.get("google_location_name") or review.get("location_id", "")
                if "/" in google_location:
                    review_name = f"{google_location}/reviews/{review['platform_review_id']}"
                    api_result = await api.reply_to_review(review_name, reply_text)
                    if api_result.get("status") == "success":
                        update["platform_reply_posted"] = True
                    else:
                        logger.warning(f"Google reply API failed for {review.get('id')}: {api_result}")

        elif platform in ("yelp", "trustpilot", "foursquare", "zomato", "justdial"):
            getter = {
                "yelp": get_yelp_api,
                "trustpilot": get_trustpilot_api,
                "foursquare": get_foursquare_api,
                "zomato": get_zomato_api,
                "justdial": get_justdial_api,
            }[platform]
            api = await getter(db, client_id, branch_id)
            if api:
                # Trustpilot's reply API needs the platform-side review ID; the
                # other two simply ignore extra kwargs.
                kwargs = {}
                if platform == "trustpilot":
                    kwargs["platform_review_id"] = review.get("platform_review_id")
                api_result = await api.reply_to_review(review.get("url"), reply_text, **kwargs)
                if api_result.get("status") == "success":
                    update["platform_reply_posted"] = True
                    # Clear any prior unsupported flag so the UI hides the manual CTA
                    update["platform_reply_unsupported"] = False
                    update["platform_reply_message"] = None
                    update["platform_external_url"] = None
                    update["platform_external_label"] = None
                elif api_result.get("status") == "unsupported":
                    update["platform_reply_unsupported"] = True
                    update["platform_reply_message"] = api_result.get("message")
                    update["platform_external_url"] = api_result.get("external_url")
                    update["platform_external_label"] = api_result.get("external_label")

    except Exception as e:
        logger.error(f"Platform reply dispatch error ({platform}) for review {review.get('id')}: {e}")

    return update


@router.post("/{review_id}/assign")
async def assign_review(review_id: str, req: AssignRequest, current_user=Depends(require_role("business_admin"))):
    client_id = current_user.get("client_id")
    review = await db.reviews.find_one({"id": review_id, "client_id": client_id})
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    dept = await db.departments.find_one({"id": req.department_id, "client_id": client_id})
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    now = datetime.now(timezone.utc).isoformat()
    await db.reviews.update_one(
        {"id": review_id},
        {"$set": {"assigned_dept_id": req.department_id, "status": "assigned"}}
    )

    await db.assignments.insert_one({
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "item_type": "review",
        "item_id": review_id,
        "assigned_to_dept_id": req.department_id,
        "assigned_by": current_user["user_id"],
        "notes": req.notes,
        "status": "pending",
        "draft_reply": None,
        "created_at": now
    })
    await _log(client_id, current_user["user_id"], "assigned_to_dept", "review", review_id, req.department_id)
    return {"message": "Review assigned successfully"}


@router.put("/{review_id}/approve-reply")
async def approve_reply(review_id: str, current_user=Depends(require_role("business_admin"))):
    client_id = current_user.get("client_id")
    review = await db.reviews.find_one({"id": review_id, "client_id": client_id})
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    draft = review.get("draft_reply")
    if not draft:
        raise HTTPException(status_code=400, detail="No draft reply found")

    now = datetime.now(timezone.utc).isoformat()
    await db.reviews.update_one(
        {"id": review_id},
        {"$set": {"reply_text": draft, "reply_sent_at": now, "status": "replied", "draft_reply": None}}
    )
    await db.assignments.update_one(
        {"item_id": review_id, "item_type": "review"},
        {"$set": {"status": "approved"}}
    )
    await _log(client_id, current_user["user_id"], "reply_approved", "review", review_id)

    # Post reply to Google API after approval
    if review.get("platform") == "google":
        try:
            g_api = await get_google_api(db, client_id, review.get("branch_id"))
            if g_api:
                google_location = review.get("google_location_name") or review.get("location_id", "")
                if "/" in google_location:
                    review_name = f"{google_location}/reviews/{review['platform_review_id']}"
                    await g_api.reply_to_review(review_name, draft)
        except Exception as e:
            logger.error(f"Google reply (approval) post error: {e}")

    return {"message": "Reply approved and posted"}
