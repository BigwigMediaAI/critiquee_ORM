from fastapi import APIRouter, HTTPException, Depends, Query
from database import db
from auth import super_admin_only, hash_password, generate_business_key
from models import ClientCreate, ClientUpdate, ResetPasswordRequest
from encryption import encrypt_token, decrypt_token, is_encrypted
import uuid
from datetime import datetime, timezone, timedelta

router = APIRouter()

PLATFORMS = ["google", "tripadvisor", "facebook", "instagram", "linkedin", "x", "youtube", "reddit", "booking"]


@router.get("/clients")
async def get_clients(_=Depends(super_admin_only)):
    clients = await db.clients.find({}, {"_id": 0}).to_list(1000)
    for c in clients:
        c["review_count"] = await db.reviews.count_documents({"client_id": c["id"]})
        c["admin_user"] = await db.users.find_one(
            {"client_id": c["id"], "role": "business_admin"},
            {"_id": 0, "password_hash": 0}
        )
    return clients


@router.post("/clients")
async def create_client(req: ClientCreate, _=Depends(super_admin_only)):
    existing = await db.users.find_one({"email": req.admin_email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Admin email already exists")

    client_id = str(uuid.uuid4())
    branch_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    # Generate unique business key
    for _ in range(20):
        bkey = generate_business_key()
        if not await db.clients.find_one({"business_key": bkey}):
            break

    # Create the Main Branch in the branches collection
    main_branch = {
        "id": branch_id,
        "client_id": client_id,
        "name": "Main Branch",
        "address": "",
        "is_active": True,
        "brand_tone": "professional",
        "language": "English",
        "approval_required": True,
        "do_dont_rules": [],
        "reply_templates": [],
        "created_at": now,
    }
    await db.branches.insert_one(main_branch)

    client = {
        "id": client_id,
        "business_key": bkey,
        "name": req.name,
        "business_type": req.business_type,
        "email": req.email,
        "enabled_platforms": req.enabled_platforms,
        "locations": [{"id": branch_id, "name": "Main Branch", "address": "", "is_active": True}],
        "is_active": True,
        "brand_tone": "professional",
        "language": "English",
        "approval_required": True,
        "do_dont_rules": [],
        "reply_templates": [],
        "created_at": now
    }
    await db.clients.insert_one(client)

    admin_user = {
        "id": str(uuid.uuid4()),
        "email": req.admin_email.lower(),
        "password_hash": hash_password(req.admin_password),
        "name": req.admin_name,
        "role": "business_admin",
        "client_id": client_id,
        "is_active": True,
        "created_at": now
    }
    await db.users.insert_one(admin_user)

    await seed_demo_data(client_id, branch_id)

    client.pop("_id", None)
    return client


@router.get("/clients/{client_id}")
async def get_client(client_id: str, _=Depends(super_admin_only)):
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    client["admin_user"] = await db.users.find_one(
        {"client_id": client_id, "role": "business_admin"},
        {"_id": 0, "password_hash": 0}
    )
    return client


@router.put("/clients/{client_id}")
async def update_client(client_id: str, req: ClientUpdate, _=Depends(super_admin_only)):
    update_data = {k: v for k, v in req.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    result = await db.clients.update_one({"id": client_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"message": "Client updated successfully"}


@router.post("/clients/{client_id}/reset-password")
async def reset_admin_password(client_id: str, req: ResetPasswordRequest, _=Depends(super_admin_only)):
    result = await db.users.update_one(
        {"client_id": client_id, "role": "business_admin"},
        {"$set": {"password_hash": hash_password(req.new_password)}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Admin user not found")
    return {"message": "Password reset successfully"}


@router.get("/platforms")
async def get_all_platforms(_=Depends(super_admin_only)):
    return PLATFORMS


@router.get("/stats")
async def get_stats(_=Depends(super_admin_only)):
    total = await db.clients.count_documents({})
    active = await db.clients.count_documents({"is_active": True})
    total_reviews = await db.reviews.count_documents({})
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    new_this_week = await db.clients.count_documents({"created_at": {"$gte": week_ago}})
    return {
        "total_clients": total,
        "active_clients": active,
        "total_reviews": total_reviews,
        "new_this_week": new_this_week
    }



# ─── Places API Key Management ───────────────────────────────────────────────

@router.get("/clients/{client_id}/places-api-keys")
async def get_client_api_keys(client_id: str, _=Depends(super_admin_only)):
    """List Places API key status for all branches of a client."""
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    branches = await db.branches.find({"client_id": client_id}, {"_id": 0}).to_list(100)

    result = []
    for branch in branches:
        gmb = await db.gmb_businesses.find_one(
            {"client_id": client_id, "branch_id": branch["id"]},
            {"_id": 0, "google_api_key": 1, "place_name": 1, "place_id": 1}
        )
        has_key = bool(gmb and gmb.get("google_api_key"))
        # Mask the key for display: show first 8 + last 4 chars
        masked_key = ""
        if has_key:
            raw = gmb["google_api_key"]
            if is_encrypted(raw):
                raw = decrypt_token(raw)
            masked_key = raw[:8] + "..." + raw[-4:] if len(raw) > 12 else "***"

        result.append({
            "branch_id": branch["id"],
            "branch_name": branch.get("name", "Unnamed"),
            "has_key": has_key,
            "masked_key": masked_key,
            "connected_business": gmb.get("place_name") if gmb else None,
        })

    return {"client_name": client.get("name"), "branches": result}


@router.put("/clients/{client_id}/places-api-key")
async def update_client_api_key(client_id: str, body: dict, _=Depends(super_admin_only)):
    """Set or update the Places API key for a specific branch."""
    branch_id = body.get("branch_id")
    api_key = body.get("api_key", "").strip()
    if not branch_id:
        raise HTTPException(status_code=400, detail="branch_id is required")
    if not api_key:
        raise HTTPException(status_code=400, detail="api_key is required")

    # Verify branch exists
    branch = await db.branches.find_one({"id": branch_id, "client_id": client_id})
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")

    now = datetime.now(timezone.utc).isoformat()
    encrypted_key = encrypt_token(api_key)

    await db.gmb_businesses.update_one(
        {"client_id": client_id, "branch_id": branch_id},
        {
            "$set": {"google_api_key": encrypted_key, "updated_at": now},
            "$setOnInsert": {"id": str(uuid.uuid4()), "client_id": client_id, "branch_id": branch_id, "created_at": now},
        },
        upsert=True,
    )
    return {"status": "ok", "message": "API key updated"}


@router.delete("/clients/{client_id}/places-api-key")
async def remove_client_api_key(client_id: str, branch_id: str = Query(...), _=Depends(super_admin_only)):
    """Remove the Places API key (and all GMB data) for a branch."""
    result = await db.gmb_businesses.delete_one({"client_id": client_id, "branch_id": branch_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="No API key found for this branch")
    return {"status": "ok", "message": "API key and connected business data removed"}



async def seed_demo_data(client_id: str, location_id: str):
    now = datetime.now(timezone.utc)
    dates = [(now - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(14, 0, -1)]

    demo_reviews = [
        {"platform": "google", "reviewer_name": "John Smith", "rating": 5, "text": "Absolutely fantastic experience! The staff was incredibly friendly and the facilities were top-notch. Will definitely be back!", "date": dates[0]},
        {"platform": "google", "reviewer_name": "Sarah Johnson", "rating": 4, "text": "Great hotel overall. The room was clean and comfortable. The breakfast could be better but everything else was excellent.", "date": dates[2]},
        {"platform": "tripadvisor", "reviewer_name": "Michael Brown", "rating": 3, "text": "Average experience. The location was convenient but the service was slow and the room was smaller than expected.", "date": dates[4]},
        {"platform": "google", "reviewer_name": "Emily Davis", "rating": 5, "text": "Perfect stay for our anniversary! The team went above and beyond to make it special. Highly recommend the deluxe suite.", "date": dates[5]},
        {"platform": "tripadvisor", "reviewer_name": "Robert Wilson", "rating": 2, "text": "Disappointed with my stay. The air conditioning wasn't working properly and the front desk was unhelpful when I complained.", "date": dates[7]},
        {"platform": "google", "reviewer_name": "Lisa Anderson", "rating": 4, "text": "Nice property with good amenities. The pool area is beautiful. Staff could be more attentive but overall a positive experience.", "date": dates[9]},
        {"platform": "tripadvisor", "reviewer_name": "David Martinez", "rating": 5, "text": "Outstanding service from check-in to check-out. The concierge team arranged everything perfectly. This is my new favourite hotel!", "date": dates[11]},
        {"platform": "google", "reviewer_name": "Jennifer Taylor", "rating": 1, "text": "Terrible experience. Room was dirty, wifi didn't work, and staff were rude. Would not recommend at all.", "date": dates[13]},
    ]

    for i, r in enumerate(demo_reviews):
        review = {
            "id": str(uuid.uuid4()),
            "client_id": client_id,
            "location_id": location_id,
            **r,
            "platform_review_id": f"demo-{i+1}",
            "status": "new",
            "reply_text": None,
            "draft_reply": None,
            "reply_sent_at": None,
            "assigned_dept_id": None,
            "is_seen": False,
            "created_at": (now - timedelta(days=14 - i)).isoformat()
        }
        await db.reviews.insert_one(review)

    demo_posts = [
        {"platform": "instagram", "content": "Excited to announce our new rooftop bar opening this weekend! Join us for sunset cocktails with panoramic city views. Book your table now!", "likes_count": 234},
        {"platform": "facebook", "content": "Thank you to all our amazing guests this holiday season! Your warmth and kind words mean the world to our team. Here's to making more memories together!", "likes_count": 456},
        {"platform": "linkedin", "content": "We're thrilled to share that we've been recognized as one of the Top 10 Hotels in the region by TravelAwards 2024! This achievement belongs to our incredible team.", "likes_count": 123},
    ]

    post_comments = [
        [{"commenter_name": "Alice Park", "text": "Can't wait to visit! Do you have vegetarian options?"},
         {"commenter_name": "Tom Hughes", "text": "Been a loyal guest for 5 years, always wonderful!"}],
        [{"commenter_name": "Maria Lopez", "text": "Such a lovely message! You guys are always amazing."},
         {"commenter_name": "Chris Evans", "text": "Best hotel in the city hands down!"}],
        [{"commenter_name": "Priya Sharma", "text": "Congratulations! Well deserved recognition."}],
    ]

    for i, post_data in enumerate(demo_posts):
        post_id = str(uuid.uuid4())
        post = {
            "id": post_id,
            "client_id": client_id,
            "location_id": location_id,
            **post_data,
            "platform_post_id": f"demo-post-{i+1}",
            "media_urls": [],
            "posted_at": (now - timedelta(days=i * 3)).isoformat(),
            "comments_count": len(post_comments[i]),
            "is_seen": False,
            "status": "new",
            "created_at": (now - timedelta(days=i * 3)).isoformat()
        }
        await db.social_posts.insert_one(post)

        for comment_data in post_comments[i]:
            comment = {
                "id": str(uuid.uuid4()),
                "client_id": client_id,
                "post_id": post_id,
                "platform": post_data["platform"],
                **comment_data,
                "platform_comment_id": f"demo-comment-{uuid.uuid4()}",
                "date": (now - timedelta(days=i * 3)).isoformat(),
                "status": "new",
                "reply_text": None,
                "draft_reply": None,
                "assigned_dept_id": None,
                "is_seen": False,
                "created_at": (now - timedelta(days=i * 3)).isoformat()
            }
            await db.social_comments.insert_one(comment)

    default_depts = [
        {"name": "Front Desk", "description": "Handles guest check-in/check-out and general inquiries"},
        {"name": "Food & Beverage", "description": "Restaurant and bar related feedback"},
        {"name": "Housekeeping", "description": "Room cleanliness and maintenance issues"},
    ]

    for dept_data in default_depts:
        dept = {
            "id": str(uuid.uuid4()),
            "client_id": client_id,
            "location_id": location_id,
            **dept_data,
            "approval_required": True,
            "is_active": True,
            "created_at": now.isoformat()
        }
        await db.departments.insert_one(dept)
