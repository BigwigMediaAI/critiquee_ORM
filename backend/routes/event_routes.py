"""
Event QR Routes - Manages event registration links + QR codes.
- Admin creates events; system generates a public registration URL.
- Public users register via that URL (Name, Email, Mobile).
- Status combines admin-controlled active flag and date-based lifecycle.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import csv
import io

from auth import get_current_user
from database import db

router = APIRouter()


# ============== Models ==============
class EventCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = ""
    venue: Optional[str] = ""
    event_date: str  # ISO datetime
    event_end_date: Optional[str] = None  # ISO datetime
    callback_url: Optional[str] = None
    branch_id: Optional[str] = None


class EventUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    venue: Optional[str] = None
    event_date: Optional[str] = None
    event_end_date: Optional[str] = None
    callback_url: Optional[str] = None
    is_active: Optional[bool] = None


class EventRegistration(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    mobile: str = Field(min_length=5, max_length=20)


# ============== Helpers ==============
def _normalize_callback_url(raw: Optional[str]) -> Optional[str]:
    """Validate & normalise the admin-supplied callback URL.

    - Empty / None / whitespace → None (no callback configured).
    - Must start with http:// or https://. Anything else is rejected with 400
      so an admin can't accidentally store a `javascript:` URI or a bare
      domain that won't resolve in the browser.
    """
    if not raw:
        return None
    url = raw.strip()
    if not url:
        return None
    if not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(
            status_code=400,
            detail="Callback URL must start with http:// or https://",
        )
    return url


def _compute_lifecycle(event_date_str: str, event_end_date_str: Optional[str]) -> str:
    """Returns 'upcoming' | 'live' | 'ended' based on dates."""
    try:
        start = datetime.fromisoformat(event_date_str.replace("Z", "+00:00"))
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        end = None
        if event_end_date_str:
            end = datetime.fromisoformat(event_end_date_str.replace("Z", "+00:00"))
            if end.tzinfo is None:
                end = end.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        if now < start:
            return "upcoming"
        if end and now > end:
            return "ended"
        if not end and now > start:
            # No explicit end → consider event ended after 24h
            from datetime import timedelta
            return "ended" if now > start + timedelta(hours=24) else "live"
        return "live"
    except Exception:
        return "upcoming"


def _serialize_event(doc: dict) -> dict:
    """Strip Mongo internals, attach computed status."""
    if not doc:
        return doc
    d = {k: v for k, v in doc.items() if k != "_id"}
    d["lifecycle"] = _compute_lifecycle(d.get("event_date", ""), d.get("event_end_date"))
    return d


# ============== Admin endpoints ==============
@router.get("/")
async def list_events(
    branch_id: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    client_id = current_user.get("client_id")
    if not client_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    query = {"client_id": client_id}
    if branch_id:
        query["branch_id"] = branch_id

    events = await db.events.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)

    # Attach registration counts
    for evt in events:
        evt["registrations_count"] = await db.event_registrations.count_documents({"event_id": evt["id"]})
        evt["lifecycle"] = _compute_lifecycle(evt.get("event_date", ""), evt.get("event_end_date"))

    return {"events": events}


@router.post("/")
async def create_event(payload: EventCreate, current_user=Depends(get_current_user)):
    client_id = current_user.get("client_id")
    if not client_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    event_id = str(uuid.uuid4())
    doc = {
        "id": event_id,
        "client_id": client_id,
        "branch_id": payload.branch_id,
        "name": payload.name,
        "description": payload.description or "",
        "venue": payload.venue or "",
        "event_date": payload.event_date,
        "event_end_date": payload.event_end_date,
        "callback_url": _normalize_callback_url(payload.callback_url),
        "is_active": True,
        "created_by": current_user.get("user_id"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.events.insert_one(doc)

    result = _serialize_event(doc)
    result["registrations_count"] = 0
    return result


@router.put("/{event_id}")
async def update_event(event_id: str, payload: EventUpdate, current_user=Depends(get_current_user)):
    client_id = current_user.get("client_id")
    existing = await db.events.find_one({"id": event_id, "client_id": client_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Event not found")

    updates = {k: v for k, v in payload.dict().items() if v is not None}
    if "callback_url" in updates:
        # Allow admin to clear the URL by sending an empty string explicitly;
        # treat anything non-empty through the same validator as on create.
        cb_raw = updates["callback_url"]
        updates["callback_url"] = _normalize_callback_url(cb_raw) if cb_raw.strip() else None
    if updates:
        await db.events.update_one({"id": event_id}, {"$set": updates})

    updated = await db.events.find_one({"id": event_id}, {"_id": 0})
    result = _serialize_event(updated)
    result["registrations_count"] = await db.event_registrations.count_documents({"event_id": event_id})
    return result


@router.delete("/{event_id}")
async def delete_event(event_id: str, current_user=Depends(get_current_user)):
    client_id = current_user.get("client_id")
    res = await db.events.delete_one({"id": event_id, "client_id": client_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    await db.event_registrations.delete_many({"event_id": event_id})
    return {"deleted": True}


@router.get("/{event_id}/registrations")
async def list_registrations(
    event_id: str,
    current_user=Depends(get_current_user),
):
    client_id = current_user.get("client_id")
    event = await db.events.find_one({"id": event_id, "client_id": client_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    regs = await db.event_registrations.find({"event_id": event_id}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    return {"event": _serialize_event(event), "registrations": regs}


@router.get("/export/csv")
async def export_events(
    branch_id: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    """Export all events (with registration counts) as CSV."""
    client_id = current_user.get("client_id")
    if not client_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    query = {"client_id": client_id}
    if branch_id:
        query["branch_id"] = branch_id

    events = await db.events.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Event Name", "Venue", "Event Date", "Status", "Lifecycle", "Registrations", "Created At"])
    for evt in events:
        regs_count = await db.event_registrations.count_documents({"event_id": evt["id"]})
        writer.writerow([
            evt.get("name", ""),
            evt.get("venue", ""),
            evt.get("event_date", ""),
            "Active" if evt.get("is_active", True) else "Inactive",
            _compute_lifecycle(evt.get("event_date", ""), evt.get("event_end_date")),
            regs_count,
            evt.get("created_at", ""),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="events_{datetime.now().strftime("%Y%m%d")}.csv"'},
    )


@router.get("/{event_id}/registrations/export")
async def export_registrations(
    event_id: str,
    current_user=Depends(get_current_user),
):
    client_id = current_user.get("client_id")
    event = await db.events.find_one({"id": event_id, "client_id": client_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    regs = await db.event_registrations.find({"event_id": event_id}, {"_id": 0}).sort("created_at", -1).to_list(10000)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Name", "Email", "Mobile", "Registered At"])
    for r in regs:
        writer.writerow([r.get("name", ""), r.get("email", ""), r.get("mobile", ""), r.get("created_at", "")])

    output.seek(0)
    safe_name = (event.get("name") or "event").replace(" ", "_")[:50]
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="registrations_{safe_name}.csv"'},
    )


# ============== Public endpoints ==============
@router.get("/public/{event_id}")
async def public_event_info(event_id: str):
    event = await db.events.find_one({"id": event_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if not event.get("is_active", True):
        raise HTTPException(status_code=403, detail="Registration is currently disabled for this event")

    lifecycle = _compute_lifecycle(event.get("event_date", ""), event.get("event_end_date"))
    if lifecycle == "ended":
        raise HTTPException(status_code=410, detail="This event has ended")

    # Sanitised public info — no client/branch IDs leaked
    return {
        "id": event["id"],
        "name": event.get("name"),
        "description": event.get("description", ""),
        "venue": event.get("venue", ""),
        "event_date": event.get("event_date"),
        "event_end_date": event.get("event_end_date"),
        "callback_url": event.get("callback_url"),
        "lifecycle": lifecycle,
    }


@router.post("/public/{event_id}/register")
async def public_register(event_id: str, payload: EventRegistration):
    event = await db.events.find_one({"id": event_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if not event.get("is_active", True):
        raise HTTPException(status_code=403, detail="Registration is currently disabled")

    lifecycle = _compute_lifecycle(event.get("event_date", ""), event.get("event_end_date"))
    if lifecycle == "ended":
        raise HTTPException(status_code=410, detail="This event has ended")

    # Prevent duplicate registration by email
    existing = await db.event_registrations.find_one({"event_id": event_id, "email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=409, detail="You have already registered for this event")

    reg = {
        "id": str(uuid.uuid4()),
        "event_id": event_id,
        "client_id": event["client_id"],
        "branch_id": event.get("branch_id"),
        "name": payload.name,
        "email": payload.email.lower(),
        "mobile": payload.mobile,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.event_registrations.insert_one(reg)
    return {
        "success": True,
        "registration_id": reg["id"],
        "callback_url": event.get("callback_url"),
    }
