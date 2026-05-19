"""
Publisher - shared helper that publishes content to any configured social platform.
Used by both create_post (immediate) and scheduled_posts publish_now.
Returns a standardised result dict for every platform.
"""
import logging
import json
from typing import List, Optional

logger = logging.getLogger(__name__)


async def publish_to_platform(
    db,
    client_id: str,
    branch_id: str,
    platform: str,
    content: str,
    image_urls: List[str] = None,
) -> dict:
    """
    Attempt to publish content to the given platform.
    Returns:
      {"status": "published", "platform_post_id": "...", "note": "..."}
      {"status": "saved_only", "note": "..."}   – no connection / skipped
      {"status": "error", "error": "..."}        – API returned an error
    """
    image_urls = image_urls or []
    try:
        if platform == "facebook":
            return await _publish_facebook(db, client_id, branch_id, content, image_urls)
        elif platform == "instagram":
            return await _publish_instagram(db, client_id, branch_id, content, image_urls)
        elif platform == "reddit":
            return await _publish_reddit(db, client_id, branch_id, content)
        elif platform == "linkedin":
            return await _publish_linkedin(db, client_id, branch_id, content)
        elif platform == "x":
            return await _publish_x(db, client_id, branch_id, content)
        elif platform == "youtube":
            return {"status": "saved_only", "note": "Video upload not supported via API — post saved locally only"}
        else:
            return {"status": "saved_only", "note": f"Platform '{platform}' does not support direct publishing yet"}
    except Exception as e:
        logger.error(f"publish_to_platform ({platform}) unexpected error: {e}")
        return {"status": "error", "error": str(e)}


# ──────────────────────────────────────────
# Facebook
# ──────────────────────────────────────────

async def _publish_facebook(db, client_id, branch_id, content, image_urls):
    from services.facebook_api import get_facebook_api

    api = await get_facebook_api(db, client_id, branch_id)
    if not api:
        return {"status": "saved_only", "note": "Facebook not connected"}

    test = await api.test_connection()
    if test.get("status") != "connected":
        return {"status": "saved_only", "note": f"Facebook: {test.get('error', 'Not connected')}"}

    pages = test.get("pages", [])
    if not pages:
        return {"status": "error", "error": "No Facebook pages found. Ensure your account manages at least one page."}

    page = pages[0]
    page_id = page["id"]
    page_token = page.get("access_token") or api.access_token

    result = {}
    if len(image_urls) == 1:
        result = await api.publish_post_with_photo(page_id, content, image_urls[0], page_token)
    elif len(image_urls) > 1:
        result = await api.publish_post_with_photos(page_id, content, image_urls, page_token)
    else:
        result = await api.publish_post(page_id, content, page_token)

    if result.get("status") == "success":
        return {
            "status": "published",
            "platform_post_id": result.get("post_id"),
            "note": f"Published to {page.get('name', 'Facebook page')}",
        }
    return {"status": "error", "error": result.get("error", "Facebook publish failed")}


# ──────────────────────────────────────────
# Instagram (via Facebook Graph API)
# ──────────────────────────────────────────

async def _publish_instagram(db, client_id, branch_id, content, image_urls):
    from services.facebook_api import get_facebook_api
    import httpx

    api = await get_facebook_api(db, client_id, branch_id)
    if not api:
        return {"status": "saved_only", "note": "Instagram/Facebook not connected"}

    test = await api.test_connection()
    if test.get("status") != "connected":
        return {"status": "saved_only", "note": f"Instagram: {test.get('error', 'Not connected')}"}

    ig_accounts = test.get("instagram_accounts", [])
    if not ig_accounts:
        return {
            "status": "saved_only",
            "note": "No Instagram Business account linked. Connect one via Facebook page settings.",
        }

    ig_user_id = ig_accounts[0]["id"]
    token = ig_accounts[0].get("access_token") or api.access_token
    GRAPH = "https://graph.facebook.com/v18.0"

    async with httpx.AsyncClient(timeout=30.0) as client:
        if image_urls:
            # Create media container
            container_res = await client.post(
                f"{GRAPH}/{ig_user_id}/media",
                params={"access_token": token},
                json={"image_url": image_urls[0], "caption": content},
            )
            if container_res.status_code not in [200, 201]:
                return {"status": "error", "error": container_res.text[:200]}
            container_id = container_res.json().get("id")
            # Publish container
            pub_res = await client.post(
                f"{GRAPH}/{ig_user_id}/media_publish",
                params={"access_token": token},
                json={"creation_id": container_id},
            )
            if pub_res.status_code in [200, 201]:
                return {"status": "published", "platform_post_id": pub_res.json().get("id"), "note": "Published to Instagram"}
            return {"status": "error", "error": pub_res.text[:200]}
        else:
            return {"status": "saved_only", "note": "Instagram requires at least one image to publish"}


# ──────────────────────────────────────────
# Reddit
# ──────────────────────────────────────────

async def _publish_reddit(db, client_id, branch_id, content):
    from services.reddit_api import get_reddit_api

    api = await get_reddit_api(db, client_id, branch_id)
    if not api:
        return {"status": "saved_only", "note": "Reddit not connected"}

    # Subreddit stored in the connection doc
    conn = await db.platform_connections.find_one(
        {"client_id": client_id, "platform": "reddit", "status": "connected",
         **({"branch_id": branch_id} if branch_id else {})}
    )
    subreddits = conn.get("subreddits", []) if conn else []
    if not subreddits:
        return {"status": "saved_only", "note": "No subreddit configured — add subreddits in Platform settings"}

    subreddit = subreddits[0]
    # Use first line as title (max 300 chars), rest as body
    lines = content.strip().split("\n", 1)
    title = lines[0][:300]
    body = lines[1].strip() if len(lines) > 1 else content

    result = await api.submit_post(subreddit, title, body)
    if result.get("status") == "success":
        return {
            "status": "published",
            "platform_post_id": result.get("name"),
            "note": f"Posted to r/{subreddit}",
        }
    return {"status": "error", "error": result.get("error", "Reddit submit failed")}


# ──────────────────────────────────────────
# LinkedIn
# ──────────────────────────────────────────

async def _publish_linkedin(db, client_id, branch_id, content):
    from services.linkedin_api import get_linkedin_api

    api = await get_linkedin_api(db, client_id, branch_id)
    if not api:
        return {"status": "saved_only", "note": "LinkedIn not connected"}

    result = await api.publish_post(content)
    if result.get("status") == "success":
        return {"status": "published", "platform_post_id": result.get("post_id"), "note": "Published to LinkedIn"}
    return {"status": "error", "error": result.get("error", "LinkedIn publish failed")}


# ──────────────────────────────────────────
# X (Twitter)
# ──────────────────────────────────────────

async def _publish_x(db, client_id, branch_id, content):
    from services.x_api import get_x_api

    api = await get_x_api(db, client_id, branch_id)
    if not api:
        return {"status": "saved_only", "note": "X (Twitter) not connected"}

    result = await api.publish_tweet(content)
    if result.get("status") == "success":
        return {"status": "published", "platform_post_id": result.get("tweet_id"), "note": "Tweet posted"}
    return {"status": "error", "error": result.get("error", "X publish failed")}
