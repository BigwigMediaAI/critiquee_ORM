from fastapi import APIRouter, HTTPException, Depends, Query
from database import db
from auth import get_current_user, require_role
from models import PlatformCredentialsCreate, PlatformCredentialsUpdate
from encryption import encrypt_token, decrypt_token, is_encrypted
from datetime import datetime, timezone
import uuid
import urllib.parse
import os
import httpx
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

# Platform configuration with OAuth requirements, category, and rich setup instructions.
#
# Each platform entry supports:
#   name             — Display name
#   category         — One of: "Reviews & Local", "Social", "Hospitality", "Travel", "Properties", "Local Listings"
#   auth_type        — "oauth2" or "api_key"
#   required_fields  — Subset of ["client_id", "client_secret", "api_key"]
#   docs_url         — Public developer docs link (string, optional)
#   apply_url        — Where the user goes to apply / create app (string, optional)
#   notes            — One-line note shown above the instructions (optional)
#   partner_only     — True if API access requires manual partner approval
#   instructions     — List of strings (URLs auto-linkified by frontend)
PLATFORM_CONFIGS = {
    # ─── Reviews & Local ──────────────────────────────────────────────────
    "google": {
        "name": "Google Business Profile",
        "category": "Reviews & Local",
        "auth_type": "oauth2",
        "required_fields": ["client_id", "client_secret"],
        "scopes": ["https://www.googleapis.com/auth/business.manage"],
        "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "docs_url": "https://developers.google.com/my-business/content/overview",
        "apply_url": "https://console.cloud.google.com",
        "notes": "Manage Google reviews, posts and Q&A for your verified Business Profile.",
        "instructions": [
            "Open Google Cloud Console: https://console.cloud.google.com and create (or pick) a project",
            "Enable two APIs in 'APIs & Services' → 'Library': 'Business Profile API' and 'My Business Account Management API'",
            "If you haven't already, request elevated access at https://developers.google.com/my-business/content/prereqs (review usually takes 2–5 business days)",
            "Go to 'APIs & Services' → 'OAuth consent screen', set User Type = External, fill in app name, support email, and add the scope 'https://www.googleapis.com/auth/business.manage'",
            "Go to 'APIs & Services' → 'Credentials' → 'Create Credentials' → 'OAuth Client ID' (Web application)",
            "Add the Authorized redirect URI shown below to your client",
            "Copy the Client ID and Client Secret and paste them in this dialog",
        ],
    },
    "yelp": {
        "name": "Yelp",
        "category": "Reviews & Local",
        "auth_type": "api_key",
        "required_fields": ["api_key", "client_id"],
        "docs_url": "https://docs.developer.yelp.com/docs/fusion-intro",
        "apply_url": "https://www.yelp.com/developers/v3/manage_app",
        "notes": "Use the Yelp Fusion API to fetch your business profile, ratings and the latest 3 review excerpts. The 'Client ID' field below stores your Yelp Business Alias (the slug at the end of your yelp.com/biz/ URL).",
        "instructions": [
            "Sign in to Yelp at https://www.yelp.com/developers/v3/manage_app",
            "Click 'Create New App' — fill in app name, industry, contact email, and accept the Terms of Use",
            "Verify your email if prompted",
            "Copy the generated 'API Key' (long alphanumeric token starting with letters)",
            "Paste the API Key into the 'API Key' field below",
            "In the 'Client ID / App ID' field below, enter your Yelp Business Alias — open your business page on yelp.com, the alias is the slug after /biz/ in the URL (e.g. https://yelp.com/biz/pizza-hub-san-francisco → alias = pizza-hub-san-francisco)",
            "Yelp Fusion allows up to 5,000 requests/day on the free tier and returns the 3 most-recent review excerpts per call",
        ],
    },
    "trustpilot": {
        "name": "Trustpilot",
        "category": "Reviews & Local",
        "auth_type": "api_key",
        "required_fields": ["api_key", "client_id"],
        "supports_reply": True,
        "reply_auth": "password_grant",
        "docs_url": "https://developers.trustpilot.com/business-units-api",
        "apply_url": "https://businessapp.b2b.trustpilot.com",
        "notes": "Read public Trustpilot reviews via the Business Units API. The 'Client ID' field below stores your Business Unit ID. To enable automatic reply posting, also fill in the optional 'Enable automatic replies' fields.",
        "instructions": [
            "Sign in to your Trustpilot Business account: https://businessapp.b2b.trustpilot.com (free tier allows read-only API access)",
            "Open https://businessapp.b2b.trustpilot.com/integrations and click 'Apply for an API Key'",
            "Fill in the integration request — describe how you'll use the API (e.g. 'CRM dashboard for review monitoring & replies')",
            "Once approved (usually 1–3 business days), Trustpilot emails you an API Key and an API Secret",
            "Paste the API Key into the 'API Key' field below",
            "Find your Business Unit ID in the integrations dashboard (24-character hex value, looks like 4f0a4b2d…) and paste it into the 'Client ID / App ID' field",
            "Optional — to enable automatic reply posting, expand the 'Enable automatic replies' panel and provide: your API Secret, your Trustpilot Business account email, and your Business account password",
            "Without the optional reply credentials, Critiquee will save your reply text internally and surface a deep link to the Trustpilot Business app for manual posting",
        ],
    },
    "foursquare": {
        "name": "Foursquare",
        "category": "Reviews & Local",
        "auth_type": "api_key",
        "required_fields": ["api_key", "client_id"],
        "docs_url": "https://docs.foursquare.com/developer/reference/places-api-overview",
        "apply_url": "https://foursquare.com/developers/apps",
        "notes": "Connect Foursquare Places API to read tips and ratings for your venue. The 'Client ID' field below stores your Foursquare Venue ID (fsq_id).",
        "instructions": [
            "Sign in to the Foursquare Developer Console: https://foursquare.com/developers/apps",
            "Click 'Create a new App' (you may need to create a 'Project' first)",
            "Fill in app name, website URL, contact email and a short description",
            "On the app's settings page, copy the 'API Key' (Service API key) — paste it into the 'API Key' field below",
            "Find your Venue ID (fsq_id): use the 'Search Places' helper in the Foursquare console, look up your business by name + city, and copy the 22-character fsq_id (e.g. 4b8f8e0ef964a520aa9933e3)",
            "Paste the fsq_id into the 'Client ID / App ID' field below",
            "Foursquare Places API free tier = 100,000 calls / month — plenty for 4-hourly polling",
        ],
    },
    "zomato": {
        "name": "Zomato",
        "category": "Reviews & Local",
        "auth_type": "api_key",
        "required_fields": ["api_key", "client_id"],
        "partner_only": True,
        "docs_url": "https://www.zomato.com/business",
        "apply_url": "https://www.zomato.com/business",
        "notes": (
            "Zomato's public API (developers.zomato.com) was deprecated in 2021. "
            "Live review sync requires the Zomato Restaurant Partner programme — your "
            "Zomato account rep issues a partner 'user-key' bound to your restaurant. "
            "Reply-to-review is not exposed by Zomato to third parties; replies are made "
            "in the Zomato Business app/dashboard, and Critiquee surfaces a one-click "
            "deep link there for every Zomato review."
        ),
        "instructions": [
            "Confirm your restaurant is enrolled in the Zomato Restaurant Partner programme via https://www.zomato.com/business — only partner restaurants get API credentials",
            "Email or call your assigned Zomato account / sales representative and request 'Partner API access for review sync'. Provide your restaurant URL/ID and a brief description of how you'll use the data (Critiquee — reputation management dashboard)",
            "Zomato will issue a partner 'user-key' (long alphanumeric string) — this replaces the deprecated developers.zomato.com keys",
            "Find your numeric Zomato Restaurant ID — open your restaurant page on zomato.com and look for the trailing ID in the URL or in the partner dashboard (e.g. https://www.zomato.com/ncr/grand-hotel-delhi-cp/restaurant/12345 → ID = 12345)",
            "Paste the partner user-key into the 'API Key' field below, and the numeric Restaurant ID into the 'Client ID / App ID' field",
            "Optionally, if your onboarding cohort uses a custom partner endpoint, set 'API Base URL' under Advanced Config (defaults to https://api.zomato.com/v3)",
            "Hit 'Test' to verify the partner key resolves your restaurant. Auto-sync runs every 15 minutes once enabled.",
            "Note: replies cannot be posted via API. Each Zomato review will surface a 'Reply on Zomato Business' CTA that opens the Zomato dashboard.",
        ],
    },
    "justdial": {
        "name": "JustDial",
        "category": "Reviews & Local",
        "auth_type": "api_key",
        "required_fields": ["api_key", "client_id"],
        "partner_only": True,
        "docs_url": "https://www.justdial.com/business",
        "apply_url": "https://accounts.justdial.com/businessuser",
        "notes": (
            "JustDial does not publish a fully public review API. Live review sync "
            "requires onboarding through the JustDial Business Connect programme — "
            "your JustDial account manager issues a partner API key bound to your "
            "listing's 'docid'. Reply-to-review is not exposed by JustDial to third "
            "parties; replies are posted in the JustDial Business dashboard, and "
            "Critiquee surfaces a one-click deep link there for every JustDial review."
        ),
        "instructions": [
            "Confirm your listing is enrolled in the JustDial Business Connect programme via https://accounts.justdial.com/businessuser — only partner listings get API credentials",
            "Email or call your assigned JustDial account / sales representative and request 'Business Connect API access for review sync'. Mention you'll use the data to feed a reputation-management dashboard (Critiquee)",
            "JustDial will issue a partner API key (alphanumeric string). Keep it confidential — anyone holding it can read your listing data",
            "Find your numeric Listing ID (`docid`) — open your JustDial business dashboard. It also appears at the end of your listing URL (e.g. https://www.justdial.com/Delhi/Grand-Hotel/...-12345 → ID = 12345)",
            "Paste the partner API key into the 'API Key' field below, and the numeric Listing ID into the 'Client ID / App ID' field",
            "Optionally, if your onboarding cohort uses a custom partner endpoint, set 'API Base URL' under Advanced Config (defaults to https://api.justdial.com/businessconnect/v1)",
            "Hit 'Test' to verify the partner key resolves your listing. Auto-sync runs every 15 minutes once enabled.",
            "Note: replies cannot be posted via API. Each JustDial review will surface a 'Reply on JustDial Business' CTA that opens the JustDial Business dashboard.",
        ],
    },

    # ─── Social ───────────────────────────────────────────────────────────
    "facebook": {
        "name": "Facebook / Instagram",
        "category": "Social",
        "auth_type": "oauth2",
        "required_fields": ["client_id", "client_secret"],
        "scopes": [
            "pages_read_engagement", "pages_manage_posts", "pages_manage_engagement",
            "pages_read_user_content", "pages_show_list",
            "instagram_basic", "instagram_manage_comments", "instagram_content_publish",
        ],
        "auth_url": "https://www.facebook.com/v19.0/dialog/oauth",
        "token_url": "https://graph.facebook.com/v19.0/oauth/access_token",
        "docs_url": "https://developers.facebook.com/docs/graph-api",
        "apply_url": "https://developers.facebook.com/apps",
        "notes": "One Meta App covers both Facebook Pages and Instagram Business / Creator accounts.",
        "instructions": [
            "Go to Meta for Developers: https://developers.facebook.com/apps and click 'Create App'",
            "Pick the use case 'Other' → app type 'Business' and continue",
            "From the left sidebar, add the products: 'Facebook Login for Business' and 'Instagram Graph API'",
            "Open 'App Settings' → 'Basic' to copy your App ID (Client ID) and App Secret (Client Secret)",
            "Open 'Facebook Login' → 'Settings' and add the Redirect URI shown below to 'Valid OAuth Redirect URIs'",
            "Open 'App Review' → 'Permissions and Features' and request advanced access for the scopes listed below — Meta typically reviews apps in 3–7 days",
            "While in dev mode, only Admins / Developers / Testers added to the app can complete the OAuth flow",
        ],
    },
    "instagram": {
        "name": "Instagram",
        "category": "Social",
        "auth_type": "oauth2",
        "required_fields": ["client_id", "client_secret"],
        "scopes": ["instagram_basic", "instagram_manage_comments", "instagram_content_publish"],
        "auth_url": "https://api.instagram.com/oauth/authorize",
        "token_url": "https://api.instagram.com/oauth/access_token",
        "docs_url": "https://developers.facebook.com/docs/instagram-api/getting-started",
        "apply_url": "https://developers.facebook.com/apps",
        "notes": "Instagram uses the same Meta App as Facebook. Your Instagram account must be a Business or Creator account linked to a Facebook Page.",
        "instructions": [
            "Confirm your Instagram account is set to 'Business' or 'Creator' (Instagram app → Settings → Account → Switch account type)",
            "Link the Instagram account to a Facebook Page from Instagram → Settings → 'Linked accounts'",
            "Re-use the App ID and App Secret from your Meta App (configured under Facebook above)",
            "In the Meta App dashboard add the 'Instagram Graph API' product if not already enabled",
            "Add the Redirect URI shown below to your Meta App's OAuth settings",
            "Submit the app for review with the Instagram permissions listed below if you need production access for non-admin Instagram accounts",
        ],
    },
    "linkedin": {
        "name": "LinkedIn",
        "category": "Social",
        "auth_type": "oauth2",
        "required_fields": ["client_id", "client_secret"],
        "scopes": ["r_organization_social", "w_organization_social", "rw_organization_admin", "r_basicprofile"],
        "auth_url": "https://www.linkedin.com/oauth/v2/authorization",
        "token_url": "https://www.linkedin.com/oauth/v2/accessToken",
        "docs_url": "https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview",
        "apply_url": "https://developer.linkedin.com/",
        "notes": "Manage organisation page posts, comments and analytics. Requires LinkedIn Marketing API access.",
        "instructions": [
            "Go to https://developer.linkedin.com and click 'Create App'",
            "Associate the app with your LinkedIn Company Page (you must be a Page admin)",
            "Upload an app logo, set the privacy policy URL and verify your company page",
            "On the 'Products' tab request access to 'Community Management API' (or 'Marketing Developer Platform' for advertising)",
            "Once approved, open the 'Auth' tab and copy the Client ID and Client Secret",
            "Add the Redirect URI shown below to 'Authorized redirect URLs for your app'",
        ],
    },
    "x": {
        "name": "X (Twitter)",
        "category": "Social",
        "auth_type": "oauth2",
        "required_fields": ["client_id", "client_secret"],
        "scopes": ["tweet.read", "tweet.write", "users.read", "offline.access"],
        "auth_url": "https://twitter.com/i/oauth2/authorize",
        "token_url": "https://api.twitter.com/2/oauth2/token",
        "docs_url": "https://developer.twitter.com/en/docs/twitter-api",
        "apply_url": "https://developer.twitter.com/en/portal/petition/essential/basic-info",
        "notes": "X (Twitter) requires a paid Basic ($100/mo) or higher API tier for posting and reading tweets.",
        "instructions": [
            "Sign in at https://developer.twitter.com/en/portal/dashboard and create a Project (Free tier is read-only / very limited)",
            "Subscribe to at least the Basic plan ($100/mo) for posting access",
            "Inside the Project, create an App and open its 'Settings' tab",
            "Set 'User authentication settings' = OAuth 2.0, App permissions = 'Read and write', Type of App = 'Web App'",
            "Add the Redirect URI shown below to 'Callback URI / Redirect URL'",
            "Open the 'Keys and tokens' tab and copy the OAuth 2.0 Client ID and Client Secret",
        ],
    },
    "youtube": {
        "name": "YouTube",
        "category": "Social",
        "auth_type": "oauth2",
        "required_fields": ["client_id", "client_secret"],
        "scopes": [
            "https://www.googleapis.com/auth/youtube.force-ssl",
            "https://www.googleapis.com/auth/youtube.readonly",
        ],
        "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "docs_url": "https://developers.google.com/youtube/v3",
        "apply_url": "https://console.cloud.google.com",
        "notes": "Reuses the Google Cloud project. Daily YouTube Data API quota = 10,000 units (each comment fetch costs 1 unit).",
        "instructions": [
            "Open Google Cloud Console: https://console.cloud.google.com and pick (or create) a project",
            "Enable 'YouTube Data API v3' in 'APIs & Services' → 'Library'",
            "Configure the OAuth consent screen if you haven't already (External user type)",
            "Go to 'APIs & Services' → 'Credentials' → 'Create Credentials' → 'OAuth Client ID' (Web application)",
            "Add the Redirect URI shown below to your client's authorized redirect URIs",
            "Copy the Client ID and Client Secret",
            "If you plan to publish video uploads, request a quota increase from the YouTube Data API quota request form",
        ],
    },
    "reddit": {
        "name": "Reddit",
        "category": "Social",
        "auth_type": "oauth2",
        "required_fields": ["client_id", "client_secret"],
        "scopes": ["read", "submit", "edit", "identity", "modposts"],
        "auth_url": "https://www.reddit.com/api/v1/authorize",
        "token_url": "https://www.reddit.com/api/v1/access_token",
        "docs_url": "https://www.reddit.com/dev/api",
        "apply_url": "https://www.reddit.com/prefs/apps",
        "notes": "Free tier: 100 OAuth requests / minute. Each post or comment must include a unique User-Agent.",
        "instructions": [
            "Sign in to Reddit and open https://www.reddit.com/prefs/apps",
            "Scroll to the bottom and click 'are you a developer? create an app...'",
            "Choose 'web app' as the type",
            "Set name, description, about-URL and paste the Redirect URI shown below into 'redirect uri'",
            "Click 'create app'",
            "Copy the string under your app name (Client ID) and the 'secret' (Client Secret)",
            "Reddit requires a unique User-Agent for every API call — Critiquee adds this automatically",
        ],
    },

    # ─── Hospitality ──────────────────────────────────────────────────────
    "tripadvisor": {
        "name": "TripAdvisor",
        "category": "Hospitality",
        "auth_type": "api_key",
        "required_fields": ["api_key"],
        "partner_only": True,
        "docs_url": "https://tripadvisor-content-api.readme.io/",
        "apply_url": "https://www.tripadvisor.com/developers",
        "notes": "TripAdvisor Content API gives you traveler ratings, review snippets and ranking — partner approval required.",
        "instructions": [
            "Visit https://www.tripadvisor.com/developers and click 'Apply for API Access'",
            "Fill out the application: company info, integration purpose, expected monthly volume",
            "TripAdvisor reviews submissions weekly — approval typically takes 5–10 business days",
            "Once approved you'll receive an API Key by email and gain access to the Content API portal",
            "Paste your API Key in the field below; Critiquee rotates the key automatically when you click 'Test connection'",
            "Important: Content API limits review excerpt to 3 most-recent reviews — for full review feeds you need TripAdvisor Reviews Express partnership",
        ],
    },
    "booking": {
        "name": "Booking.com",
        "category": "Hospitality",
        "auth_type": "api_key",
        "required_fields": ["api_key", "client_id"],
        "partner_only": True,
        "docs_url": "https://developers.booking.com/connectivity/docs",
        "apply_url": "https://partner.booking.com",
        "notes": "Requires an active Booking.com Partner / Connectivity Provider account. The Client ID is your Property ID (hotelid).",
        "instructions": [
            "Sign in to Booking.com Extranet: https://admin.booking.com",
            "Open 'Account' → 'Connectivity' and click 'Connect with a connectivity provider'",
            "Choose 'I will use my own integration' and request OBP (Open Booking Platform) access",
            "Booking.com onboarding (technical certification) typically takes 4–8 weeks; you'll receive credentials once you pass certification",
            "Copy your hotelid (Property ID) into the 'Client ID / App ID' field below",
            "Paste your API Key (provided by your Booking.com BDM) into the 'API Key' field",
            "Booking.com limits OBP calls to 60 / minute / property — Critiquee throttles automatically",
        ],
    },
    "expedia": {
        "name": "Expedia (Partner Central)",
        "category": "Hospitality",
        "auth_type": "api_key",
        "required_fields": ["api_key", "client_id"],
        "partner_only": True,
        "docs_url": "https://developers.expediagroup.com/docs/products/partner-central",
        "apply_url": "https://apps.expediapartnercentral.com",
        "notes": "Expedia Partner Central API serves Expedia, Hotels.com and Vrbo reviews under one credential.",
        "instructions": [
            "Sign in to Expedia Partner Central: https://apps.expediapartnercentral.com",
            "Open 'Profile' → 'API & Webhook' (Lodging partners only)",
            "Click 'Request API Access' and select the products: Reviews, Property Insights, Reservation Management as applicable",
            "Approval normally takes 2–3 weeks and is contingent on a signed Expedia Connectivity Agreement",
            "Once approved you'll receive an API Key + your Expedia Property ID",
            "Paste the Property ID into the 'Client ID / App ID' field, and the API Key into the 'API Key' field below",
            "Expedia rate-limits to 1,000 review calls / day / property — sufficient for 4-hour polling",
        ],
    },
    "hotels_com": {
        "name": "Hotels.com",
        "category": "Hospitality",
        "auth_type": "api_key",
        "required_fields": ["api_key", "client_id"],
        "partner_only": True,
        "docs_url": "https://developers.expediagroup.com/docs/products/partner-central",
        "apply_url": "https://apps.expediapartnercentral.com",
        "notes": "Hotels.com is part of Expedia Group. Use the same Partner Central API Key + Property ID.",
        "instructions": [
            "If you've already configured Expedia above, you can re-use the same API Key and Property ID — no separate application required",
            "Otherwise follow the Expedia application steps at https://apps.expediapartnercentral.com",
            "Once you have the Expedia Partner Central credentials, paste your Property ID as 'Client ID / App ID' and the API Key as 'API Key' below",
            "Hotels.com reviews are returned in the same /reviews endpoint as Expedia — Critiquee filters them automatically by source = 'Hotels.com'",
        ],
    },
    "agoda": {
        "name": "Agoda (YCS)",
        "category": "Hospitality",
        "auth_type": "api_key",
        "required_fields": ["api_key", "client_id"],
        "partner_only": True,
        "docs_url": "https://partners.agoda.com/en-us/page/Connectivity",
        "apply_url": "https://ycs.agoda.com",
        "notes": "Agoda Smart Connect / YCS API provides bookings + guest review feeds.",
        "instructions": [
            "Sign in to Agoda YCS: https://ycs.agoda.com",
            "Open 'Distribution' → 'Smart Connect' and click 'Apply for API Access'",
            "Fill in your technical contact details and expected daily call volume",
            "Agoda enables API access in 5–10 business days after a brief technical interview",
            "Once approved, Agoda emails you a Hotel ID + a Smart Connect API Key",
            "Paste the Hotel ID as 'Client ID / App ID' and the Smart Connect Key as 'API Key' below",
            "Smart Connect rate limit: 5 requests / second / hotel",
        ],
    },
    "opentable": {
        "name": "OpenTable",
        "category": "Hospitality",
        "auth_type": "api_key",
        "required_fields": ["api_key", "client_id"],
        "partner_only": True,
        "docs_url": "https://platform.opentable.com/documentation",
        "apply_url": "https://platform.opentable.com",
        "notes": "OpenTable Restaurant Reviews API — restaurants on Pro / Concierge tiers only.",
        "instructions": [
            "Sign in to OpenTable for Restaurants: https://www.opentable.com/restaurant-management",
            "Confirm you're on the Pro or Concierge plan (review API not available on Core / Connect)",
            "Email partners@opentable.com with subject 'API access request — Reviews' and your restaurant rid",
            "OpenTable activates the API within 7–14 business days and emails an API Key + Restaurant ID (rid)",
            "Paste the rid as 'Client ID / App ID' and the API Key as 'API Key' below",
            "Reviews are pulled by OpenTable's Reviews v2 endpoint at 1 request / 30 seconds — Critiquee honours this automatically",
        ],
    },

    # ─── Travel & Tours ───────────────────────────────────────────────────
    "viator": {
        "name": "Viator",
        "category": "Travel",
        "auth_type": "api_key",
        "required_fields": ["api_key"],
        "partner_only": True,
        "docs_url": "https://docs.viator.com/partner-api/technical/",
        "apply_url": "https://merchant.viator.com",
        "notes": "Viator Partner API surfaces tour reviews, ratings and bookings.",
        "instructions": [
            "Apply to become a Viator Operator at https://merchant.viator.com",
            "Once your operator account is approved, sign in and open 'Account' → 'API Access'",
            "Click 'Generate API Key' (Production) — copy the long token shown",
            "Paste it into the 'API Key' field below",
            "Viator Partner API allows 60 calls / minute / operator and serves the most-recent 1,000 reviews per product",
        ],
    },
    "getyourguide": {
        "name": "GetYourGuide",
        "category": "Travel",
        "auth_type": "api_key",
        "required_fields": ["api_key"],
        "partner_only": True,
        "docs_url": "https://supplier-api.getyourguide.com/docs/",
        "apply_url": "https://supply.getyourguide.com",
        "notes": "GetYourGuide Connectivity API for activity & tour suppliers.",
        "instructions": [
            "Sign up as a GetYourGuide Supplier: https://supply.getyourguide.com/signup",
            "Once approved, sign in and open 'Settings' → 'API Connections'",
            "Click 'Generate Connectivity API Key' (you may need to accept the Connectivity terms first)",
            "Copy the API Key and paste it in the field below",
            "Connectivity API limits: 120 calls / minute / supplier",
        ],
    },
    "airbnb": {
        "name": "Airbnb (Host)",
        "category": "Travel",
        "auth_type": "api_key",
        "required_fields": ["api_key", "client_id"],
        "partner_only": True,
        "docs_url": "https://partners.airbnb.com/api",
        "apply_url": "https://partners.airbnb.com/contact",
        "notes": "Airbnb only opens its Host API to verified Channel Managers and Property Management Software (PMS) partners.",
        "instructions": [
            "Apply to become an Airbnb Software Partner: https://partners.airbnb.com/contact (select 'API integration')",
            "Airbnb's partnership team reviews each application — typical onboarding is 6–10 weeks including a security review",
            "Once approved, you receive a Channel Manager ID (Client ID) and a per-host API Key",
            "Paste the Channel Manager ID into 'Client ID / App ID' and the per-host API Key into 'API Key' below",
            "If your business hosts a small number of listings, contact Airbnb support directly — single-host access can sometimes be granted via Pro Hosting Tools",
        ],
    },

    # ─── Properties & Real Estate ─────────────────────────────────────────
    "zillow": {
        "name": "Zillow Premier Agent",
        "category": "Properties",
        "auth_type": "api_key",
        "required_fields": ["api_key", "client_id"],
        "partner_only": True,
        "docs_url": "https://bridgedataoutput.com/docs/explorer",
        "apply_url": "https://www.zillow.com/premier-agent/api-request",
        "notes": "Zillow's public Real Estate API was deprecated. Premier Agent / Bridge API access is available to brokerages only.",
        "instructions": [
            "Submit the Zillow Bridge API request form: https://www.zillow.com/premier-agent/api-request",
            "Provide your brokerage license, MLS membership and a description of how you'll display Zillow data",
            "Approval is at Zillow's discretion and typically takes 2–4 weeks",
            "Once approved you'll receive a Server Token (API Key) and a Bridge dataset ID (Client ID)",
            "Paste the dataset ID as 'Client ID / App ID' and the Server Token as 'API Key' below",
            "Bridge API quota: 60 requests / minute / dataset",
        ],
    },
    "realtor": {
        "name": "Realtor.com",
        "category": "Properties",
        "auth_type": "api_key",
        "required_fields": ["api_key", "client_id"],
        "partner_only": True,
        "docs_url": "https://www.realtor.com/marketing/realtor-api",
        "apply_url": "https://www.realtor.com/about/contact-us",
        "notes": "Realtor.com (Move Inc.) exposes its agent rating / lead API to vetted brokerages and SaaS partners only.",
        "instructions": [
            "Email enterprise@move.com with subject 'Realtor.com API access — partner enquiry' and include your brokerage license + business overview",
            "Move Inc.'s partnerships team will follow up within 5–7 business days for a brief discovery call",
            "Once contracted, you receive a Partner ID (Client ID) and an API Key",
            "Paste the Partner ID into 'Client ID / App ID' and the API Key into 'API Key' below",
            "Realtor.com API rate limit: 30 requests / second / partner ID",
        ],
    },
}


