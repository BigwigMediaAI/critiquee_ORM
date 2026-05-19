"""
Google My Business Routes
Independent module using Google Places API (public data only, no OAuth).
Provides business search, review statistics, competitor analysis,
performance metrics, and AI-powered sentiment analysis.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from database import db
from auth import get_current_user, require_role
from encryption import encrypt_token, decrypt_token, is_encrypted
from services.google_api import get_google_api
from datetime import datetime, timezone, date, timedelta
import httpx
import uuid
import os
import json
import logging
import math

router = APIRouter()
logger = logging.getLogger(__name__)

PLACES_API_BASE = "https://places.googleapis.com/v1"


# ─── Google Places API Helper ───────────────────────────────────────────────

class GooglePlacesClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.headers = {
            "X-Goog-Api-Key": api_key,
            "Content-Type": "application/json",
        }

    async def text_search(self, query: str, max_results: int = 10):
        field_mask = "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.types,places.businessStatus,places.googleMapsUri"
        headers = {**self.headers, "X-Goog-FieldMask": field_mask}
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{PLACES_API_BASE}/places:searchText",
                headers=headers,
                json={"textQuery": query, "maxResultCount": max_results},
            )
            if resp.status_code != 200:
                logger.error(f"Places text search failed: {resp.status_code} {resp.text[:300]}")
                return {"error": resp.json().get("error", {}).get("message", resp.text[:200]), "places": []}
            return resp.json()

    async def get_place_details(self, place_id: str):
        field_mask = "id,displayName,formattedAddress,location,rating,userRatingCount,reviews,types,businessStatus,websiteUri,googleMapsUri,internationalPhoneNumber,regularOpeningHours,photos"
        headers = {**self.headers, "X-Goog-FieldMask": field_mask}
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{PLACES_API_BASE}/places/{place_id}",
                headers=headers,
            )
            if resp.status_code != 200:
                logger.error(f"Place details failed: {resp.status_code} {resp.text[:300]}")
                return {"error": resp.json().get("error", {}).get("message", resp.text[:200])}
            return resp.json()

    async def rank_search(self, business_type: str, area: str, max_results: int = 20):
        """Text search to find ranking position among similar businesses."""
        query = f"{business_type} in {area}"
        field_mask = "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.types,places.businessStatus,places.googleMapsUri"
        headers = {**self.headers, "X-Goog-FieldMask": field_mask}
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{PLACES_API_BASE}/places:searchText",
                headers=headers,
                json={"textQuery": query, "maxResultCount": max_results},
            )
            if resp.status_code != 200:
                logger.error(f"Rank search failed: {resp.status_code} {resp.text[:300]}")
                return {"error": resp.json().get("error", {}).get("message", resp.text[:200]), "places": []}
            return resp.json()

    async def nearby_search(self, lat: float, lng: float, included_types: list, radius: float = 5000, max_results: int = 20):
        field_mask = "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.types,places.businessStatus,places.googleMapsUri"
        headers = {**self.headers, "X-Goog-FieldMask": field_mask}
        body = {
            "locationRestriction": {
                "circle": {
                    "center": {"latitude": lat, "longitude": lng},
                    "radius": radius,
                }
            },
            "maxResultCount": min(max_results, 20),
        }
        if included_types:
            body["includedTypes"] = included_types
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{PLACES_API_BASE}/places:searchNearby",
                headers=headers,
                json=body,
            )
            if resp.status_code != 200:
                logger.error(f"Nearby search failed: {resp.status_code} {resp.text[:300]}")
                return {"error": resp.json().get("error", {}).get("message", resp.text[:200]), "places": []}
            return resp.json()


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _get_gmb_query(current_user, branch_id: str = None):
    client_id = current_user.get("client_id")
    if not client_id:
        raise HTTPException(status_code=403, detail="No client context")
    q = {"client_id": client_id}
    if branch_id:
        q["branch_id"] = branch_id
    return q


async def _get_places_client(current_user, branch_id: str = None) -> GooglePlacesClient:
    q = _get_gmb_query(current_user, branch_id)
    doc = await db.gmb_businesses.find_one(q, {"_id": 0, "google_api_key": 1})
    if not doc or not doc.get("google_api_key"):
        raise HTTPException(status_code=400, detail="Google API key not configured. Please add your Google Places API key first.")
    api_key = doc["google_api_key"]
    if is_encrypted(api_key):
        api_key = decrypt_token(api_key)
    return GooglePlacesClient(api_key)


def _estimate_rating_distribution(avg_rating: float, total_count: int, sample_reviews: list) -> dict:
    """Estimate 1-5 star distribution from average, total count, and sample reviews."""
    dist = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    if total_count == 0:
        return dist

    # Count sample reviews
    for r in sample_reviews:
        rating = r.get("rating", 0)
        if 1 <= rating <= 5:
            dist[rating] += 1

    sample_count = len(sample_reviews)
    remaining = max(0, total_count - sample_count)

    if remaining == 0:
        return dist

    # Calculate remaining sum needed
    sample_sum = sum(r.get("rating", 0) for r in sample_reviews if 1 <= r.get("rating", 0) <= 5)
    target_sum = avg_rating * total_count - sample_sum

    # Weight towards average with realistic spread
    weights = {}
    for star in range(1, 6):
        distance = abs(star - avg_rating)
        weights[star] = max(0.05, math.exp(-distance * 1.2))

    total_weight = sum(weights.values())
    allocated = 0
    for star in range(1, 6):
        count = round(remaining * weights[star] / total_weight)
        dist[star] += count
        allocated += count

    # Fix rounding difference
    diff = total_count - sum(dist.values())
    if diff != 0:
        nearest_star = round(avg_rating)
        nearest_star = max(1, min(5, nearest_star))
        dist[nearest_star] += diff

    return dist


def _compute_performance_score(business: dict, competitors: list) -> dict:
    """Compute a performance score based on publicly available data."""
    rating = business.get("rating", 0)
    review_count = business.get("user_rating_count", 0)
    has_website = bool(business.get("website_uri"))
    has_phone = bool(business.get("phone_number"))

    # Rating score (0-30)
    rating_score = min(30, (rating / 5) * 30) if rating else 0

    # Review volume score (0-25) - logarithmic
    if review_count > 0:
        volume_score = min(25, math.log10(review_count + 1) * 10)
    else:
        volume_score = 0

    # Completeness score (0-20)
    completeness = 0
    if has_website:
        completeness += 10
    if has_phone:
        completeness += 10

    # Competitive score (0-25) - how you rank vs competitors
    competitive_score = 25
    if competitors:
        better_count = sum(1 for c in competitors if (c.get("rating", 0) or 0) > (rating or 0))
        total_comps = len(competitors)
        if total_comps > 0:
            competitive_score = max(0, 25 - (better_count / total_comps) * 25)

    total = round(rating_score + volume_score + completeness + competitive_score)

    return {
        "total_score": min(100, total),
        "rating_score": round(rating_score),
        "volume_score": round(volume_score),
        "completeness_score": round(completeness),
        "competitive_score": round(competitive_score),
        "breakdown": {
            "rating": {"score": round(rating_score), "max": 30, "detail": f"Average rating: {rating}/5"},
            "volume": {"score": round(volume_score), "max": 25, "detail": f"{review_count} total reviews"},
            "completeness": {"score": round(completeness), "max": 20, "detail": f"Website: {'Yes' if has_website else 'No'}, Phone: {'Yes' if has_phone else 'No'}"},
            "competitive": {"score": round(competitive_score), "max": 25, "detail": f"Based on {len(competitors)} nearby competitors"},
        },
    }


# ─── API Key Management ─────────────────────────────────────────────────────

@router.post("/api-key")
async def save_api_key(
    body: dict,
    branch_id: str = Query(None),
    current_user=Depends(require_role("business_admin")),
):
    """Save Google Places API key for this branch."""
    api_key = body.get("api_key", "").strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="API key is required")

    q = _get_gmb_query(current_user, branch_id)
    now = datetime.now(timezone.utc).isoformat()
    encrypted_key = encrypt_token(api_key)

    await db.gmb_businesses.update_one(
        q,
        {
            "$set": {"google_api_key": encrypted_key, "updated_at": now},
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "client_id": current_user.get("client_id"),
                "branch_id": branch_id,
                "created_at": now,
            },
        },
        upsert=True,
    )
    return {"status": "ok", "message": "API key saved successfully"}


@router.get("/status")
async def get_gmb_status(
    branch_id: str = Query(None),
    current_user=Depends(require_role("business_admin")),
):
    """Check if GMB is configured for this branch."""
    q = _get_gmb_query(current_user, branch_id)
    doc = await db.gmb_businesses.find_one(q, {"_id": 0, "google_api_key": 0})
    if not doc:
        return {"configured": False, "has_api_key": False, "business": None}

    has_key = bool(doc.get("google_api_key") or (await db.gmb_businesses.find_one(q, {"_id": 0, "google_api_key": 1})).get("google_api_key"))
    has_biz = bool(doc.get("place_id"))

    biz = None
    if has_biz:
        biz = {
            "place_id": doc.get("place_id"),
            "name": doc.get("place_name"),
            "address": doc.get("formatted_address"),
            "rating": doc.get("rating"),
            "user_rating_count": doc.get("user_rating_count"),
            "types": doc.get("types", []),
            "website_uri": doc.get("website_uri"),
            "google_maps_uri": doc.get("google_maps_uri"),
            "phone_number": doc.get("phone_number"),
            "lat": doc.get("lat"),
            "lng": doc.get("lng"),
        }

    return {"configured": has_biz, "has_api_key": has_key, "business": biz}


# ─── Business Search & Selection ─────────────────────────────────────────────

@router.post("/search")
async def search_businesses(
    body: dict,
    branch_id: str = Query(None),
    current_user=Depends(require_role("business_admin")),
):
    """Search for businesses using Google Places API."""
    query = body.get("query", "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="Search query is required")

    client = await _get_places_client(current_user, branch_id)
    result = await client.text_search(query, max_results=10)

    if result.get("error"):
        raise HTTPException(status_code=502, detail=result["error"])

    places = []
    for p in result.get("places", []):
        places.append({
            "place_id": p.get("id"),
            "name": p.get("displayName", {}).get("text", ""),
            "address": p.get("formattedAddress", ""),
            "rating": p.get("rating"),
            "user_rating_count": p.get("userRatingCount", 0),
            "types": p.get("types", []),
            "lat": p.get("location", {}).get("latitude"),
            "lng": p.get("location", {}).get("longitude"),
            "business_status": p.get("businessStatus"),
            "google_maps_uri": p.get("googleMapsUri"),
        })

    return {"places": places}


@router.post("/select")
async def select_business(
    body: dict,
    branch_id: str = Query(None),
    current_user=Depends(require_role("business_admin")),
):
    """Save selected business from search results."""
    place_id = body.get("place_id", "").strip()
    if not place_id:
        raise HTTPException(status_code=400, detail="Place ID is required")

    client = await _get_places_client(current_user, branch_id)
    details = await client.get_place_details(place_id)

    if details.get("error"):
        raise HTTPException(status_code=502, detail=details["error"])

    q = _get_gmb_query(current_user, branch_id)
    now = datetime.now(timezone.utc).isoformat()

    # Process reviews
    reviews = []
    for r in details.get("reviews", []):
        reviews.append({
            "rating": r.get("rating", 0),
            "text": r.get("text", {}).get("text", "") if isinstance(r.get("text"), dict) else r.get("text", ""),
            "author": r.get("authorAttribution", {}).get("displayName", "Anonymous"),
            "author_photo": r.get("authorAttribution", {}).get("photoUri"),
            "time_description": r.get("relativePublishTimeDescription", ""),
            "publish_time": r.get("publishTime", ""),
        })

    update = {
        "place_id": place_id,
        "place_name": details.get("displayName", {}).get("text", ""),
        "formatted_address": details.get("formattedAddress", ""),
        "lat": details.get("location", {}).get("latitude"),
        "lng": details.get("location", {}).get("longitude"),
        "rating": details.get("rating"),
        "user_rating_count": details.get("userRatingCount", 0),
        "types": details.get("types", []),
        "business_status": details.get("businessStatus"),
        "website_uri": details.get("websiteUri"),
        "google_maps_uri": details.get("googleMapsUri"),
        "phone_number": details.get("internationalPhoneNumber"),
        "reviews_cache": reviews,
        "reviews_cached_at": now,
        "updated_at": now,
    }

    await db.gmb_businesses.update_one(q, {"$set": update})

    # Return the saved business
    return {
        "status": "ok",
        "business": {
            "place_id": update["place_id"],
            "name": update["place_name"],
            "address": update["formatted_address"],
            "rating": update["rating"],
            "user_rating_count": update["user_rating_count"],
            "types": update["types"],
            "website_uri": update["website_uri"],
            "google_maps_uri": update["google_maps_uri"],
            "phone_number": update["phone_number"],
            "lat": update["lat"],
            "lng": update["lng"],
        },
    }


@router.delete("/business")
async def remove_business(
    branch_id: str = Query(None),
    current_user=Depends(require_role("business_admin")),
):
    """Remove connected business (keeps API key)."""
    q = _get_gmb_query(current_user, branch_id)
    await db.gmb_businesses.update_one(
        q,
        {
            "$unset": {
                "place_id": "",
                "place_name": "",
                "formatted_address": "",
                "lat": "",
                "lng": "",
                "rating": "",
                "user_rating_count": "",
                "types": "",
                "business_status": "",
                "website_uri": "",
                "google_maps_uri": "",
                "phone_number": "",
                "reviews_cache": "",
                "reviews_cached_at": "",
                "competitors_cache": "",
                "competitors_cached_at": "",
                "sentiment_cache": "",
                "sentiment_cached_at": "",
            }
        },
    )
    return {"status": "ok"}


# ─── Review Statistics ───────────────────────────────────────────────────────

@router.get("/review-stats")
async def get_review_stats(
    branch_id: str = Query(None),
    refresh: bool = Query(False),
    current_user=Depends(require_role("business_admin")),
):
    """Get review statistics for the connected business."""
    q = _get_gmb_query(current_user, branch_id)
    doc = await db.gmb_businesses.find_one(q, {"_id": 0})

    if not doc or not doc.get("place_id"):
        raise HTTPException(status_code=400, detail="No business connected")

    # Refresh reviews from Google if requested or cache older than 1 hour
    reviews = doc.get("reviews_cache", [])
    if refresh or not doc.get("reviews_cached_at"):
        client = await _get_places_client(current_user, branch_id)
        details = await client.get_place_details(doc["place_id"])
        if not details.get("error"):
            reviews = []
            for r in details.get("reviews", []):
                reviews.append({
                    "rating": r.get("rating", 0),
                    "text": r.get("text", {}).get("text", "") if isinstance(r.get("text"), dict) else r.get("text", ""),
                    "author": r.get("authorAttribution", {}).get("displayName", "Anonymous"),
                    "author_photo": r.get("authorAttribution", {}).get("photoUri"),
                    "time_description": r.get("relativePublishTimeDescription", ""),
                    "publish_time": r.get("publishTime", ""),
                })
            now = datetime.now(timezone.utc).isoformat()
            await db.gmb_businesses.update_one(q, {"$set": {
                "reviews_cache": reviews,
                "reviews_cached_at": now,
                "rating": details.get("rating", doc.get("rating")),
                "user_rating_count": details.get("userRatingCount", doc.get("user_rating_count")),
            }})
            doc["rating"] = details.get("rating", doc.get("rating"))
            doc["user_rating_count"] = details.get("userRatingCount", doc.get("user_rating_count"))

    avg_rating = doc.get("rating", 0) or 0
    total_reviews = doc.get("user_rating_count", 0) or 0
    distribution = _estimate_rating_distribution(avg_rating, total_reviews, reviews)

    # Calculate required 5-star reviews to reach target
    # Target is always 5 stars (max). Practical target is 4.9 (mathematically ~5)
    current_sum = avg_rating * total_reviews if total_reviews else 0
    target_rating = 5.0
    practical_target = 4.9  # Since exactly 5.0 needs infinite reviews
    reviews_for_target = 0
    if avg_rating < practical_target and total_reviews > 0:
        # Formula: (current_sum + 5*n) / (total_reviews + n) = practical_target
        # => n = (practical_target * total_reviews - current_sum) / (5 - practical_target)
        needed = (practical_target * total_reviews - current_sum) / (5 - practical_target)
        reviews_for_target = max(0, math.ceil(needed))

    return {
        "avg_rating": round(avg_rating, 2),
        "total_reviews": total_reviews,
        "distribution": distribution,
        "reviews": reviews,
        "reviews_for_target": reviews_for_target,
        "target_rating": target_rating,
        "practical_target": practical_target,
        "cached_at": doc.get("reviews_cached_at"),
    }


@router.get("/all-reviews")
async def get_all_reviews(
    branch_id: str = Query(None),
    rating: int = Query(None, ge=1, le=5),
    search: str = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user=Depends(require_role("business_admin")),
):
    """
    Get ALL reviews for this branch — merges:
    1. reviews synced via platform integration (reviews collection)
    2. reviews from Google Places API cache (gmb_businesses.reviews_cache)
    Deduplicates by reviewer name + rating to avoid showing the same review twice.
    """
    q = _get_gmb_query(current_user, branch_id)
    doc = await db.gmb_businesses.find_one(q, {"_id": 0})
    if not doc or not doc.get("place_id"):
        raise HTTPException(status_code=400, detail="No business connected")

    client_id = current_user.get("client_id")

    # 1. Fetch all reviews from the reviews collection for this branch
    review_query = {"client_id": client_id}
    if branch_id:
        review_query["location_id"] = branch_id

    db_reviews_raw = await db.reviews.find(
        review_query, {"_id": 0}
    ).sort("created_at", -1).to_list(5000)

    # Normalize DB reviews to a common format
    all_reviews = []
    seen_keys = set()
    for r in db_reviews_raw:
        key = (r.get("reviewer_name", "").lower().strip(), r.get("rating", 0))
        seen_keys.add(key)
        all_reviews.append({
            "author": r.get("reviewer_name", "Unknown"),
            "author_photo": r.get("reviewer_photo"),
            "rating": r.get("rating", 0),
            "text": r.get("text", ""),
            "time_description": r.get("date", ""),
            "publish_time": r.get("created_at", r.get("date", "")),
            "platform": r.get("platform", "google"),
            "sentiment": r.get("sentiment"),
            "reply_text": r.get("reply_text"),
            "source": "synced",
        })

    # 2. Merge in cached Places API reviews (avoid duplicates)
    for r in doc.get("reviews_cache", []):
        key = (r.get("author", "").lower().strip(), r.get("rating", 0))
        if key not in seen_keys:
            seen_keys.add(key)
            all_reviews.append({
                "author": r.get("author", "Unknown"),
                "author_photo": r.get("author_photo"),
                "rating": r.get("rating", 0),
                "text": r.get("text", ""),
                "time_description": r.get("time_description", ""),
                "publish_time": r.get("publish_time", ""),
                "platform": "google",
                "sentiment": None,
                "reply_text": None,
                "source": "places_api",
            })

    # 3. Apply filters
    if rating:
        all_reviews = [r for r in all_reviews if r["rating"] == rating]
    if search:
        search_lower = search.lower()
        all_reviews = [r for r in all_reviews if search_lower in r.get("text", "").lower() or search_lower in r.get("author", "").lower()]

    total = len(all_reviews)

    # 4. Paginate
    start = (page - 1) * limit
    paged = all_reviews[start : start + limit]

    return {
        "reviews": paged,
        "total": total,
        "page": page,
        "total_pages": math.ceil(total / limit) if total > 0 else 1,
    }


@router.get("/google-oauth-status")
async def get_google_oauth_status(
    branch_id: str = Query(None),
    current_user=Depends(require_role("business_admin")),
):
    """Check if Google OAuth is connected for this branch (enables full review sync)."""
    client_id = current_user.get("client_id")
    query = {"client_id": client_id, "platform": "google", "status": "connected"}
    if branch_id:
        query["branch_id"] = branch_id

    connection = await db.platform_connections.find_one(query, {"_id": 0, "access_token": 0, "refresh_token": 0, "credentials": 0})

    if not connection:
        return {"connected": False, "synced_reviews": 0}

    # Count synced reviews
    review_query = {"client_id": client_id, "platform": "google"}
    if branch_id:
        review_query["location_id"] = branch_id
    synced_count = await db.reviews.count_documents(review_query)

    return {
        "connected": True,
        "last_synced_at": connection.get("last_synced_at"),
        "sync_status": connection.get("sync_status"),
        "synced_reviews": synced_count,
    }


@router.post("/sync-reviews")
async def trigger_review_sync(
    branch_id: str = Query(None),
    current_user=Depends(require_role("business_admin")),
):
    """Trigger a full Google review sync from the GMB tab."""
    from routes.sync_routes import run_platform_sync

    client_id = current_user.get("client_id")

    # Check if Google OAuth is connected
    query = {"client_id": client_id, "platform": "google", "status": "connected"}
    if branch_id:
        query["branch_id"] = branch_id
    connection = await db.platform_connections.find_one(query)
    if not connection:
        raise HTTPException(status_code=400, detail="Google OAuth is not connected. Go to Platforms to connect your Google Business Profile.")

    result = await run_platform_sync(client_id, "google", branch_id)
    return result


# ─── Competitors ─────────────────────────────────────────────────────────────

@router.get("/competitors")
async def get_competitors(
    branch_id: str = Query(None),
    radius: float = Query(5000, ge=500, le=50000),
    refresh: bool = Query(False),
    current_user=Depends(require_role("business_admin")),
):
    """Get nearby competitors."""
    q = _get_gmb_query(current_user, branch_id)
    doc = await db.gmb_businesses.find_one(q, {"_id": 0})

    if not doc or not doc.get("place_id"):
        raise HTTPException(status_code=400, detail="No business connected")

    # Use cache if fresh and same radius
    cached = doc.get("competitors_cache")
    cached_radius = doc.get("competitors_radius")
    if cached and not refresh and cached_radius == radius:
        # Ensure rank is always computed
        cached_rank = doc.get("search_rank", 0)
        if cached_rank == 0 and cached:
            our_rating = doc.get("rating") or 0
            our_reviews = doc.get("user_rating_count") or 0
            cached_rank = 1
            for c in cached:
                c_rating = c.get("rating") or 0
                c_reviews = c.get("user_rating_count") or 0
                if c_rating > our_rating or (c_rating == our_rating and c_reviews > our_reviews):
                    cached_rank += 1
        return {
            "competitors": cached,
            "our_business": {
                "place_id": doc.get("place_id"),
                "name": doc.get("place_name"),
                "rating": doc.get("rating"),
                "user_rating_count": doc.get("user_rating_count"),
                "lat": doc.get("lat"),
                "lng": doc.get("lng"),
            },
            "search_rank": cached_rank,
            "total_in_area": len(cached) + 1,
            "radius": radius,
            "cached_at": doc.get("competitors_cached_at"),
        }

    # Get primary business type for filtering
    types = doc.get("types", [])
    generic_types = {"point_of_interest", "establishment", "political", "locality", "premise", "subpremise", "route"}
    specific_types = [t for t in types if t not in generic_types]
    primary_type = specific_types[0] if specific_types else (types[0] if types else "business")
    included_types = specific_types[:1] if specific_types else types[:1]

    client = await _get_places_client(current_user, branch_id)

    # Use text search for real Google ranking order
    area_name = doc.get("formatted_address", "").split(",")[-2].strip() if "," in doc.get("formatted_address", "") else doc.get("formatted_address", "")
    readable_type = primary_type.replace("_", " ")
    rank_result = await client.rank_search(readable_type, area_name, max_results=20)

    # Find our rank in search results (position = real Google ranking)
    search_rank = 0
    ranked_places = []
    our_place_id = doc.get("place_id")
    for idx, p in enumerate(rank_result.get("places", []), 1):
        pid = p.get("id")
        if pid == our_place_id:
            search_rank = idx
        # Filter: only include businesses sharing at least one specific type
        p_types = set(p.get("types", []))
        our_types = set(specific_types) if specific_types else set(types)
        has_overlap = bool(p_types & our_types)
        if has_overlap and pid != our_place_id:
            ranked_places.append({
                "place_id": pid,
                "name": p.get("displayName", {}).get("text", ""),
                "address": p.get("formattedAddress", ""),
                "rating": p.get("rating"),
                "user_rating_count": p.get("userRatingCount", 0),
                "types": p.get("types", []),
                "lat": p.get("location", {}).get("latitude"),
                "lng": p.get("location", {}).get("longitude"),
                "google_maps_uri": p.get("googleMapsUri"),
                "search_rank": idx,
            })

    # If not found in text search, also do nearby search for more competitors
    if not ranked_places:
        result = await client.nearby_search(
            lat=doc["lat"], lng=doc["lng"],
            included_types=included_types,
            radius=radius,
            max_results=20,
        )
        for p in result.get("places", []):
            pid = p.get("id")
            if pid == our_place_id:
                continue
            p_types = set(p.get("types", []))
            our_types = set(specific_types) if specific_types else set(types)
            has_overlap = bool(p_types & our_types)
            if has_overlap:
                ranked_places.append({
                    "place_id": pid,
                    "name": p.get("displayName", {}).get("text", ""),
                    "address": p.get("formattedAddress", ""),
                    "rating": p.get("rating"),
                    "user_rating_count": p.get("userRatingCount", 0),
                    "types": p.get("types", []),
                    "lat": p.get("location", {}).get("latitude"),
                    "lng": p.get("location", {}).get("longitude"),
                    "google_maps_uri": p.get("googleMapsUri"),
                    "search_rank": 0,
                })

    competitors = ranked_places

    # Keep search order (which is real Google ranking)
    # Only sort by rating if no search_rank available
    if any(c.get("search_rank", 0) > 0 for c in competitors):
        competitors.sort(key=lambda x: (x.get("search_rank", 999)))
    else:
        competitors.sort(key=lambda x: (-(x.get("rating") or 0), -(x.get("user_rating_count") or 0)))

    # If not found in Google search, compute rank among shown competitors
    if search_rank == 0 and competitors:
        our_rating = doc.get("rating") or 0
        our_reviews = doc.get("user_rating_count") or 0
        computed_rank = 1
        for c in competitors:
            c_rating = c.get("rating") or 0
            c_reviews = c.get("user_rating_count") or 0
            if c_rating > our_rating or (c_rating == our_rating and c_reviews > our_reviews):
                computed_rank += 1
        search_rank = computed_rank

    now = datetime.now(timezone.utc).isoformat()
    await db.gmb_businesses.update_one(q, {"$set": {
        "competitors_cache": competitors,
        "competitors_cached_at": now,
        "competitors_radius": radius,
        "search_rank": search_rank,
    }})

    return {
        "competitors": competitors,
        "our_business": {
            "place_id": doc.get("place_id"),
            "name": doc.get("place_name"),
            "rating": doc.get("rating"),
            "user_rating_count": doc.get("user_rating_count"),
            "lat": doc.get("lat"),
            "lng": doc.get("lng"),
        },
        "search_rank": search_rank,
        "total_in_area": len(competitors) + 1,
        "radius": radius,
        "cached_at": now,
    }


# ─── Performance ─────────────────────────────────────────────────────────────

# In-memory cache for the (place_id → location resource name) mapping. Avoids
# hitting the Account Management + Business Information APIs on every Insights
# request. Each entry lives for 24 hours.
_BP_LOCATION_CACHE: dict = {}


async def _resolve_bp_location_id(client_id: str, branch_id: str | None, place_id: str) -> tuple[str | None, str | None]:
    """Return (location_resource, error). Caches the mapping per place_id.

    A cached value is also persisted onto the gmb_businesses document so that
    later requests skip the discovery API calls entirely.
    """
    cache_key = f"{client_id}:{branch_id or '_'}:{place_id}"
    cached = _BP_LOCATION_CACHE.get(cache_key)
    if cached and (cached[1] > datetime.now(timezone.utc).timestamp()):
        return cached[0], None

    # Try the persisted value first
    doc_query = {"client_id": client_id}
    if branch_id:
        doc_query["branch_id"] = branch_id
    persisted = await db.gmb_businesses.find_one(doc_query, {"_id": 0, "bp_location_id": 1})
    if persisted and persisted.get("bp_location_id"):
        _BP_LOCATION_CACHE[cache_key] = (persisted["bp_location_id"], datetime.now(timezone.utc).timestamp() + 86400)
        return persisted["bp_location_id"], None

    api = await get_google_api(db, client_id, branch_id)
    if not api:
        return None, "Google Business Profile is not connected. Authorise it from Platforms first."

    resource = await api.find_location_id_by_place_id(place_id)
    if not resource:
        return None, "Could not match this business's place_id to any location in your Google Business Profile account."

    # Persist + cache
    await db.gmb_businesses.update_one(doc_query, {"$set": {"bp_location_id": resource}})
    _BP_LOCATION_CACHE[cache_key] = (resource, datetime.now(timezone.utc).timestamp() + 86400)
    return resource, None


def _aggregate_metric_series(series_payload: list) -> dict:
    """Collapse the GBP performance response into UI-friendly buckets.

    Returns:
      {
        "totals": {metric_key: int},              # sum across the range
        "timeseries": [{date, impressions, calls, directions, website_clicks, messages, bookings}, ...]
      }
    """
    # Group impression metrics into a single "impressions" bucket
    IMPRESSION_KEYS = {
        "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
        "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
        "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
        "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
    }
    DISPLAY_MAP = {
        "CALL_CLICKS": "calls",
        "WEBSITE_CLICKS": "website_clicks",
        "BUSINESS_DIRECTION_REQUESTS": "directions",
        "BUSINESS_CONVERSATIONS": "messages",
        "BUSINESS_BOOKINGS": "bookings",
        "BUSINESS_FOOD_ORDERS": "food_orders",
        "BUSINESS_FOOD_MENU_CLICKS": "food_menu_clicks",
    }

    by_date: dict[str, dict] = {}
    totals: dict[str, int] = {}

    for entry in series_payload:
        metric_name = entry.get("dailyMetric")
        bucket = "impressions" if metric_name in IMPRESSION_KEYS else DISPLAY_MAP.get(metric_name)
        if not bucket:
            continue
        ts = (entry.get("timeSeries") or {}).get("datedValues") or []
        for dv in ts:
            d = dv.get("date") or {}
            iso = f"{d.get('year', 1970):04d}-{d.get('month', 1):02d}-{d.get('day', 1):02d}"
            try:
                value = int(dv.get("value") or 0)
            except (ValueError, TypeError):
                value = 0
            row = by_date.setdefault(iso, {"date": iso})
            row[bucket] = row.get(bucket, 0) + value
            totals[bucket] = totals.get(bucket, 0) + value

    timeseries = sorted(by_date.values(), key=lambda r: r["date"])
    # Ensure all rows expose every bucket (so charts don't break)
    for row in timeseries:
        for k in ("impressions", "calls", "website_clicks", "directions", "messages", "bookings"):
            row.setdefault(k, 0)
    return {"totals": totals, "timeseries": timeseries}


@router.get("/insights")
async def get_business_profile_insights(
    days: int = Query(30, ge=1, le=540),
    branch_id: str = Query(None),
    current_user=Depends(require_role("business_admin")),
):
    """Real Google Business Profile Performance metrics for the connected location.

    Returns a structured payload suitable for direct rendering on the
    Insights tab — KPI totals, daily time-series, and the top search keywords
    customers used to find this business.
    """
    client_id = current_user.get("client_id")
    if not client_id:
        raise HTTPException(status_code=403, detail="No client context")

    q = _get_gmb_query(current_user, branch_id)
    doc = await db.gmb_businesses.find_one(q, {"_id": 0})
    if not doc or not doc.get("place_id"):
        return {
            "status": "no_business",
            "message": "Connect a Google Business Profile from the GMB tab to see performance insights.",
        }

    # Resolve the business's BP location resource name (cached)
    location_resource, err = await _resolve_bp_location_id(client_id, branch_id, doc["place_id"])
    if err:
        return {"status": "not_authorised", "message": err}

    api = await get_google_api(db, client_id, branch_id)
    if not api:
        return {
            "status": "not_authorised",
            "message": "Google Business Profile OAuth has been disconnected. Reconnect from Platforms.",
        }

    end = date.today()
    start = end - timedelta(days=days - 1)

    perf = await api.get_performance_metrics(location_resource, start, end)
    if perf.get("error"):
        return {
            "status": "auth_error" if perf.get("auth_error") else "error",
            "message": perf.get("error"),
        }

    aggregated = _aggregate_metric_series(perf.get("series") or [])

    # Search keywords (most-recent month — Google's API granularity)
    kw_resp = await api.get_search_keywords(location_resource, months_back=1)
    keywords = kw_resp.get("keywords") or []

    return {
        "status": "ok",
        "range": {"start": start.isoformat(), "end": end.isoformat(), "days": days},
        "business_name": doc.get("name") or doc.get("business_name"),
        "location_resource": location_resource,
        "totals": aggregated["totals"],
        "timeseries": aggregated["timeseries"],
        "keywords": keywords[:25],
        "keywords_error": kw_resp.get("error"),
    }


@router.get("/performance")
async def get_performance(
    branch_id: str = Query(None),
    current_user=Depends(require_role("business_admin")),
):
    """Get computed performance metrics."""
    q = _get_gmb_query(current_user, branch_id)
    doc = await db.gmb_businesses.find_one(q, {"_id": 0})

    if not doc or not doc.get("place_id"):
        raise HTTPException(status_code=400, detail="No business connected")

    competitors = doc.get("competitors_cache", [])
    score = _compute_performance_score(doc, competitors)

    # Keyword insights based on business types
    types = doc.get("types", [])
    generic_types = {"point_of_interest", "establishment", "political", "locality"}
    keywords = [t.replace("_", " ").title() for t in types if t not in generic_types]

    # Compute rank among competitors
    all_businesses = competitors + [{
        "place_id": doc.get("place_id"),
        "name": doc.get("place_name"),
        "rating": doc.get("rating"),
        "user_rating_count": doc.get("user_rating_count"),
    }]
    all_businesses.sort(key=lambda x: (-(x.get("rating") or 0), -(x.get("user_rating_count") or 0)))
    rank = next((i + 1 for i, b in enumerate(all_businesses) if b.get("place_id") == doc.get("place_id")), len(all_businesses))

    return {
        "score": score,
        "rank": rank,
        "total_in_area": len(all_businesses),
        "keywords": keywords,
        "business_name": doc.get("place_name"),
        "rating": doc.get("rating"),
        "user_rating_count": doc.get("user_rating_count"),
        "has_website": bool(doc.get("website_uri")),
        "has_phone": bool(doc.get("phone_number")),
    }


# ─── Sentiment Analysis (AI-powered) ────────────────────────────────────────

@router.post("/sentiment")
async def run_sentiment_analysis(
    branch_id: str = Query(None),
    current_user=Depends(require_role("business_admin")),
):
    """Run AI sentiment analysis on business reviews."""
    q = _get_gmb_query(current_user, branch_id)
    doc = await db.gmb_businesses.find_one(q, {"_id": 0})

    if not doc or not doc.get("place_id"):
        raise HTTPException(status_code=400, detail="No business connected")

    reviews = doc.get("reviews_cache", [])
    if not reviews:
        raise HTTPException(status_code=400, detail="No reviews available for analysis")

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="AI service not configured")

    # Build review text for analysis
    review_texts = []
    for i, r in enumerate(reviews, 1):
        text = r.get("text", "").strip()
        rating = r.get("rating", 0)
        if text:
            review_texts.append(f"Review {i} ({rating}/5 stars): {text}")

    if not review_texts:
        raise HTTPException(status_code=400, detail="No review text available for analysis")

    prompt = f"""Analyze these Google reviews for "{doc.get('place_name', 'this business')}" (Average rating: {doc.get('rating', 'N/A')}/5, Total reviews: {doc.get('user_rating_count', 'N/A')}):

