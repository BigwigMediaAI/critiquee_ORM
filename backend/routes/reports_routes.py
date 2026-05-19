from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from database import db
from auth import get_current_user, require_role
from datetime import datetime, timezone, timedelta
from typing import Optional
import csv
import io

router = APIRouter()


def _parse_date(s: Optional[str]) -> Optional[datetime]:
    """Parse ISO date string (YYYY-MM-DD or full ISO) to UTC datetime."""
    if not s:
        return None
    try:
        if len(s) == 10:
            return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def _build_review_query(client_id, branch_id=None, date_from=None, date_to=None, platform=None, min_rating=None, max_rating=None):
    q = {"client_id": client_id}
    if branch_id:
        q["location_id"] = branch_id
    if platform and platform != "all":
        q["platform"] = platform
    rating = {}
    if min_rating is not None:
        rating["$gte"] = int(min_rating)
    if max_rating is not None:
        rating["$lte"] = int(max_rating)
    if rating:
        q["rating"] = rating
    df = _parse_date(date_from)
    dt = _parse_date(date_to)
    if df or dt:
        rng = {}
        if df:
            rng["$gte"] = df.isoformat()
        if dt:
            rng["$lte"] = (dt + timedelta(days=1)).isoformat()
        q["created_at"] = rng
    return q


@router.get("/summary")
async def get_summary(
    branch_id: str = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    platform: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
):
    client_id = current_user.get("client_id")
    if not client_id:
        return {}

    rq = _build_review_query(client_id, branch_id, date_from, date_to, platform)
    cq = {"client_id": client_id}
    if branch_id:
        cq["location_id"] = branch_id
    if platform and platform != "all":
        cq["platform"] = platform

    total_reviews = await db.reviews.count_documents(rq)
    replied_reviews = await db.reviews.count_documents({**rq, "status": "replied"})
    pending_reviews = await db.reviews.count_documents({**rq, "status": {"$in": ["new", "seen"]}})
    assigned_reviews = await db.reviews.count_documents({**rq, "status": "assigned"})
    unseen_reviews = await db.reviews.count_documents({**rq, "is_seen": False})

    total_comments = await db.social_comments.count_documents(cq)
    replied_comments = await db.social_comments.count_documents({**cq, "status": "replied"})
    unseen_comments = await db.social_comments.count_documents({**cq, "is_seen": False})

    reviews = await db.reviews.find(rq, {"rating": 1, "platform": 1, "_id": 0}).to_list(5000)
    avg_rating = round(sum(r.get("rating", 0) for r in reviews) / len(reviews), 1) if reviews else 0

    rating_dist = {str(i): 0 for i in range(1, 6)}
    platform_stats = {}
    for r in reviews:
        rating_dist[str(r.get("rating", 1))] = rating_dist.get(str(r.get("rating", 1)), 0) + 1
        p = r.get("platform", "unknown")
        if p not in platform_stats:
            platform_stats[p] = {"count": 0, "total_rating": 0}
        platform_stats[p]["count"] += 1
        platform_stats[p]["total_rating"] += r.get("rating", 0)

    for p in platform_stats:
        c = platform_stats[p]["count"]
        platform_stats[p]["avg_rating"] = round(platform_stats[p]["total_rating"] / c, 1) if c else 0

    response_rate = round((replied_reviews / total_reviews * 100), 1) if total_reviews > 0 else 0

    return {
        "reviews": {
            "total": total_reviews,
            "replied": replied_reviews,
            "pending": pending_reviews,
            "assigned": assigned_reviews,
            "unseen": unseen_reviews,
            "avg_rating": avg_rating,
            "response_rate": response_rate,
            "rating_distribution": rating_dist,
            "by_platform": platform_stats,
        },
        "social": {
            "total_comments": total_comments,
            "replied_comments": replied_comments,
            "unseen_comments": unseen_comments,
        },
    }


@router.get("/trends")
async def get_trends(
    days: int = Query(14),
    branch_id: str = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    platform: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
):
    client_id = current_user.get("client_id")
    if not client_id:
        return []

    if not date_from and not date_to:
        start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        query = {"client_id": client_id, "created_at": {"$gte": start_date}}
        if branch_id:
            query["location_id"] = branch_id
        if platform and platform != "all":
            query["platform"] = platform
    else:
        query = _build_review_query(client_id, branch_id, date_from, date_to, platform)

    reviews = await db.reviews.find(query, {"date": 1, "rating": 1, "created_at": 1, "_id": 0}).to_list(10000)

    trends = {}
    for review in reviews:
        date_str = review.get("date") or review.get("created_at", "")[:10]
        if not date_str:
            continue
        if date_str not in trends:
            trends[date_str] = {"date": date_str, "count": 0, "total_rating": 0}
        trends[date_str]["count"] += 1
        trends[date_str]["total_rating"] += review.get("rating", 0)

    result = sorted(trends.values(), key=lambda x: x["date"])
    for item in result:
        item["avg_rating"] = round(item["total_rating"] / item["count"], 1) if item["count"] else 0
    return result