@router.get("/configs")
async def get_platform_configs(current_user=Depends(get_current_user)):
    """Get configuration info for all platforms"""
    return PLATFORM_CONFIGS


@router.get("/credentials")
async def get_platform_credentials(
    branch_id: str = Query(None),
    current_user=Depends(require_role("business_admin"))
):
    """Get saved platform credentials for a branch/client"""
    client_id = current_user.get("client_id")
    query = {"client_id": client_id}
    if branch_id:
        query["branch_id"] = branch_id
    
    credentials = await db.platform_credentials.find(query, {"_id": 0}).to_list(100)

    # Sensitive keys inside additional_config that must NEVER be returned to the
    # frontend in cleartext. We expose `has_<key>` booleans instead so the UI
    # can show "configured / needs configuration" without leaking values.
    SENSITIVE_ADDITIONAL = {"trustpilot_username", "trustpilot_password"}

    # Mask secrets for security (never return actual secrets)
    for cred in credentials:
        if cred.get("client_secret"):
            cred["client_secret"] = "••••••••"
            cred["has_client_secret"] = True
        if cred.get("api_key"):
            cred["api_key"] = "••••••••"
            cred["has_api_key"] = True

        # Sanitise additional_config: keep harmless keys, mask sensitive ones
        ac = cred.get("additional_config") or {}
        if ac:
            sanitised = {}
            for k, v in ac.items():
                if k in SENSITIVE_ADDITIONAL:
                    if v:  # signal presence, never the value
                        sanitised[f"has_{k}"] = True
                else:
                    sanitised[k] = v
            cred["additional_config"] = sanitised

    return credentials


