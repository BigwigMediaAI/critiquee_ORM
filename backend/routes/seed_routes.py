"""
Seed Routes - Inject demo/sample data for previewing the UI
"""
from fastapi import APIRouter, Depends, Query
from database import db
from auth import require_role
from utils.sentiment import compute_sentiment
from datetime import datetime, timezone, timedelta
import uuid
import secrets

# Helpers backed by `secrets` for cryptographically-strong randomness when seeding demo data
def _rand_choice(seq):
    return secrets.choice(seq) if seq else None

def _rand_int(low, high):
    """Inclusive range, like random.randint."""
    return low + secrets.randbelow(high - low + 1)

router = APIRouter()

SAMPLE_REVIEWS = [
    {
        "reviewer_name": "John Smith",
        "rating": 5,
        "text": "Absolutely amazing experience! The staff was incredibly helpful and the rooms were spotless. The breakfast buffet had a great variety. Will definitely be coming back next year!",
        "platform": "google",
    },
    {
        "reviewer_name": "Sarah Johnson",
        "rating": 4,
        "text": "Great location and comfortable beds. The breakfast was good but could use more variety. The pool area is beautiful. Overall a very pleasant stay.",
        "platform": "tripadvisor",
    },
    {
        "reviewer_name": "Michael Chen",
        "rating": 3,
        "text": "Average experience. The room was clean but the service was slow at check-in. The wifi connection was also unstable. Decent value for money though.",
        "platform": "google",
    },
    {
        "reviewer_name": "Emma Williams",
        "rating": 5,
        "text": "Exceptional service from start to finish. The concierge went above and beyond to arrange a restaurant booking. The view from our room was absolutely breathtaking!",
        "platform": "google",
    },
    {
        "reviewer_name": "Robert Brown",
        "rating": 2,
        "text": "Disappointed with the cleanliness of the bathroom. Had to request fresh towels twice. Expected better for the price. The restaurant food was good though.",
        "platform": "tripadvisor",
    },
    {
        "reviewer_name": "Priya Patel",
        "rating": 5,
        "text": "Stayed here for our anniversary and everything was perfect. They had flowers and chocolates in the room as a surprise. The spa is world-class!",
        "platform": "google",
    },
]

SAMPLE_POSTS = [
    {
        "platform": "facebook",
        "content": "We are thrilled to announce our Summer Special! Get 20% off all room bookings this month. Book now and experience luxury like never before! Offer valid until the end of the month. #SummerDeals #HotelLife #LuxuryTravel",
    },
    {
        "platform": "instagram",
        "content": "Breathtaking sunsets from our rooftop terrace. Join us for our signature sunset cocktail hour every evening from 6-8 PM. Reserve your spot today! #SunsetVibes #RooftopBar #CocktailHour #HotelLife",
    },
    {
        "platform": "linkedin",
        "content": "We are proud to have maintained our 5-star rating for the 3rd consecutive year. This achievement reflects our unwavering commitment to excellence and the dedication of our incredible team. Thank you to all our guests for choosing us.",
    },
    {
        "platform": "facebook",
        "content": "Our new spa and wellness center is now open! Featuring 12 treatment rooms, a heated indoor pool, and a full-service salon. Book your rejuvenating experience today. Call us or visit our website for reservations.",
    },
]

SAMPLE_COMMENTS = [
    "This looks absolutely amazing! Can't wait to visit.",
    "Do you offer family packages or discounts for children?",
    "The photos are stunning! What time does check-in start?",
    "We stayed last month and had a wonderful time! The staff were so helpful.",
    "Is parking available on-site? How much does it cost per night?",
    "Beautiful property! Do you have conference facilities?",
    "Love this! Shared it with my travel group. We're planning a trip!",
    "Are pets allowed at the property?",
]

COMMENTER_NAMES = [
    "Alex Parker", "Maria Rodriguez", "David Kim", "Sophie Turner",
    "James Wilson", "Laura Martinez", "Chris Evans", "Aisha Hassan",
]