@router.get("/audit-logs")
async def get_audit_logs(
    limit: int = Query(50),
    current_user=Depends(require_role("business_admin")),
):
    client_id = current_user.get("client_id")
    logs = await db.audit_logs.find(
        {"client_id": client_id}, {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)

    for log in logs:
        user = await db.users.find_one({"id": log.get("user_id")}, {"_id": 0, "password_hash": 0})
        log["user"] = user

    return logs


# ─── CSV Exports ────────────────────────────────────────────────────────────
def _csv_response(rows, headers, filename):
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(headers)
    for row in rows:
        writer.writerow(row)
    out.seek(0)
    return StreamingResponse(
        iter([out.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _stamp():
    return datetime.now().strftime("%Y%m%d_%H%M%S")


@router.get("/export/reviews")
async def export_reviews_csv(
    branch_id: str = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    platform: Optional[str] = Query(None),
    min_rating: Optional[int] = Query(None),
    max_rating: Optional[int] = Query(None),
    current_user=Depends(get_current_user),
):
    client_id = current_user.get("client_id")
    if not client_id:
        return _csv_response([], [], "reviews.csv")

    q = _build_review_query(client_id, branch_id, date_from, date_to, platform, min_rating, max_rating)
    reviews = await db.reviews.find(q, {"_id": 0}).sort("created_at", -1).to_list(50000)

    rows = []
    for r in reviews:
        rows.append([
            r.get("date") or r.get("created_at", "")[:10],
            r.get("platform", ""),
            r.get("reviewer_name", ""),
            r.get("rating", ""),
            (r.get("text") or "").replace("\n", " ").strip(),
            r.get("status", ""),
            "Yes" if r.get("is_seen") else "No",
            r.get("sentiment", ""),
        ])
    headers = ["Date", "Platform", "Reviewer", "Rating", "Review", "Status", "Seen", "Sentiment"]
    return _csv_response(rows, headers, f"reviews_{_stamp()}.csv")


@router.get("/export/comments")
async def export_comments_csv(
    branch_id: str = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    platform: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
):
    client_id = current_user.get("client_id")
    if not client_id:
        return _csv_response([], [], "comments.csv")

    q = {"client_id": client_id}
    if branch_id:
        q["location_id"] = branch_id
    if platform and platform != "all":
        q["platform"] = platform
    df = _parse_date(date_from)
    dt = _parse_date(date_to)
    if df or dt:
        rng = {}
        if df:
            rng["$gte"] = df.isoformat()
        if dt:
            rng["$lte"] = (dt + timedelta(days=1)).isoformat()
        q["created_at"] = rng

    comments = await db.social_comments.find(q, {"_id": 0}).sort("created_at", -1).to_list(50000)

    rows = []
    for c in comments:
        rows.append([
            c.get("created_at", "")[:19].replace("T", " "),
            c.get("platform", ""),
            c.get("author_name", ""),
            (c.get("text") or "").replace("\n", " ").strip(),
            c.get("status", ""),
            "Yes" if c.get("is_seen") else "No",
            c.get("sentiment", ""),
        ])
    headers = ["Date", "Platform", "Author", "Comment", "Status", "Seen", "Sentiment"]
    return _csv_response(rows, headers, f"social_comments_{_stamp()}.csv")


@router.get("/export/audit-logs")
async def export_audit_logs_csv(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user=Depends(require_role("business_admin")),
):
    client_id = current_user.get("client_id")
    q = {"client_id": client_id}
    df = _parse_date(date_from)
    dt = _parse_date(date_to)
    if df or dt:
        rng = {}
        if df:
            rng["$gte"] = df.isoformat()
        if dt:
            rng["$lte"] = (dt + timedelta(days=1)).isoformat()
        q["created_at"] = rng

    logs = await db.audit_logs.find(q, {"_id": 0}).sort("created_at", -1).to_list(50000)

    rows = []
    for log in logs:
        user = await db.users.find_one({"id": log.get("user_id")}, {"_id": 0, "password_hash": 0})
        rows.append([
            log.get("created_at", "")[:19].replace("T", " "),
            (user or {}).get("name", "Unknown"),
            (user or {}).get("email", ""),
            log.get("action", ""),
            log.get("item_type", ""),
            log.get("item_id", ""),
        ])
    headers = ["Timestamp", "User", "Email", "Action", "Item Type", "Item ID"]
    return _csv_response(rows, headers, f"audit_logs_{_stamp()}.csv")


@router.get("/export/summary")
async def export_summary_csv(
    branch_id: str = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    platform: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
):
    """Single-sheet snapshot of KPIs + per-platform stats + rating distribution."""
    summary = await get_summary(branch_id, date_from, date_to, platform, current_user)
    rev = summary.get("reviews", {}) or {}
    soc = summary.get("social", {}) or {}

    rows = [
        ["Section", "Metric", "Value"],
        ["Period", "From", date_from or "All time"],
        ["Period", "To", date_to or "Today"],
        ["Period", "Platform", platform or "All"],
        ["Reviews", "Total", rev.get("total", 0)],
        ["Reviews", "Replied", rev.get("replied", 0)],
        ["Reviews", "Pending", rev.get("pending", 0)],
        ["Reviews", "Assigned", rev.get("assigned", 0)],
        ["Reviews", "Unseen", rev.get("unseen", 0)],
        ["Reviews", "Average Rating", rev.get("avg_rating", 0)],
        ["Reviews", "Response Rate (%)", rev.get("response_rate", 0)],
        ["Social", "Total Comments", soc.get("total_comments", 0)],
        ["Social", "Replied Comments", soc.get("replied_comments", 0)],
        ["Social", "Unseen Comments", soc.get("unseen_comments", 0)],
    ]
    for star in ["5", "4", "3", "2", "1"]:
        rows.append([
            "Rating Distribution",
            f"{star} stars",
            (rev.get("rating_distribution") or {}).get(star, 0),
        ])
    for p, stats in (rev.get("by_platform") or {}).items():
        rows.append(["By Platform", f"{p} count", stats.get("count", 0)])
        rows.append(["By Platform", f"{p} avg rating", stats.get("avg_rating", 0)])

    out = io.StringIO()
    writer = csv.writer(out)
    for row in rows:
        writer.writerow(row)
    out.seek(0)
    return StreamingResponse(
        iter([out.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="report_summary_{_stamp()}.csv"'},
    )
