from fastapi import APIRouter, HTTPException, Depends, Query
from database import db
from auth import require_role, get_current_user, hash_password
from models import DepartmentCreate, DepartmentUpdate, DeptUserCreate, ResetPasswordRequest
from datetime import datetime, timezone
import uuid

router = APIRouter()


@router.get("/assignments/list")
async def get_my_assignments(current_user=Depends(require_role("department"))):
    dept_id = current_user.get("department_id")
    client_id = current_user.get("client_id")

    assignments = await db.assignments.find(
        {"assigned_to_dept_id": dept_id, "client_id": client_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(200)

    for assignment in assignments:
        if assignment["item_type"] == "review":
            item = await db.reviews.find_one({"id": assignment["item_id"]}, {"_id": 0})
        else:
            item = await db.social_comments.find_one({"id": assignment["item_id"]}, {"_id": 0})
            if item and assignment.get("post_id"):
                post = await db.social_posts.find_one({"id": item.get("post_id")}, {"_id": 0})
                item["post"] = post
        assignment["item"] = item

    return assignments


@router.get("/")
async def get_departments(branch_id: str = Query(None), current_user=Depends(get_current_user)):
    client_id = current_user.get("client_id")
    if not client_id:
        raise HTTPException(status_code=403, detail="No client context")

    query = {"client_id": client_id}
    if branch_id:
        query["location_id"] = branch_id
    elif current_user.get("role") == "department" and current_user.get("branch_id"):
        query["location_id"] = current_user.get("branch_id")

    depts = await db.departments.find(query, {"_id": 0}).to_list(100)

    for dept in depts:
        dept["user_count"] = await db.users.count_documents({"department_id": dept["id"]})
        dept["pending_count"] = await db.assignments.count_documents(
            {"assigned_to_dept_id": dept["id"], "status": "pending"}
        )
        dept["draft_count"] = await db.assignments.count_documents(
            {"assigned_to_dept_id": dept["id"], "status": "submitted"}
        )

    return depts


@router.post("/")
async def create_department(req: DepartmentCreate, current_user=Depends(require_role("business_admin"))):
    client_id = current_user.get("client_id")
    now = datetime.now(timezone.utc).isoformat()
    dept = {
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "location_id": req.branch_id,
        "name": req.name,
        "description": req.description,
        "approval_required": req.approval_required,
        "is_active": True,
        "created_at": now
    }
    await db.departments.insert_one(dept)
    dept.pop("_id", None)
    return dept


@router.put("/{dept_id}")
async def update_department(dept_id: str, req: DepartmentUpdate, current_user=Depends(require_role("business_admin"))):
    client_id = current_user.get("client_id")
    update_data = {k: v for k, v in req.model_dump().items() if v is not None}
    result = await db.departments.update_one(
        {"id": dept_id, "client_id": client_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Department not found")
    return {"message": "Department updated"}


@router.delete("/{dept_id}")
async def delete_department(dept_id: str, current_user=Depends(require_role("business_admin"))):
    client_id = current_user.get("client_id")
    result = await db.departments.delete_one({"id": dept_id, "client_id": client_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Department not found")
    return {"message": "Department deleted"}


@router.get("/{dept_id}/users")
async def get_dept_users(dept_id: str, current_user=Depends(require_role("business_admin"))):
    client_id = current_user.get("client_id")
    users = await db.users.find(
        {"department_id": dept_id, "client_id": client_id},
        {"_id": 0, "password_hash": 0}
    ).to_list(100)
    return users


@router.post("/{dept_id}/users")
async def create_dept_user(dept_id: str, req: DeptUserCreate, current_user=Depends(require_role("business_admin"))):
    client_id = current_user.get("client_id")
    dept = await db.departments.find_one({"id": dept_id, "client_id": client_id})
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    existing = await db.users.find_one({"email": req.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")

    now = datetime.now(timezone.utc).isoformat()
    user = {
        "id": str(uuid.uuid4()),
        "email": req.email.lower(),
        "password_hash": hash_password(req.password),
        "name": req.name,
        "role": "department",
        "client_id": client_id,
        "department_id": dept_id,
        "branch_id": dept.get("location_id"),
        "is_active": True,
        "created_at": now
    }
    await db.users.insert_one(user)
    user.pop("_id", None)
    user.pop("password_hash", None)
    return user


@router.post("/{dept_id}/users/{user_id}/reset-password")
async def reset_dept_user_password(
    dept_id: str,
    user_id: str,
    req: ResetPasswordRequest,
    current_user=Depends(require_role("business_admin"))
):
    client_id = current_user.get("client_id")
    result = await db.users.update_one(
        {"id": user_id, "department_id": dept_id, "client_id": client_id},
        {"$set": {"password_hash": hash_password(req.new_password)}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Password reset successfully"}
