"""
Review Link Routes
Public review collection system with shareable links and QR codes.
Supports positive-only feedback filtering with platform redirection.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from typing import Optional
from database import db
from auth import get_current_user, require_role
from datetime import datetime, timezone, timedelta
import uuid
import math
import csv
import io
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

REVIEW_PLATFORMS = {
    "google": {"name": "Google", "icon": "google"},
    "tripadvisor": {"name": "TripAdvisor", "icon": "tripadvisor"},
    "booking": {"name": "Booking.com", "icon": "booking"},
    "facebook": {"name": "Facebook", "icon": "facebook"},
    "yelp": {"name": "Yelp", "icon": "yelp"},
}

# Dropdown options for custom platform selector (legacy flat list — kept for backward compatibility)
PLATFORM_OPTIONS = [
    {"value": "tripadvisor", "label": "TripAdvisor"},
    {"value": "booking", "label": "Booking.com"},
    {"value": "yelp", "label": "Yelp"},
    {"value": "trustpilot", "label": "Trustpilot"},
    {"value": "expedia", "label": "Expedia"},
    {"value": "hotels_com", "label": "Hotels.com"},
    {"value": "opentable", "label": "OpenTable"},
    {"value": "zomato", "label": "Zomato"},
    {"value": "agoda", "label": "Agoda"},
    {"value": "airbnb", "label": "Airbnb"},
    {"value": "foursquare", "label": "Foursquare"},
    {"value": "glassdoor", "label": "Glassdoor"},
    {"value": "other", "label": "Other"},
]


# Categorized platform catalog — focused on India, UAE, US (and globally known)
# Each platform: {value, label, region: "Global"|"India"|"UAE"|"US"|"EU"}
PLATFORM_CATEGORIES = [
    {
        "value": "hospitality",
        "label": "Hospitality (Hotels, Restaurants, Bars)",
        "platforms": [
            {"value": "tripadvisor", "label": "TripAdvisor", "region": "Global"},
            {"value": "booking", "label": "Booking.com", "region": "Global"},
            {"value": "agoda", "label": "Agoda", "region": "Global"},
            {"value": "expedia", "label": "Expedia", "region": "Global"},
            {"value": "hotels_com", "label": "Hotels.com", "region": "Global"},
            {"value": "airbnb", "label": "Airbnb", "region": "Global"},
            {"value": "trivago", "label": "Trivago", "region": "Global"},
            {"value": "opentable", "label": "OpenTable", "region": "US"},
            {"value": "yelp", "label": "Yelp", "region": "US"},
            {"value": "foursquare", "label": "Foursquare", "region": "Global"},
            {"value": "zomato", "label": "Zomato", "region": "India / UAE"},
            {"value": "swiggy_dineout", "label": "Swiggy Dineout", "region": "India"},
            {"value": "makemytrip", "label": "MakeMyTrip", "region": "India"},
            {"value": "goibibo", "label": "Goibibo", "region": "India"},
            {"value": "the_entertainer", "label": "The Entertainer", "region": "UAE"},
            {"value": "zomato_uae", "label": "Zomato UAE", "region": "UAE"},
            {"value": "talabat", "label": "Talabat", "region": "UAE"},
        ],
    },
    {
        "value": "healthcare",
        "label": "Healthcare (Clinics, Doctors, Hospitals)",
        "platforms": [
            {"value": "practo", "label": "Practo", "region": "India"},
            {"value": "lybrate", "label": "Lybrate", "region": "India"},
            {"value": "justdial_health", "label": "Justdial (Health)", "region": "India"},
            {"value": "healthgrades", "label": "Healthgrades", "region": "US"},
            {"value": "zocdoc", "label": "Zocdoc", "region": "US"},
            {"value": "vitals", "label": "Vitals", "region": "US"},
            {"value": "ratemds", "label": "RateMDs", "region": "US / Global"},
            {"value": "webmd_care", "label": "WebMD Care", "region": "US"},
            {"value": "okadoc", "label": "Okadoc", "region": "UAE"},
            {"value": "doctoruna", "label": "DoctorUna", "region": "UAE / MENA"},
            {"value": "altibbi", "label": "Altibbi", "region": "UAE / MENA"},
        ],
    },
    {
        "value": "travel",
        "label": "Travel & Tours",
        "platforms": [
            {"value": "tripadvisor_tours", "label": "TripAdvisor Experiences", "region": "Global"},
            {"value": "viator", "label": "Viator", "region": "Global"},
            {"value": "getyourguide", "label": "GetYourGuide", "region": "Global"},
            {"value": "klook", "label": "Klook", "region": "Global / Asia"},
            {"value": "headout", "label": "Headout", "region": "Global"},
            {"value": "musement", "label": "Musement", "region": "Global"},
            {"value": "yatra", "label": "Yatra", "region": "India"},
            {"value": "thrillophilia", "label": "Thrillophilia", "region": "India"},
            {"value": "rayna_tours", "label": "Rayna Tours", "region": "UAE"},
            {"value": "expedia_travel", "label": "Expedia", "region": "Global"},
        ],
    },
    {
        "value": "real_estate",
        "label": "Properties & Real Estate",
        "platforms": [
            {"value": "zillow", "label": "Zillow", "region": "US"},
            {"value": "trulia", "label": "Trulia", "region": "US"},
            {"value": "realtor", "label": "Realtor.com", "region": "US"},
            {"value": "redfin", "label": "Redfin", "region": "US"},
            {"value": "ninety_nine_acres", "label": "99acres", "region": "India"},
            {"value": "magicbricks", "label": "MagicBricks", "region": "India"},
            {"value": "housing", "label": "Housing.com", "region": "India"},
            {"value": "nobroker", "label": "NoBroker", "region": "India"},
            {"value": "property_finder", "label": "Property Finder", "region": "UAE"},
            {"value": "bayut", "label": "Bayut", "region": "UAE"},
            {"value": "dubizzle", "label": "Dubizzle", "region": "UAE"},
        ],
    },
    {
        "value": "automotive",
        "label": "Automotive (Cars, Service Centres)",
        "platforms": [
            {"value": "cars_com", "label": "Cars.com", "region": "US"},
            {"value": "edmunds", "label": "Edmunds", "region": "US"},
            {"value": "kbb", "label": "Kelley Blue Book", "region": "US"},
            {"value": "carwale", "label": "CarWale", "region": "India"},
            {"value": "cardekho", "label": "CarDekho", "region": "India"},
            {"value": "carwow", "label": "CarWow", "region": "Global"},
            {"value": "yallamotor", "label": "YallaMotor", "region": "UAE / GCC"},
            {"value": "dubicars", "label": "DubiCars", "region": "UAE"},
        ],
    },
    {
        "value": "ecommerce_retail",
        "label": "E-commerce & Retail",
        "platforms": [
            {"value": "amazon", "label": "Amazon", "region": "Global"},
            {"value": "google_shopping", "label": "Google Shopping", "region": "Global"},
            {"value": "trustpilot_retail", "label": "Trustpilot", "region": "Global"},
            {"value": "flipkart", "label": "Flipkart", "region": "India"},
            {"value": "myntra", "label": "Myntra", "region": "India"},
            {"value": "noon", "label": "Noon", "region": "UAE / KSA"},
            {"value": "amazon_ae", "label": "Amazon.ae", "region": "UAE"},
            {"value": "best_buy", "label": "Best Buy", "region": "US"},
            {"value": "walmart", "label": "Walmart", "region": "US"},
            {"value": "target", "label": "Target", "region": "US"},
        ],
    },
    {
        "value": "beauty_wellness",
        "label": "Beauty, Salons & Wellness",
        "platforms": [
            {"value": "fresha", "label": "Fresha", "region": "Global"},
            {"value": "booksy", "label": "Booksy", "region": "Global"},
            {"value": "vagaro", "label": "Vagaro", "region": "US"},
            {"value": "mindbody", "label": "MindBody", "region": "US"},
            {"value": "styleseat", "label": "StyleSeat", "region": "US"},
            {"value": "urban_company", "label": "Urban Company", "region": "India / UAE"},
            {"value": "nykaa", "label": "Nykaa", "region": "India"},
            {"value": "spa_dubai", "label": "Spas of Dubai", "region": "UAE"},
        ],
    },
    {
        "value": "education",
        "label": "Education & Coaching",
        "platforms": [
            {"value": "google_edu", "label": "Google", "region": "Global"},
            {"value": "niche", "label": "Niche", "region": "US"},
            {"value": "great_schools", "label": "GreatSchools", "region": "US"},
            {"value": "urbanpro", "label": "UrbanPro", "region": "India"},
            {"value": "shiksha", "label": "Shiksha", "region": "India"},
            {"value": "collegedunia", "label": "Collegedunia", "region": "India"},
            {"value": "edarabia", "label": "Edarabia", "region": "UAE"},
            {"value": "khda", "label": "KHDA", "region": "UAE"},
        ],
    },
    {
        "value": "professional_b2b",
        "label": "Professional / B2B Services",
        "platforms": [
            {"value": "clutch", "label": "Clutch", "region": "Global"},
            {"value": "g2", "label": "G2", "region": "Global"},
            {"value": "capterra", "label": "Capterra", "region": "Global"},
            {"value": "trustpilot", "label": "Trustpilot", "region": "Global"},
            {"value": "good_firms", "label": "GoodFirms", "region": "Global"},
            {"value": "designrush", "label": "DesignRush", "region": "US / Global"},
        ],
    },
    {
        "value": "local_general",
        "label": "Local Listings & General Services",
        "platforms": [
            {"value": "google", "label": "Google", "region": "Global"},
            {"value": "yelp_local", "label": "Yelp", "region": "US"},
            {"value": "trustpilot_local", "label": "Trustpilot", "region": "Global"},
            {"value": "facebook", "label": "Facebook", "region": "Global"},
            {"value": "justdial", "label": "Justdial", "region": "India"},
            {"value": "sulekha", "label": "Sulekha", "region": "India"},
            {"value": "yellow_pages_uae", "label": "Yellow Pages UAE", "region": "UAE"},
            {"value": "connect_uae", "label": "Connect.ae", "region": "UAE"},
            {"value": "bbb", "label": "BBB", "region": "US"},
            {"value": "angi", "label": "Angi (Angie's List)", "region": "US"},
        ],
    },
    {
        "value": "other",
        "label": "Other / Custom",
        "platforms": [
            {"value": "other", "label": "Other (custom name)", "region": "—"},
        ],
    },
]


def _platform_label_from_catalog(platform_key: str) -> Optional[str]:
    for cat in PLATFORM_CATEGORIES:
        for p in cat.get("platforms", []):
            if p["value"] == platform_key:
                return p["label"]
    # Fallback to legacy flat list
    option = next((o for o in PLATFORM_OPTIONS if o["value"] == platform_key), None)
    return option["label"] if option else None


def _get_branch_query(current_user, branch_id: str = None):
    client_id = current_user.get("client_id")
    if not client_id:
        raise HTTPException(status_code=403, detail="No client context")
    q = {"client_id": client_id}
    if branch_id:
        q["branch_id"] = branch_id
    return q


# ─── Settings ────────────────────────────────────────────────────────────────

@router.get("/settings")
async def get_review_link_settings(
    branch_id: str = Query(None),
    current_user=Depends(get_current_user),
):
    client_id = current_user.get("client_id")
    if not client_id:
        raise HTTPException(status_code=403, detail="No client context")

    q = {"client_id": client_id}
    if branch_id:
        q["branch_id"] = branch_id

    doc = await db.review_link_settings.find_one(q, {"_id": 0})

    if not doc:
        bid = branch_id or "default"
        doc = {
            "id": str(uuid.uuid4()),
            "client_id": client_id,
            "branch_id": bid,
            "positive_only": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.review_link_settings.insert_one(doc)
        doc.pop("_id", None)

    return doc


def _normalize_rating_dimensions(raw):
    """Accept a user-supplied list of rating dimensions and normalise it.

    Each entry must have a non-empty `label` (max 60 chars). `id` is generated
    if missing. `required` defaults to True. Caller can pass an empty list to
    fall back to the implicit single "How was your experience?" prompt.
    """
    if not isinstance(raw, list):
        return None
    cleaned = []
    seen_ids = set()
    for item in raw[:10]:  # cap at 10 dimensions
        if not isinstance(item, dict):
            continue
        label = (item.get("label") or "").strip()[:60]
        if not label:
            continue
        dim_id = (item.get("id") or "").strip() or str(uuid.uuid4())
        if dim_id in seen_ids:
            continue
        seen_ids.add(dim_id)
        cleaned.append({
            "id": dim_id,
            "label": label,
            "required": bool(item.get("required", True)),
        })
    return cleaned


@router.put("/settings")
async def update_review_link_settings(
    body: dict,
    branch_id: str = Query(None),
    current_user=Depends(require_role("business_admin")),
):
    client_id = current_user.get("client_id")
    if not client_id:
        raise HTTPException(status_code=403, detail="No client context")

    q = {"client_id": client_id}
    if branch_id:
        q["branch_id"] = branch_id

    update = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if "positive_only" in body:
        update["positive_only"] = bool(body["positive_only"])
    if "rating_dimensions" in body:
        normalised = _normalize_rating_dimensions(body["rating_dimensions"])
        if normalised is None:
            raise HTTPException(status_code=400, detail="rating_dimensions must be a list")
        update["rating_dimensions"] = normalised

    bid = branch_id or "default"
    await db.review_link_settings.update_one(
        q,
        {
            "$set": update,
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "client_id": client_id,
                "branch_id": bid,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
        },
        upsert=True,
    )
    return {"status": "ok"}


# ─── Custom Review Platforms ──────────────────────────────────────────────────

@router.get("/platform-options")
async def get_platform_options(current_user=Depends(get_current_user)):
    """Return the legacy flat list of predefined platform options (kept for backward compatibility)."""
    return {"options": PLATFORM_OPTIONS}


@router.get("/platform-categories")
async def get_platform_categories(current_user=Depends(get_current_user)):
    """Return the categorized catalog of review platforms.

    Returns a list of categories, each containing a list of platforms with
    `value`, `label`, and `region`. Includes an "Other / Custom" category at
    the end so the user can add an arbitrary platform.
    """
    return {"categories": PLATFORM_CATEGORIES}


@router.get("/custom-platforms")
async def get_custom_platforms(
    branch_id: str = Query(None),
    current_user=Depends(get_current_user),
):
    client_id = current_user.get("client_id")
    if not client_id:
        raise HTTPException(status_code=403, detail="No client context")

    q = {"client_id": client_id}
    if branch_id:
        q["branch_id"] = branch_id

    docs = await db.custom_review_platforms.find(q, {"_id": 0}).sort("created_at", 1).to_list(100)
    return {"platforms": docs}


@router.post("/custom-platforms")
async def add_custom_platform(
    body: dict,
    branch_id: str = Query(None),
    current_user=Depends(require_role("business_admin")),
):
    client_id = current_user.get("client_id")
    if not client_id:
        raise HTTPException(status_code=403, detail="No client context")

    platform_key = (body.get("platform_key") or "").strip()
    platform_name = (body.get("platform_name") or "").strip()
    review_url = (body.get("review_url") or "").strip()
    category = (body.get("category") or "").strip()

    if not platform_key:
        raise HTTPException(status_code=400, detail="Platform is required")
    if not review_url:
        raise HTTPException(status_code=400, detail="Review URL is required")

    # For "other", custom name is required
    if platform_key == "other" and not platform_name:
        raise HTTPException(status_code=400, detail="Platform name is required for 'Other'")

    # Resolve display name from catalog (categorized first, then legacy)
    if platform_key != "other":
        resolved = _platform_label_from_catalog(platform_key)
        platform_name = resolved or platform_name or platform_key

    bid = branch_id or "default"
    doc = {
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "branch_id": bid,
        "platform_key": platform_key,
        "platform_name": platform_name,
        "category": category or None,
        "review_url": review_url,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.custom_review_platforms.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/custom-platforms/{platform_id}")
async def delete_custom_platform(
    platform_id: str,
    current_user=Depends(require_role("business_admin")),
):
    client_id = current_user.get("client_id")
    if not client_id:
        raise HTTPException(status_code=403, detail="No client context")

    result = await db.custom_review_platforms.delete_one(
        {"id": platform_id, "client_id": client_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Platform not found")
    return {"status": "ok"}

@router.get("/public/{branch_id}")
async def get_public_review_info(branch_id: str):
    """Public endpoint: get business info and settings for the review form."""
    settings = await db.review_link_settings.find_one(
        {"branch_id": branch_id}, {"_id": 0}
    )
    if not settings:
        settings = await db.review_link_settings.find_one(
            {"branch_id": "default"}, {"_id": 0}
        )

    client_id = settings.get("client_id") if settings else None
    if not client_id:
        raise HTTPException(status_code=404, detail="Review link not found")

    client = await db.clients.find_one(
        {"id": client_id},
        {"_id": 0, "name": 1, "business_type": 1},
    )

    branch = await db.branches.find_one(
        {"id": branch_id, "client_id": client_id},
        {"_id": 0, "name": 1},
    )

    return {
        "business_name": client.get("name", "Business") if client else "Business",
        "branch_name": branch.get("name") if branch else None,
        "positive_only": settings.get("positive_only", False) if settings else False,
        "rating_dimensions": (settings.get("rating_dimensions") or []) if settings else [],
    }


@router.get("/public/{branch_id}/platforms")
async def get_public_platforms(branch_id: str):
    """Public endpoint: get connected review platforms for redirection."""
    settings = await db.review_link_settings.find_one(
        {"branch_id": branch_id}, {"_id": 0}
    )
    if not settings:
        settings = await db.review_link_settings.find_one(
            {"branch_id": "default"}, {"_id": 0}
        )

    client_id = settings.get("client_id") if settings else None
    if not client_id:
        return {"platforms": []}

    connections = await db.platform_connections.find(
        {"client_id": client_id, "branch_id": branch_id, "status": "connected"},
        {"_id": 0, "platform": 1, "account_name": 1, "review_url": 1, "profile_url": 1},
    ).to_list(50)

    # Also get GMB data for Google review URL
    gmb = await db.gmb_businesses.find_one(
        {"client_id": client_id, "branch_id": branch_id},
        {"_id": 0, "place_id": 1, "google_maps_uri": 1, "place_name": 1},
    )

    platforms = []
    seen = set()
    for conn in connections:
        p = conn.get("platform", "")
        if p in seen:
            continue
        if p not in REVIEW_PLATFORMS:
            continue

        review_url = conn.get("review_url") or conn.get("profile_url") or ""
        if p == "google" and gmb and gmb.get("place_id"):
            review_url = f"https://search.google.com/local/writereview?placeid={gmb['place_id']}"

        if review_url:
            seen.add(p)
            platforms.append({
                "platform": p,
                "name": REVIEW_PLATFORMS[p]["name"],
                "review_url": review_url,
            })

    # Add custom platforms
    custom = await db.custom_review_platforms.find(
        {"client_id": client_id, "branch_id": branch_id},
        {"_id": 0, "platform_key": 1, "platform_name": 1, "review_url": 1},
    ).to_list(100)

    for cp in custom:
        key = cp.get("platform_key", "")
        unique_key = key if key != "other" else cp.get("platform_name", "")
        if unique_key in seen:
            continue
        seen.add(unique_key)
        platforms.append({
            "platform": key,
            "name": cp.get("platform_name", key),
            "review_url": cp.get("review_url", ""),
        })

    return {"platforms": platforms}


@router.post("/public/{branch_id}/submit")
async def submit_public_review(branch_id: str, body: dict):
    """Public endpoint: submit a review from the shareable link."""
    name = (body.get("name") or "").strip()
    email = (body.get("email") or "").strip()
    mobile = (body.get("mobile") or "").strip()
    review_text = (body.get("review_text") or "").strip()
    dob = (body.get("date_of_birth") or "").strip() or None

    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    settings = await db.review_link_settings.find_one(
        {"branch_id": branch_id}, {"_id": 0}
    )
    if not settings:
        settings = await db.review_link_settings.find_one(
            {"branch_id": "default"}, {"_id": 0}
        )

    client_id = settings.get("client_id") if settings else None
    if not client_id:
        raise HTTPException(status_code=404, detail="Review link not configured")

    configured_dims = settings.get("rating_dimensions") or [] if settings else []

    # Per-dimension ratings (multi-aspect). Falls back to single legacy rating
    # field for backward-compatibility with older clients of the API.
    raw_ratings = body.get("ratings") or []
    legacy_rating = body.get("rating")
    per_dim_scores: list[dict] = []

    if isinstance(raw_ratings, list) and raw_ratings:
        # Index configured dims by id for label resolution
        dim_lookup = {d["id"]: d for d in configured_dims if d.get("id")}
        for r in raw_ratings:
            if not isinstance(r, dict):
                continue
            rid = (r.get("id") or "").strip()
            if not rid:
                continue
            try:
                value = float(r.get("value"))
            except (ValueError, TypeError):
                continue
            if value < 0.5 or value > 5:
                continue
            label = (r.get("label") or dim_lookup.get(rid, {}).get("label") or "Rating").strip()[:60]
            per_dim_scores.append({"id": rid, "label": label, "value": value})

    if not per_dim_scores and legacy_rating is not None:
        # Caller used the legacy single-rating shape — synthesise one entry
        try:
            value = float(legacy_rating)
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid rating")
        if value < 0.5 or value > 5:
            raise HTTPException(status_code=400, detail="Rating must be between 0.5 and 5")
        # Use the first configured dimension's id+label, or the implicit default
        if configured_dims:
            d0 = configured_dims[0]
            per_dim_scores = [{"id": d0["id"], "label": d0["label"], "value": value}]
        else:
            per_dim_scores = [{"id": "default", "label": "How was your experience?", "value": value}]

    if not per_dim_scores:
        raise HTTPException(status_code=400, detail="Rating is required")

    # Enforce required dimensions
    submitted_ids = {r["id"] for r in per_dim_scores}
    for d in configured_dims:
        if d.get("required") and d["id"] not in submitted_ids:
            raise HTTPException(status_code=400, detail=f"'{d['label']}' rating is required")

    # Average across submitted dimensions — used for the legacy `rating` field,
    # backwards-compatible with the existing UI / CSV / filters.
    avg_rating = round(sum(r["value"] for r in per_dim_scores) / len(per_dim_scores), 2)

    positive_only = settings.get("positive_only", False) if settings else False
    is_positive = avg_rating >= 3.5
    redirect_to_platforms = positive_only and is_positive

    submission = {
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "branch_id": branch_id,
        "name": name,
        "email": email,
        "mobile": mobile,
        "date_of_birth": dob,
        "rating": avg_rating,
        "ratings": per_dim_scores,
        "review_text": review_text,
        "is_positive": is_positive,
        "redirected_to_platforms": redirect_to_platforms,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.review_submissions.insert_one(submission)
    submission.pop("_id", None)

    return {
        "status": "ok",
        "redirect_to_platforms": redirect_to_platforms,
        "submission_id": submission["id"],
    }


# ─── Submissions List (Auth Required) ────────────────────────────────────────

@router.get("/submissions")
async def get_submissions(
    branch_id: str = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    rating_filter: str = Query(None),
    search: str = Query(None),
    dob_from: str = Query(None, description="Filter submissions where date_of_birth >= this date (YYYY-MM-DD)"),
    dob_to: str = Query(None, description="Filter submissions where date_of_birth <= this date (YYYY-MM-DD)"),
    current_user=Depends(get_current_user),
):
    client_id = current_user.get("client_id")
    if not client_id:
        raise HTTPException(status_code=403, detail="No client context")

    q = {"client_id": client_id}
    if branch_id:
        q["branch_id"] = branch_id

    if rating_filter and rating_filter != "all":
        if rating_filter == "positive":
            q["is_positive"] = True
        elif rating_filter == "negative":
            q["is_positive"] = False
        else:
            try:
                q["rating"] = float(rating_filter)
            except ValueError:
                pass

    # Date of Birth range filter (YYYY-MM-DD strings — lexicographic comparison works for ISO dates).
    # $gte/$lte on a string field automatically excludes documents where date_of_birth is null/missing.
    dob_query = {}
    if dob_from:
        dob_query["$gte"] = dob_from.strip()
    if dob_to:
        dob_query["$lte"] = dob_to.strip()
    if dob_query:
        q["date_of_birth"] = dob_query

    if search:
        search_lower = search.lower()
        q["$or"] = [
            {"name": {"$regex": search_lower, "$options": "i"}},
            {"email": {"$regex": search_lower, "$options": "i"}},
            {"review_text": {"$regex": search_lower, "$options": "i"}},
        ]

    total = await db.review_submissions.count_documents(q)
    skip = (page - 1) * limit

    docs = await db.review_submissions.find(q, {"_id": 0}).sort(
        "created_at", -1
    ).skip(skip).limit(limit).to_list(limit)

    return {
        "submissions": docs,
        "total": total,
        "page": page,
        "total_pages": math.ceil(total / limit) if total > 0 else 1,
    }



# ─── CSV Export ───────────────────────────────────────────────────────────────

@router.get("/submissions/export")
async def export_submissions_csv(
    branch_id: str = Query(None),
    period: str = Query("all"),  # today, weekly, monthly, all
    current_user=Depends(get_current_user),
):
    """
    Export review submissions as a CSV file.
    Supports filtering by time period: today, weekly, monthly, all.
    """
    client_id = current_user.get("client_id")
    if not client_id:
        raise HTTPException(status_code=403, detail="No client context")

    q = {"client_id": client_id}
    if branch_id:
        q["branch_id"] = branch_id

    # Apply time-based filter
    now = datetime.now(timezone.utc)
    if period == "today":
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
        q["created_at"] = {"$gte": start_of_day.isoformat()}
    elif period == "weekly":
        start_of_week = now - timedelta(days=7)
        q["created_at"] = {"$gte": start_of_week.isoformat()}
    elif period == "monthly":
        start_of_month = now - timedelta(days=30)
        q["created_at"] = {"$gte": start_of_month.isoformat()}
    # "all" applies no time filter

    docs = await db.review_submissions.find(q, {"_id": 0}).sort(
        "created_at", -1
    ).to_list(10000)

    # Generate CSV
    output = io.StringIO()
    writer = csv.writer(output)

    # Header row
    writer.writerow([
        "Name", "Email", "Mobile", "Rating", "Sentiment",
        "Review Text", "Redirected to Platforms", "Submitted At"
    ])

    # Data rows
    for doc in docs:
        writer.writerow([
            doc.get("name", ""),
            doc.get("email", ""),
            doc.get("mobile", ""),
            doc.get("rating", ""),
            "Positive" if doc.get("is_positive") else "Negative",
            doc.get("review_text", ""),
            "Yes" if doc.get("redirected_to_platforms") else "No",
            doc.get("created_at", ""),
        ])

    output.seek(0)
    filename = f"review_submissions_{period}_{now.strftime('%Y%m%d')}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