@router.post("/demo-data")
async def seed_demo_data(
    branch_id: str = Query(None),
    current_user=Depends(require_role("business_admin")),
):
    """Seed demo reviews and social posts so users can preview the UI"""
    client_id = current_user.get("client_id")
    now = datetime.now(timezone.utc)

    reviews_added = 0
    posts_added = 0
    comments_added = 0

    # Add sample reviews
    for i, review_data in enumerate(SAMPLE_REVIEWS):
        days_ago = _rand_int(1, 45)
        review_date = (now - timedelta(days=days_ago)).strftime("%Y-%m-%d")

        review = {
            "id": str(uuid.uuid4()),
            "client_id": client_id,
            "branch_id": branch_id,
            "location_id": branch_id,
            "platform": review_data["platform"],
            "platform_review_id": f"demo-{uuid.uuid4().hex}",
            "reviewer_name": review_data["reviewer_name"],
            "rating": review_data["rating"],
            "text": review_data["text"],
            "date": review_date,
            "reply_text": None,
            "is_seen": i > 1,
            "status": "new" if i <= 1 else ("replied" if i == 4 else "seen"),
            "sentiment": compute_sentiment(review_data["text"], review_data["rating"]),
            "created_at": (now - timedelta(days=days_ago)).isoformat(),
            "synced_at": now.isoformat(),
            "is_demo": True,
        }

        await db.reviews.insert_one(review)
        reviews_added += 1

    # Add sample social posts with comments
    for i, post_data in enumerate(SAMPLE_POSTS):
        post_id = str(uuid.uuid4())
        days_ago = _rand_int(1, 20)
        posted_at = (now - timedelta(days=days_ago)).isoformat()
        num_comments = _rand_int(2, 4)
        # secrets has no `sample`; do an unbiased selection without replacement
        pool = list(SAMPLE_COMMENTS)
        comment_texts = []
        for _ in range(min(num_comments, len(pool))):
            comment_texts.append(pool.pop(secrets.randbelow(len(pool))))

        post = {
            "id": post_id,
            "client_id": client_id,
            "branch_id": branch_id,
            "location_id": branch_id,
            "platform": post_data["platform"],
            "platform_post_id": f"demo-{uuid.uuid4().hex}",
            "content": post_data["content"],
            "posted_at": posted_at,
            "likes_count": _rand_int(15, 200),
            "comments_count": num_comments,
            "shares_count": _rand_int(0, 30),
            "media_urls": [],
            "is_seen": True,
            "status": "posted",
            "created_at": posted_at,
            "synced_at": now.isoformat(),
            "is_demo": True,
        }

        await db.social_posts.insert_one(post)
        posts_added += 1

        # Add comments, using internal post_id as the link
        for j, comment_text in enumerate(comment_texts):
            comment_days_ago = _rand_int(0, days_ago)
            comment = {
                "id": str(uuid.uuid4()),
                "client_id": client_id,
                "branch_id": branch_id,
                "location_id": branch_id,
                "platform": post_data["platform"],
                "post_id": post_id,
                "platform_comment_id": f"demo-comment-{uuid.uuid4().hex}",
                "commenter_name": _rand_choice(COMMENTER_NAMES),
                "author_name": _rand_choice(COMMENTER_NAMES),
                "text": comment_text,
                "posted_at": (now - timedelta(days=comment_days_ago)).isoformat(),
                "like_count": _rand_int(0, 15),
                "is_seen": j > 0,  # first comment is unseen
                "status": "new" if j == 0 else "seen",
                "reply_text": None,
                "created_at": (now - timedelta(days=comment_days_ago)).isoformat(),
                "synced_at": now.isoformat(),
                "is_demo": True,
            }
            await db.social_comments.insert_one(comment)
            comments_added += 1

    return {
        "message": "Demo data created successfully",
        "reviews_added": reviews_added,
        "posts_added": posts_added,
        "comments_added": comments_added,
    }


@router.delete("/demo-data")
async def clear_demo_data(
    branch_id: str = Query(None),
    current_user=Depends(require_role("business_admin")),
):
    """Remove all demo/seed data for a branch"""
    client_id = current_user.get("client_id")

    query = {"client_id": client_id, "is_demo": True}
    if branch_id:
        query["branch_id"] = branch_id

    reviews_deleted = (await db.reviews.delete_many(query)).deleted_count
    posts_deleted = (await db.social_posts.delete_many(query)).deleted_count
    comments_deleted = (await db.social_comments.delete_many(query)).deleted_count

    return {
        "message": "Demo data cleared",
        "reviews_deleted": reviews_deleted,
        "posts_deleted": posts_deleted,
        "comments_deleted": comments_deleted,
    }
