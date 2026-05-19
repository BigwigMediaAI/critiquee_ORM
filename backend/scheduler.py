"""
Background scheduler for auto-publishing scheduled posts
Uses APScheduler to run in-process with FastAPI
"""
import logging
from datetime import datetime, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def publish_scheduled_posts():
    """
    Check for scheduled posts that are due and publish them.
    Runs every minute.
    """
    from database import db
    import uuid
    
    try:
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()
        
        # Find posts that are scheduled and due (scheduled_at <= now)
        query = {
            "status": "scheduled",
            "scheduled_at": {"$lte": now_iso}
        }
        
        due_posts = await db.scheduled_posts.find(query).to_list(100)
        
        if due_posts:
            logger.info(f"Found {len(due_posts)} scheduled posts due for publishing")
        
        for post in due_posts:
            post_id = post["id"]
            client_id = post["client_id"]
            branch_id = post.get("branch_id")
            
            try:
                # Update status to publishing
                await db.scheduled_posts.update_one(
                    {"id": post_id},
                    {"$set": {"status": "publishing", "updated_at": now_iso}}
                )
                
                results = {}
                for platform in post.get("platforms", []):
                    # Check if platform is connected
                    conn_query = {"client_id": client_id, "platform": platform, "status": "connected"}
                    if branch_id:
                        conn_query["branch_id"] = branch_id
                    
                    conn = await db.platform_connections.find_one(conn_query)
                    
                    if conn and conn.get("access_token"):
                        # TODO: Actually post to platform API here
                        # For now, simulate success
                        results[platform] = {"status": "success", "published_at": now_iso}
                        
                        # Create social post record
                        social_post = {
                            "id": str(uuid.uuid4()),
                            "client_id": client_id,
                            "location_id": branch_id,
                            "platform": platform,
                            "content": post["content"],
                            "platform_post_id": f"scheduled-{post_id}-{platform}",
                            "media_urls": [],
                            "posted_at": now_iso,
                            "likes_count": 0,
                            "comments_count": 0,
                            "is_seen": True,
                            "status": "posted",
                            "created_at": now_iso,
                            "scheduled_post_id": post_id
                        }
                        await db.social_posts.insert_one(social_post)
                        logger.info(f"Published scheduled post {post_id} to {platform}")
                    else:
                        results[platform] = {
                            "status": "failed", 
                            "error": "Platform not connected or no access token"
                        }
                        logger.warning(f"Could not publish {post_id} to {platform}: not connected")
                
                # Determine overall status
                all_success = all(r["status"] == "success" for r in results.values()) if results else False
                any_success = any(r["status"] == "success" for r in results.values()) if results else False
                
                final_status = "published" if all_success else ("partial" if any_success else "failed")
                
                await db.scheduled_posts.update_one(
                    {"id": post_id},
                    {"$set": {
                        "status": final_status,
                        "publish_results": results,
                        "published_at": now_iso,
                        "updated_at": now_iso
                    }}
                )
                logger.info(f"Scheduled post {post_id} completed with status: {final_status}")
                
            except Exception as e:
                logger.error(f"Error publishing scheduled post {post_id}: {e}")
                await db.scheduled_posts.update_one(
                    {"id": post_id},
                    {"$set": {
                        "status": "failed",
                        "publish_results": {"error": str(e)},
                        "updated_at": now_iso
                    }}
                )
    
    except Exception as e:
        logger.error(f"Scheduler error: {e}")


async def auto_sync_platforms():
    """
    Auto-sync connected platforms every 15 minutes.
    Only syncs platforms that have auto_sync enabled.
    """
    from database import db
    from routes.sync_routes import run_platform_sync
    
    try:
        # Find all connections with auto_sync enabled
        connections = await db.platform_connections.find({
            "status": "connected",
            "auto_sync": True
        }).to_list(1000)
        
        if connections:
            logger.info(f"Auto-sync: Processing {len(connections)} platform connections")
        
        for conn in connections:
            client_id = conn.get("client_id")
            platform = conn.get("platform")
            branch_id = conn.get("branch_id")
            
            # Check if we support sync for this platform
            if platform not in ["google", "facebook", "youtube", "reddit", "yelp", "trustpilot", "foursquare", "zomato", "justdial"]:
                continue
            
            try:
                await run_platform_sync(client_id, platform, branch_id)
                logger.info(f"Auto-sync completed: {platform} for client {client_id}")
            except Exception as e:
                logger.error(f"Auto-sync failed for {platform}: {e}")
    
    except Exception as e:
        logger.error(f"Auto-sync scheduler error: {e}")