{chr(10).join(review_texts)}

Provide a JSON response with this exact structure:
{{
  "overall_sentiment": "positive" | "neutral" | "negative",
  "sentiment_score": <number 1-10>,
  "summary": "<2-3 sentence overall summary>",
  "positive_percentage": <number>,
  "neutral_percentage": <number>,
  "negative_percentage": <number>,
  "strengths": ["<strength 1>", "<strength 2>", ...],
  "complaints": ["<complaint 1>", "<complaint 2>", ...],
  "common_themes": ["<theme 1>", "<theme 2>", ...],
  "improvement_suggestions": [
    {{"title": "<suggestion title>", "description": "<actionable detail>"}},
    ...
  ],
  "rating_prediction": "<what the rating trend suggests>"
}}

Respond ONLY with the JSON, no markdown or extra text."""

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        chat = LlmChat(
            api_key=api_key,
            session_id=f"gmb-sentiment-{doc.get('place_id', 'unknown')}",
            system_message="You are an expert business reputation analyst. Analyze customer reviews and provide actionable insights in JSON format only.",
        )
        chat.with_model("openai", "gpt-4o-mini")

        response = await chat.send_message(UserMessage(text=prompt))

        # Parse JSON from response
        response_text = response.strip()
        if response_text.startswith("```"):
            response_text = response_text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

        sentiment_data = json.loads(response_text)

        # Cache the result
        now = datetime.now(timezone.utc).isoformat()
        await db.gmb_businesses.update_one(q, {"$set": {
            "sentiment_cache": sentiment_data,
            "sentiment_cached_at": now,
        }})

        return {"sentiment": sentiment_data, "cached_at": now}

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse AI response: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse AI analysis response")
    except Exception as e:
        logger.error(f"Sentiment analysis failed: {e}")
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")


@router.get("/sentiment")
async def get_cached_sentiment(
    branch_id: str = Query(None),
    current_user=Depends(require_role("business_admin")),
):
    """Get cached sentiment analysis."""
    q = _get_gmb_query(current_user, branch_id)
    doc = await db.gmb_businesses.find_one(q, {"_id": 0, "sentiment_cache": 1, "sentiment_cached_at": 1})

    if not doc or not doc.get("sentiment_cache"):
        return {"sentiment": None, "cached_at": None}

    return {"sentiment": doc["sentiment_cache"], "cached_at": doc.get("sentiment_cached_at")}