@router.post("/credentials")
async def save_platform_credentials(
    req: PlatformCredentialsCreate,
    branch_id: str = Query(None),
    current_user=Depends(require_role("business_admin"))
):
    """Save or update platform developer credentials with encryption"""
    client_id = current_user.get("client_id")
    
    if req.platform not in PLATFORM_CONFIGS:
        raise HTTPException(status_code=400, detail=f"Unknown platform: {req.platform}")
    
    now = datetime.now(timezone.utc).isoformat()
    
    query = {"client_id": client_id, "platform": req.platform}
    if branch_id:
        query["branch_id"] = branch_id
    
    existing = await db.platform_credentials.find_one(query)
    
    credential_data = {
        "client_id": client_id,
        "branch_id": branch_id,
        "platform": req.platform,
        "updated_at": now
    }
    
    # Store OAuth client ID (not sensitive, can be stored as-is)
    if req.client_id:
        credential_data["oauth_client_id"] = req.client_id
    
    # Encrypt sensitive credentials before storing
    if req.client_secret:
        credential_data["client_secret"] = encrypt_token(req.client_secret)
    if req.api_key:
        credential_data["api_key"] = encrypt_token(req.api_key)
    if req.additional_config:
        # Encrypt sensitive entries inside additional_config (e.g. Trustpilot
        # business username / password used for the OAuth password grant).
        SENSITIVE_ADDITIONAL = {"trustpilot_username", "trustpilot_password"}
        merged = {}
        # Preserve any previously-saved sensitive values so an empty submission
        # doesn't wipe them — the frontend only sends the fields the user changed.
        if existing:
            existing_ac = existing.get("additional_config") or {}
            merged.update(existing_ac)
        for k, v in req.additional_config.items():
            if v in (None, ""):
                continue  # don't overwrite an existing value with an empty one
            if k in SENSITIVE_ADDITIONAL:
                merged[k] = encrypt_token(str(v))
            else:
                merged[k] = v
        if merged:
            credential_data["additional_config"] = merged
    
    if existing:
        await db.platform_credentials.update_one(query, {"$set": credential_data})
        return {"message": f"{req.platform} credentials updated"}
    else:
        credential_data["id"] = str(uuid.uuid4())
        credential_data["created_at"] = now
        await db.platform_credentials.insert_one(credential_data)
        return {"message": f"{req.platform} credentials saved"}


