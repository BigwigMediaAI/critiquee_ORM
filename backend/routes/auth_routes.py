from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from database import db
from auth import verify_password, create_token, hash_password, get_current_user
from models import LoginRequest

router = APIRouter()

SUPER_ADMIN_KEY = "SA"


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str


@router.post("/login")
async def login(req: LoginRequest):
    key = req.key.strip().upper()
    email = req.email.lower().strip()

    if key == SUPER_ADMIN_KEY:
        user = await db.users.find_one({"email": email, "role": "super_admin"}, {"_id": 0})
        if not user or not verify_password(req.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid credentials or key")
        if not user.get("is_active", True):
            raise HTTPException(status_code=403, detail="Account is inactive")
        client_data = None
    else:
        client = await db.clients.find_one({"business_key": key}, {"_id": 0})
        if not client:
            raise HTTPException(status_code=401, detail="Invalid credentials or key")
        if not client.get("is_active", True):
            raise HTTPException(status_code=403, detail="Business account is inactive or paused")
        user = await db.users.find_one(
            {"email": email, "client_id": client["id"], "role": {"$in": ["business_admin", "department"]}},
            {"_id": 0}
        )
        if not user or not verify_password(req.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid credentials or key")
        if not user.get("is_active", True):
            raise HTTPException(status_code=403, detail="Account is inactive")
        client_data = client

    token = create_token({
        "user_id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "client_id": user.get("client_id"),
        "department_id": user.get("department_id"),
    })

    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
            "client_id": user.get("client_id"),
            "department_id": user.get("department_id"),
            "branch_id": user.get("branch_id"),
            "client": client_data,
        }
    }


@router.get("/demo")
async def get_demo_credentials():
    """Public endpoint - returns demo business keys for the login page"""
    # Find the main demo client (Grand Hotel) - look for the one with non-test name
    client = await db.clients.find_one(
        {"name": {"$not": {"$regex": "^TEST_", "$options": "i"}}},
        {"_id": 0, "business_key": 1, "name": 1},
        sort=[("created_at", 1)]
    )
    return {
        "business_key": client.get("business_key", "N/A") if client else "N/A",
        "business_name": client.get("name", "") if client else "",
    }


@router.get("/me")
async def get_me(current_user=Depends(get_current_user)):
    user = await db.users.find_one(
        {"id": current_user["user_id"]},
        {"_id": 0, "password_hash": 0}
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("client_id"):
        client = await db.clients.find_one({"id": user["client_id"]}, {"_id": 0})
        user["client"] = client
    if user.get("branch_id"):
        branch = await db.branches.find_one({"id": user["branch_id"]}, {"_id": 0})
        user["branch"] = branch
    return user


@router.post("/change-password")
async def change_password(req: ChangePasswordRequest, current_user=Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user["user_id"]})
    if not user or not verify_password(req.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if req.new_password != req.confirm_password:
        raise HTTPException(status_code=400, detail="New passwords do not match")
    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    await db.users.update_one(
        {"id": current_user["user_id"]},
        {"$set": {"password_hash": hash_password(req.new_password)}}
    )
    return {"message": "Password updated successfully"}
