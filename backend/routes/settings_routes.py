from fastapi import APIRouter, HTTPException, Depends, Query
from database import db
from auth import require_role, get_current_user
from models import SettingsUpdate
import uuid
from datetime import datetime, timezone

router = APIRouter()


@router.get("/")
async def get_settings(branch_id: str = Query(None), current_user=Depends(require_role("business_admin"))):
    client_id = current_user.get("client_id")
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    if branch_id:
        branch = await db.branches.find_one({"id": branch_id, "client_id": client_id}, {"_id": 0})
        if not branch:
            raise HTTPException(status_code=404, detail="Branch not found")
        # signature + seo_keywords are client-wide settings — always surface them from the client doc
        branch["signature"] = client.get("signature", "")
        branch["signature_enabled"] = client.get("signature_enabled", False)
        branch["seo_keywords"] = client.get("seo_keywords", [])
        return branch

    return client


@router.put("/")
async def update_settings(req: SettingsUpdate, branch_id: str = Query(None), current_user=Depends(require_role("business_admin"))):
    client_id = current_user.get("client_id")
    update_data = {k: v for k, v in req.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")

    # Client-wide settings — always saved at client level even when a branch is selected
    client_only_keys = ("signature", "signature_enabled", "seo_keywords")
    client_update = {k: update_data.pop(k) for k in list(client_only_keys) if k in update_data}

    if branch_id:
        if update_data:
            result = await db.branches.update_one(
                {"id": branch_id, "client_id": client_id},
                {"$set": update_data},
            )
            if result.matched_count == 0:
                raise HTTPException(status_code=404, detail="Branch not found")
        if client_update:
            await db.clients.update_one({"id": client_id}, {"$set": client_update})
    else:
        merged = {**update_data, **client_update}
        if merged:
            await db.clients.update_one({"id": client_id}, {"$set": merged})

    return {"message": "Settings updated successfully"}


@router.get("/platforms")
async def get_platform_connections(branch_id: str = Query(None), current_user=Depends(get_current_user)):
    client_id = current_user.get("client_id")
    if not client_id:
        raise HTTPException(status_code=403, detail="No client context")
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Not found")

    enabled = client.get("enabled_platforms", [])
    connections = []
    for platform in enabled:
        query = {"client_id": client_id, "platform": platform}
        if branch_id:
            query["branch_id"] = branch_id
        conn = await db.platform_connections.find_one(query, {"_id": 0})
        if conn:
            connections.append(conn)
        else:
            connections.append({
                "platform": platform,
                "status": "not_connected",
                "connected_at": None,
                "last_synced_at": None,
                "branch_id": branch_id,
            })
    return connections


@router.post("/platforms/{platform}/connect")
async def connect_platform(platform: str, branch_id: str = Query(None), current_user=Depends(require_role("business_admin"))):
    client_id = current_user.get("client_id")
    now = datetime.now(timezone.utc).isoformat()
    conn = {
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "branch_id": branch_id,
        "platform": platform,
        "status": "connected",
        "connected_at": now,
        "last_synced_at": now,
    }
    query = {"client_id": client_id, "platform": platform}
    if branch_id:
        query["branch_id"] = branch_id
    await db.platform_connections.update_one(query, {"$set": conn}, upsert=True)
    return {"message": f"{platform} connected successfully", "status": "connected"}


@router.post("/platforms/{platform}/disconnect")
async def disconnect_platform(platform: str, branch_id: str = Query(None), current_user=Depends(require_role("business_admin"))):
    client_id = current_user.get("client_id")
    query = {"client_id": client_id, "platform": platform}
    if branch_id:
        query["branch_id"] = branch_id
    await db.platform_connections.update_one(
        query,
        {"$set": {"status": "not_connected", "connected_at": None, "last_synced_at": None}}
    )
    return {"message": f"{platform} disconnected"}