@router.delete("/credentials/{platform}")
async def delete_platform_credentials(
    platform: str,
    branch_id: str = Query(None),
    current_user=Depends(require_role("business_admin"))
):
    """Delete platform credentials"""
    client_id = current_user.get("client_id")
    query = {"client_id": client_id, "platform": platform}
    if branch_id:
        query["branch_id"] = branch_id
    
    result = await db.platform_credentials.delete_one(query)
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Credentials not found")
    
    # Also disconnect the platform
    conn_query = {"client_id": client_id, "platform": platform}
    if branch_id:
        conn_query["branch_id"] = branch_id
    await db.platform_connections.update_one(
        conn_query,
        {"$set": {"status": "not_connected", "access_token": None, "refresh_token": None}}
    )
    
    return {"message": f"{platform} credentials deleted"}


@router.get("/oauth/url/{platform}")
async def get_oauth_url(
    platform: str,
    branch_id: str = Query(None),
    redirect_uri: str = Query(None),
    current_user=Depends(require_role("business_admin"))
):
    """Generate OAuth authorization URL for a platform"""
    client_id = current_user.get("client_id")
    user_id = current_user.get("user_id")

    if platform not in PLATFORM_CONFIGS:
        raise HTTPException(status_code=400, detail=f"Unknown platform: {platform}")

    config = PLATFORM_CONFIGS[platform]
    if config["auth_type"] != "oauth2":
        raise HTTPException(status_code=400, detail=f"{platform} doesn't use OAuth")

    # Get stored credentials
    query = {"client_id": client_id, "platform": platform}
    if branch_id:
        query["branch_id"] = branch_id

    creds = await db.platform_credentials.find_one(query)
    if not creds or not creds.get("oauth_client_id"):
        raise HTTPException(status_code=400, detail="Please save your developer credentials first")

    # Generate unique state token
    state = str(uuid.uuid4())

    # Clean up old states for this user/platform
    await db.oauth_states.delete_many({"user_id": user_id, "platform": platform})

    # Resolve redirect_uri: must be supplied by the frontend
    if not redirect_uri:
        raise HTTPException(
            status_code=400,
            detail="redirect_uri is required. Pass window.location.origin + '/admin/oauth/callback' from the frontend."
        )

    # Store state + redirect_uri for callback verification
    await db.oauth_states.insert_one({
        "state": state,
        "user_id": user_id,
        "client_id": client_id,
        "branch_id": branch_id,
        "platform": platform,
        "redirect_uri": redirect_uri,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    # Build OAuth URL
    oauth_params = {
        "client_id": creds["oauth_client_id"],
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(config["scopes"]),
        "state": state,
    }
    if platform == "google":
        oauth_params["access_type"] = "offline"
        oauth_params["prompt"] = "consent"
    elif platform == "facebook":
        oauth_params["auth_type"] = "rerequest"

    auth_url = f"{config['auth_url']}?{urllib.parse.urlencode(oauth_params)}"

    return {"auth_url": auth_url, "redirect_uri": redirect_uri, "state": state}


@router.post("/oauth/callback")
async def handle_oauth_callback(
    code: str,
    state: str,
    current_user=Depends(require_role("business_admin"))
):
    """Handle OAuth callback and exchange code for tokens"""
    
    # Verify state
    state_doc = await db.oauth_states.find_one({"state": state})
    if not state_doc:
        raise HTTPException(status_code=400, detail="Invalid or expired state parameter")
    
    # Verify state belongs to current user
    if state_doc.get("user_id") != current_user.get("user_id"):
        raise HTTPException(status_code=403, detail="State mismatch")
    
    client_id = state_doc["client_id"]
    branch_id = state_doc.get("branch_id")
    platform = state_doc["platform"]
    
    # Clean up used state
    await db.oauth_states.delete_one({"state": state})
    
    if platform not in PLATFORM_CONFIGS:
        raise HTTPException(status_code=400, detail=f"Unknown platform: {platform}")
    
    config = PLATFORM_CONFIGS[platform]
    
    # Get stored credentials
    creds_query = {"client_id": client_id, "platform": platform}
    if branch_id:
        creds_query["branch_id"] = branch_id
    
    creds = await db.platform_credentials.find_one(creds_query)
    if not creds:
        raise HTTPException(status_code=400, detail="Credentials not found")
    
    # Decrypt client secret
    client_secret = creds.get("client_secret", "")
    if is_encrypted(client_secret):
        client_secret = decrypt_token(client_secret)
    
    # Retrieve redirect_uri from the state doc (set during URL generation)
    redirect_uri = state_doc.get("redirect_uri", "")
    if not redirect_uri:
        raise HTTPException(status_code=400, detail="Missing redirect_uri in OAuth state — authentication failed")

    # Exchange code for tokens
    token_data = {
        "client_id": creds["oauth_client_id"],
        "client_secret": client_secret,
        "code": code,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code"
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            # Different platforms expect different content types
            if platform == "facebook":
                response = await http_client.get(
                    config["token_url"],
                    params=token_data
                )
            else:
                response = await http_client.post(
                    config["token_url"],
                    data=token_data,
                    headers={"Content-Type": "application/x-www-form-urlencoded"}
                )
            
            if response.status_code != 200:
                logger.error(f"Token exchange failed: {response.status_code} - {response.text}")
                raise HTTPException(
                    status_code=400, 
                    detail=f"Token exchange failed: {response.text[:200]}"
                )
            
            tokens = response.json()
    except httpx.RequestError as e:
        logger.error(f"Token exchange request failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to connect to OAuth provider")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Encrypt tokens before storage
    access_token = tokens.get("access_token", "")
    refresh_token = tokens.get("refresh_token", "")
    
    encrypted_access = encrypt_token(access_token) if access_token else None
    encrypted_refresh = encrypt_token(refresh_token) if refresh_token else None
    
    # Calculate token expiry
    expires_in = tokens.get("expires_in", 3600)
    
    # Store tokens in platform_connections
    conn_query = {"client_id": client_id, "platform": platform}
    if branch_id:
        conn_query["branch_id"] = branch_id
    
    connection_data = {
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "branch_id": branch_id,
        "platform": platform,
        "status": "connected",
        "access_token": encrypted_access,
        "refresh_token": encrypted_refresh,
        "token_expires_in": expires_in,
        "token_type": tokens.get("token_type", "Bearer"),
        "connected_at": now,
        "last_synced_at": now
    }
    
    await db.platform_connections.update_one(
        conn_query, 
        {"$set": connection_data}, 
        upsert=True
    )
    
    logger.info(f"Successfully connected {platform} for client {client_id}")
    
    return {
        "message": f"{platform} connected successfully",
        "status": "connected",
        "platform": platform
    }


@router.post("/oauth/refresh/{platform}")
async def refresh_oauth_token(
    platform: str,
    branch_id: str = Query(None),
    current_user=Depends(require_role("business_admin"))
):
    """Refresh an expired OAuth token"""
    client_id = current_user.get("client_id")
    
    if platform not in PLATFORM_CONFIGS:
        raise HTTPException(status_code=400, detail=f"Unknown platform: {platform}")
    
    config = PLATFORM_CONFIGS[platform]
    if config["auth_type"] != "oauth2":
        raise HTTPException(status_code=400, detail=f"{platform} doesn't use OAuth")
    
    # Get connection with refresh token
    conn_query = {"client_id": client_id, "platform": platform, "status": "connected"}
    if branch_id:
        conn_query["branch_id"] = branch_id
    
    connection = await db.platform_connections.find_one(conn_query)
    if not connection or not connection.get("refresh_token"):
        raise HTTPException(status_code=400, detail="No refresh token available")
    
    # Get credentials
    creds_query = {"client_id": client_id, "platform": platform}
    if branch_id:
        creds_query["branch_id"] = branch_id
    
    creds = await db.platform_credentials.find_one(creds_query)
    if not creds:
        raise HTTPException(status_code=400, detail="Credentials not found")
    
    # Decrypt secrets
    client_secret = decrypt_token(creds["client_secret"]) if is_encrypted(creds.get("client_secret", "")) else creds.get("client_secret", "")
    refresh_token = decrypt_token(connection["refresh_token"]) if is_encrypted(connection.get("refresh_token", "")) else connection.get("refresh_token", "")
    
    # Request new token
    token_data = {
        "client_id": creds["oauth_client_id"],
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token"
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            response = await http_client.post(
                config["token_url"],
                data=token_data,
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            
            if response.status_code != 200:
                logger.error(f"Token refresh failed: {response.status_code}")
                # Mark connection as needing re-auth
                await db.platform_connections.update_one(
                    conn_query,
                    {"$set": {"status": "error", "error": "Token refresh failed"}}
                )
                raise HTTPException(status_code=400, detail="Token refresh failed - please reconnect")
            
            tokens = response.json()
    except httpx.RequestError as e:
        logger.error(f"Token refresh request failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to connect to OAuth provider")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Encrypt and store new tokens
    new_access = encrypt_token(tokens.get("access_token", ""))
    new_refresh = encrypt_token(tokens.get("refresh_token", refresh_token))  # Some providers don't return new refresh token
    
    await db.platform_connections.update_one(
        conn_query,
        {"$set": {
            "access_token": new_access,
            "refresh_token": new_refresh,
            "token_expires_in": tokens.get("expires_in", 3600),
            "last_synced_at": now
        }}
    )
    
    return {"message": "Token refreshed successfully"}


@router.get("/connection/{platform}")
async def get_platform_connection(
    platform: str,
    branch_id: str = Query(None),
    current_user=Depends(get_current_user)
):
    """Get connection status for a specific platform"""
    client_id = current_user.get("client_id")
    
    conn_query = {"client_id": client_id, "platform": platform}
    if branch_id:
        conn_query["branch_id"] = branch_id
    
    connection = await db.platform_connections.find_one(conn_query, {"_id": 0, "access_token": 0, "refresh_token": 0})
    
    if not connection:
        return {
            "platform": platform,
            "status": "not_connected",
            "has_credentials": False
        }
    
    # Check if credentials exist
    creds_query = {"client_id": client_id, "platform": platform}
    if branch_id:
        creds_query["branch_id"] = branch_id
    creds = await db.platform_credentials.find_one(creds_query)
    
    connection["has_credentials"] = bool(creds)
    return connection
