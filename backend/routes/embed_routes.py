"""
Public-facing endpoints for the embeddable reviews widget.
- GET /api/embed/branch/{branch_id}/reviews → reviews JSON for a branch
- GET /embed.js                              → static embeddable widget script
"""
from fastapi import APIRouter, HTTPException, Response
from typing import Optional
from pathlib import Path

from database import db

router = APIRouter()

EMBED_JS_PATH = Path(__file__).parent.parent / "static" / "embed.js"


@router.get("/branch/{branch_id}/reviews")
async def public_branch_reviews(branch_id: str, limit: int = 12):
    """Return up to `limit` recent reviews for a branch + business meta. PUBLIC."""
    branch = await db.branches.find_one({"id": branch_id}, {"_id": 0})
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")

    client = await db.clients.find_one({"id": branch.get("client_id")}, {"_id": 0})

    reviews = await db.reviews.find(
        {"branch_id": branch_id, "platform": "google"},
        {"_id": 0, "id": 1, "reviewer_name": 1, "rating": 1, "text": 1, "date": 1, "platform": 1},
    ).sort("date", -1).limit(min(max(1, limit), 50)).to_list(50)

    # Compute simple aggregates from already-loaded reviews collection
    all_reviews = await db.reviews.find(
        {"branch_id": branch_id, "platform": "google"},
        {"_id": 0, "rating": 1},
    ).to_list(5000)
    total = len(all_reviews)
    avg = round(sum(r.get("rating", 0) for r in all_reviews) / total, 2) if total else 0

    return {
        "business": {
            "name": branch.get("name") or (client or {}).get("name") or "Reviews",
            "address": branch.get("address", ""),
        },
        "stats": {
            "total_reviews": total,
            "average_rating": avg,
        },
        "reviews": reviews,
    }


@router.get("/script")
async def serve_embed_script():
    """Serve the embeddable widget JavaScript."""
    if not EMBED_JS_PATH.exists():
        raise HTTPException(status_code=500, detail="Embed script not found")
    return Response(
        content=EMBED_JS_PATH.read_text(encoding="utf-8"),
        media_type="application/javascript",
        headers={
            "Cache-Control": "public, max-age=3600",
            "Access-Control-Allow-Origin": "*",
        },
    )
