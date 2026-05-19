from fastapi import APIRouter, HTTPException, Depends
from database import db
from auth import require_role, get_current_user
from models import BranchCreate, BranchUpdate
import uuid
from datetime import datetime, timezone

router = APIRouter()


@router.get("/")
async def get_branches(current_user=Depends(get_current_user)):
    client_id = current_user.get("client_id")
    if not client_id:
        raise HTTPException(status_code=403, detail="No client context")
    branches = await db.branches.find({"client_id": client_id}, {"_id": 0}).to_list(100)
    for b in branches:
        b["review_count"] = await db.reviews.count_documents({"client_id": client_id, "location_id": b["id"]})
        b["post_count"] = await db.social_posts.count_documents({"client_id": client_id, "location_id": b["id"]})
        b["dept_count"] = await db.departments.count_documents({"client_id": client_id, "location_id": b["id"]})
    return branches


@router.post("/")
async def create_branch(req: BranchCreate, current_user=Depends(require_role("business_admin"))):
    client_id = current_user.get("client_id")
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    now = datetime.now(timezone.utc).isoformat()
    branch = {
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "name": req.name,
        "address": req.address or "",
        "is_active": True,
        "brand_tone": client.get("brand_tone", "professional"),
        "language": client.get("language", "English"),
        "approval_required": client.get("approval_required", True),
        "do_dont_rules": client.get("do_dont_rules", []),
        "reply_templates": [],
        "created_at": now,
    }
    await db.branches.insert_one(branch)
    branch.pop("_id", None)
    return branch


@router.put("/{branch_id}")
async def update_branch(branch_id: str, req: BranchUpdate, current_user=Depends(require_role("business_admin"))):
    client_id = current_user.get("client_id")
    update_data = {k: v for k, v in req.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    result = await db.branches.update_one(
        {"id": branch_id, "client_id": client_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Branch not found")
    updated = await db.branches.find_one({"id": branch_id}, {"_id": 0})
    return updated


@router.delete("/{branch_id}")
async def delete_branch(branch_id: str, current_user=Depends(require_role("business_admin"))):
    client_id = current_user.get("client_id")
    count = await db.branches.count_documents({"client_id": client_id})
    if count <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last branch")
    result = await db.branches.delete_one({"id": branch_id, "client_id": client_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Branch not found")
    return {"message": "Branch deleted"}