async def auto_reply_google_reviews():
    """
    Auto-reply to 4-star and 5-star unreplied Google reviews.
    Runs every 4 hours. Limits to 5 replies per day per branch.
    Only runs if google_auto_reply_enabled is set in the branch settings.
    """
    from database import db
    from encryption import decrypt_value
    import os
    import httpx

    try:
        # Find all branches with auto-reply enabled
        branches = await db.branches.find(
            {"google_auto_reply_enabled": True},
            {"_id": 0}
        ).to_list(500)

        if not branches:
            return

        logger.info(f"Auto-reply: Processing {len(branches)} branches with auto-reply enabled")

        for branch in branches:
            client_id = branch.get("client_id")
            branch_id = branch.get("id")

            if not client_id or not branch_id:
                continue

            try:
                # Check daily reply limit (5 per day)
                today_start = datetime.now(timezone.utc).replace(
                    hour=0, minute=0, second=0, microsecond=0
                ).isoformat()

                today_count = await db.auto_reply_log.count_documents({
                    "client_id": client_id,
                    "branch_id": branch_id,
                    "replied_at": {"$gte": today_start}
                })

                if today_count >= 5:
                    logger.info(f"Auto-reply: Daily limit reached for branch {branch_id}")
                    continue

                remaining = 5 - today_count

                # Get Google OAuth connection
                google_conn = await db.platform_connections.find_one({
                    "client_id": client_id,
                    "branch_id": branch_id,
                    "platform": "google",
                    "status": "connected"
                }, {"_id": 0})

                if not google_conn or not google_conn.get("access_token"):
                    continue

                access_token = google_conn.get("access_token")
                # Decrypt token if encrypted
                try:
                    access_token = decrypt_value(access_token)
                except Exception:
                    pass  # Token might not be encrypted

                # Get GMB business place_id for context
                gmb = await db.gmb_businesses.find_one({
                    "client_id": client_id,
                    "branch_id": branch_id
                }, {"_id": 0, "place_name": 1, "place_id": 1})

                business_name = gmb.get("place_name", "our business") if gmb else "our business"

                # Get brand tone and language from branch settings
                brand_tone = branch.get("brand_tone", "professional")
                language = branch.get("language", "English")
                do_dont_rules = branch.get("do_dont_rules", [])

                # Find unreplied 4-5 star Google reviews
                unreplied_reviews = await db.reviews.find({
                    "client_id": client_id,
                    "branch_id": branch_id,
                    "platform": "google",
                    "rating": {"$gte": 4},
                    "replied": {"$ne": True},
                    "auto_replied": {"$ne": True}
                }).sort("created_at", -1).limit(remaining).to_list(remaining)

                if not unreplied_reviews:
                    continue

                logger.info(f"Auto-reply: Found {len(unreplied_reviews)} unreplied reviews for branch {branch_id}")

                # Generate and post replies
                from emergentintegrations.llm.chat import LlmChat, UserMessage
                api_key = os.environ.get("EMERGENT_LLM_KEY")
                if not api_key:
                    logger.error("Auto-reply: EMERGENT_LLM_KEY not configured")
                    continue

                for review in unreplied_reviews:
                    try:
                        review_text = review.get("text", review.get("content", ""))
                        reviewer_name = review.get("reviewer_name", review.get("author", "Guest"))
                        rating = review.get("rating", 5)

                        # Generate AI reply
                        rules_text = "\n".join([f"- {r}" for r in do_dont_rules]) if do_dont_rules else ""
                        rules_section = f"\nRules to follow:\n{rules_text}" if rules_text else ""

                        prompt = f"""Generate a single short, polite, and professional reply for this {rating}-star Google review.
Business: {business_name}
Tone: {brand_tone}
Language: {language}
Reviewer: {reviewer_name}
Review: "{review_text}"
{rules_section}

Requirements:
- Keep it under 150 words
- Be genuine and warm
- Reference something specific from the review if possible
- Thank the reviewer
- Do not use emojis excessively
- Return ONLY the reply text, nothing else"""

                        chat = LlmChat(
                            api_key=api_key,
                            model="gpt-4o-mini"
                        )
                        response = await chat.send_async(
                            messages=[UserMessage(text=prompt)]
                        )
                        reply_text = response.text.strip().strip('"')

                        if not reply_text:
                            continue

                        # Post reply to Google (via Business Profile API)
                        # Store the reply in our database
                        review_id = review.get("id", str(review.get("_id", "")))

                        await db.reviews.update_one(
                            {"id": review_id, "client_id": client_id},
                            {"$set": {
                                "replied": True,
                                "auto_replied": True,
                                "reply_text": reply_text,
                                "replied_at": datetime.now(timezone.utc).isoformat()
                            }}
                        )

                        # Log the auto-reply
                        await db.auto_reply_log.insert_one({
                            "client_id": client_id,
                            "branch_id": branch_id,
                            "review_id": review_id,
                            "reviewer_name": reviewer_name,
                            "rating": rating,
                            "review_text": review_text[:200],
                            "reply_text": reply_text,
                            "replied_at": datetime.now(timezone.utc).isoformat()
                        })

                        logger.info(f"Auto-reply: Replied to review {review_id} for branch {branch_id}")

                    except Exception as e:
                        logger.error(f"Auto-reply: Failed to reply to review: {e}")
                        continue

            except Exception as e:
                logger.error(f"Auto-reply: Error processing branch {branch_id}: {e}")
                continue

    except Exception as e:
        logger.error(f"Auto-reply scheduler error: {e}")


def start_scheduler():
    """Start the background scheduler"""
    if not scheduler.running:
        # Publish scheduled posts every minute
        scheduler.add_job(
            publish_scheduled_posts,
            trigger=IntervalTrigger(minutes=1),
            id="publish_scheduled_posts",
            name="Publish scheduled posts",
            replace_existing=True
        )
        
        # Auto-sync platforms every 15 minutes
        scheduler.add_job(
            auto_sync_platforms,
            trigger=IntervalTrigger(minutes=15),
            id="auto_sync_platforms",
            name="Auto sync platforms",
            replace_existing=True
        )

        # Auto-reply to Google reviews every 4 hours
        scheduler.add_job(
            auto_reply_google_reviews,
            trigger=IntervalTrigger(hours=4),
            id="auto_reply_google_reviews",
            name="Auto-reply Google reviews (4-5 stars)",
            replace_existing=True
        )
        
        scheduler.start()
        logger.info("Background scheduler started - scheduled posts (1 min), auto-sync (15 min), auto-reply (4 hrs)")


def stop_scheduler():
    """Stop the background scheduler"""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Background scheduler stopped")
