# Post Publishing Integration - Testing Guide

## When real platform OAuth is connected, the following calls are made:

### Facebook
- Endpoint: `POST /{page-id}/feed` (text posts)
- Endpoint: `POST /{page-id}/photos` (single image posts)
- Endpoint: `POST /{page-id}/feed` with `attached_media` (multi-image)
- Token used: page access token (from test_connection pages list)
- Required OAuth scopes: `pages_manage_posts`, `pages_read_engagement`

### Instagram (via Facebook Graph API)
- Endpoint: `POST /{ig-user-id}/media` then `POST /{ig-user-id}/media_publish`
- Requires: Instagram Business Account linked to Facebook page
- Required scopes: `instagram_basic`, `instagram_content_publish`

### Reddit
- Endpoint: `POST /api/submit` via OAuth
- Required config: subreddit name stored in connection doc (`subreddits` field)
- Required OAuth scopes: `submit`

### LinkedIn
- Endpoint: `POST https://api.linkedin.com/v2/ugcPosts`
- Required OAuth scopes: `w_member_social`

### X (Twitter)
- Endpoint: `POST https://api.twitter.com/2/tweets`
- Required OAuth scopes: `tweet.write`, `users.read`
- Note: text is truncated to 280 chars

### YouTube
- Publishing videos requires complex upload API — not supported
- Saved locally only

## Test status without OAuth:
- `platform_published: false, note: "Facebook not connected"` — expected
- When connected: `platform_published: true, note: "Published to <page_name>"`
