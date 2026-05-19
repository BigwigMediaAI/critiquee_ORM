# Handleey PRD

## Original Problem Statement
Handleey is a web-based platform for hotels and businesses to manage all reviews and social pages in one place.

## Product Summary
A full-stack web application (React + FastAPI + MongoDB) that allows hotels and businesses to:
- View and manage reviews from multiple platforms (Google, TripAdvisor, etc.)
- Reply to reviews manually or with AI-assisted suggestions
- Manage social pages (Facebook, Instagram, LinkedIn, X, YouTube, Reddit)
- Create department users and assign items for replies
- Schedule posts with image attachments
- Receive real-time notifications for new reviews and comments
- Analyze Google My Business performance, competitors, and sentiment
- Collect customer reviews via shareable links and QR codes

## User Roles
- **Super Admin**: Manages all client accounts (key: `SA`)
- **Business Admin**: Manages workspace, platforms, branches (unique Business Key)
- **Department User**: Sees only assigned branch/items (Business Key login)

## Architecture
- **Frontend**: React + Tailwind CSS + shadcn/ui + Recharts (port 3000)
- **Backend**: FastAPI/Python (port 8001)
- **Database**: MongoDB
- **Auth**: JWT with Business Key layer
- **Background Jobs**: APScheduler
- **Encryption**: Fernet for API credentials
- **AI**: OpenAI GPT-4o-mini via Emergent integration (sentiment analysis)
- **Image Export**: html2canvas for review-to-PNG sharing

## Key Features Implemented

### Authentication & Authorization (Complete)
### Branch-Based Multi-Tenancy (Complete)
### Platform Management (Complete)
### Reviews Management (Complete)
### Social Posts Management (Complete)
### Post Creation & Publishing (Complete)
### Notification System (Complete - Mar 2026)
### Google My Business Module (Complete - Mar 2026)
### Share Review Link (Complete - Apr 2026)

**Share Review Link Sub-features:**
- Admin page with shareable review link, QR code (downloadable), share button
- Enable/Disable "Accept only positive feedback" toggle
- When ON: ratings >= 3.5 redirect to connected platform review pages
- When ON: ratings < 3.5 show "Thank you" only (captured internally)
- Public review form at /review/{branchId} — no auth required
- Form collects: name, email, mobile, half-star rating (0.5 increments), review text
- Platform redirect step: shows connected + custom platforms, clicking one opens in new tab and removes it
- **Custom Review Platforms**: Admins can add unlimited custom review platform links (dropdown of common platforms like TripAdvisor, Booking.com, Yelp, Trustpilot, Expedia, Hotels.com, OpenTable, Zomato, Agoda, Airbnb, Foursquare, Glassdoor + "Other" for free-text). These appear alongside auto-detected connected platforms on the public form.
- Submissions table with pagination, rating filter (positive/negative/specific stars), search
- Available in sidebar for all roles (super_admin, business_admin, department)

## Database Collections
- `users`, `clients`, `branches`, `reviews`, `social_posts`, `social_comments`
- `platform_connections`, `scheduled_posts`, `notifications`
- `gmb_businesses`
- `review_link_settings`: client_id, branch_id, positive_only, created_at
- `review_submissions`: client_id, branch_id, name, email, mobile, rating, review_text, is_positive, redirected_to_platforms, created_at
- `custom_review_platforms`: client_id, branch_id, platform_key, platform_name, review_url, created_at

## Key API Endpoints
- Auth: `POST /api/auth/login`, `GET /api/auth/me`
- Reviews: `GET /api/reviews/`, `POST /api/reviews/{id}/reply`
- Notifications: `GET /api/notifications/`, `POST /api/notifications/{id}/read`
- GMB: `GET /api/gmb/status`, `POST /api/gmb/search`, etc.
- Review Link: `GET/PUT /api/review-link/settings`, `GET /api/review-link/submissions`
- Review Link Public: `GET /api/review-link/public/{branch_id}`, `GET /api/review-link/public/{branch_id}/platforms`, `POST /api/review-link/public/{branch_id}/submit`
- Custom Platforms: `GET /api/review-link/platform-options`, `GET/POST /api/review-link/custom-platforms`, `DELETE /api/review-link/custom-platforms/{id}`

## Credentials
- Super Admin: key=SA, email=admin@handleey.com, password=Handleey@2024
- Business Admin (Grand Hotel): key=EOW-69RH8F, email=manager@grandhotel.com, password=Test1234!

### CSV Download Report (Complete - Feb 2026)
- "Download Report" dropdown on `/admin/share-review` page
- Filters: Today, Weekly, Monthly, All
- Endpoint: `GET /api/review-link/export?period=...`
- Streams a filtered CSV of `review_submissions` for the active branch

### Google Review AI Auto-Reply (Complete - Feb 2026)
- Toggle `google_auto_reply_enabled` on branch (managed in `/admin/settings`)
- APScheduler background job in `backend/scheduler.py`
- Auto-generates replies (OpenAI GPT-4o-mini via Emergent LLM Key) for 4★/5★ Google reviews
- Hard cap: max 5 auto-replies per branch per day

### Post Preview (Complete - Feb 2026)
- "Preview" button on `/admin/create-post` opens dialog
- Toggle between Desktop and Mobile views
- Generic social card preview with business avatar, content, image grid, and reaction icons

### AI Image Generation (Complete - Feb 2026)
- "Generate with AI" button on `/admin/create-post`
- Uses OpenAI **gpt-image-1** via Emergent LLM Key (`emergentintegrations.llm.openai.image_generation`)
- Endpoint: `POST /api/ai/generate-image` — returns S3/local URL
- Generated images plug into the post images list, alongside manual uploads

### Multi-language Support (Complete - Feb 2026)
- 10 languages: en, es, fr, de, pt, ru, ar, hi, zh, ja
- Language selector in dashboard header (after branch icon)
- Powered by `react-i18next` + `i18next-browser-languagedetector`
- Persists in localStorage key `handleey_language`
- Sets RTL direction automatically for Arabic
- Translations cover navigation, common actions, Create Post page, Event QR page

### Event QR (Complete - Feb 2026)
- New menu item "Event QR" at `/admin/events`
- Create events with name, venue, date, end date, description
- Auto-generated public registration URL: `/event/:eventId`
- Downloadable QR code (PNG) per event via `qrcode.react`
- DataTable with columns: Event Name, Date, QR thumbnail, Registrations count, Status (Active toggle + Lifecycle badge), Actions
- Filters: search, status (Active/Inactive), lifecycle (Upcoming/Live/Ended computed from event_date)
- Per-event registrations dialog with CSV export
- All-events CSV export
- Public registration form: Name + Email + Mobile (no auth); blocks duplicate registrations by email
- DB collections: `events`, `event_registrations`

### AI Compose Post (Complete - Feb 2026)
- "Compose with AI" button on `/admin/create-post` (top-right of Compose Post card)
- Dialog accepts a topic prompt, tone selector, hashtag toggle, SEO keywords toggle
- Endpoint: `POST /api/ai/compose-post` returns `{content, hashtags[], keywords[]}` via OpenAI GPT-4o (Emergent LLM Key)
- "Use this post" replaces composer content; "Append to current post" merges with existing draft

### Reply Signature (Complete - Feb 2026)
- New "Reply Signature" card on `/admin/settings`
- Enable/disable toggle + signature textarea (max 500 chars)
- Stored at the **client level** (always — even when a branch is selected) so it applies globally across branches
- Backend `POST /api/ai/suggest-reply` reads signature_enabled+signature from client doc and auto-appends signature to every AI-generated suggestion when enabled (also instructs the LLM to skip its own sign-off)
- Settings GET surfaces signature on branch responses by mirroring it from the client

### Categorized Review Platform Picker (Complete - Feb 2026)
- `/admin/share-review` "Add Platform" form redesigned with **Business Category → Platform** searchable dropdowns
- Endpoint: `GET /api/review-link/platform-categories` returns 11 categories: Hospitality, Healthcare, Travel & Tours, Properties & Real Estate, Automotive, E-commerce & Retail, Beauty & Wellness, Education, Professional B2B, Local & General Services, Other
- Region-tagged platforms focused on India / UAE / US (e.g. Practo, Okadoc, Healthgrades, Bayut, 99acres, Zillow, Zomato, MakeMyTrip, Rayna Tours, etc.)
- Both dropdowns include a search input; "Other / Custom" stays available with free-text custom name
- `POST /api/review-link/custom-platforms` now persists `category` alongside platform_key/name/url; `_platform_label_from_catalog` resolves the canonical display name from the catalog

### Expanded Platform Integrations (Complete - Feb 2026)
- `/admin/platforms` now exposes **21 platforms** (up from 9), grouped by category:
  - **Reviews & Local (4)**: Google, Yelp, Trustpilot, Foursquare
  - **Social (6)**: Facebook, Instagram, LinkedIn, X, YouTube, Reddit
  - **Hospitality (6)**: TripAdvisor, Booking.com, Expedia, Hotels.com, Agoda, OpenTable
  - **Travel (3)**: Viator, GetYourGuide, Airbnb (Host)
  - **Properties (2)**: Zillow Premier Agent, Realtor.com
- Each platform now carries `category`, `docs_url`, `apply_url`, `notes`, `partner_only` and detailed multi-step `instructions` (URL/email auto-linkified)
- Configure dialog upgrades:
  - One-click "Open Developer Console" + "API Docs" buttons
  - Numbered setup-instructions list with clickable URLs/emails
  - "Partner approval required" badge for partner-only platforms
  - OAuth Redirect URI block with copy-to-clipboard button
  - Connect button label switches between "Authorize" (OAuth) and "Connect" (api_key)
- Platforms page now renders cards in category sections with "X/N connected" subtitle per section
- New startup migration `migrate_enabled_platforms` backfills any newly-added platforms onto existing clients' `enabled_platforms` array (non-destructive)
- `ALL_PLATFORMS` in `/super-admin/clients` UI updated to include the full 21-platform catalog

### Yelp / Trustpilot / Foursquare Sync (Complete - Feb 2026)
- New service modules: `services/yelp_api.py`, `services/trustpilot_api.py`, `services/foursquare_api.py` — each exposes `test_connection()` + `get_reviews()` (or `get_tips()` for Foursquare) and a `get_*_api(db, client_id, branch_id)` resolver that decrypts the saved API key
- New sync handlers in `routes/sync_routes.py`: `sync_yelp_reviews`, `sync_trustpilot_reviews`, `sync_foursquare_tips` — wired into the existing `run_platform_sync()` dispatcher
- Shared upsert helper `_upsert_review()` writes new reviews to `db.reviews` and surfaces a per-branch in-app notification when fresh data arrives
- Config update: Trustpilot & Foursquare switched from OAuth2 → simple `api_key` flow (the read-only review APIs don't require token exchange). The "Client ID / App ID" field now stores the per-business identifier (Yelp business alias, Trustpilot Business Unit ID, Foursquare fsq_id) — instructions in the Configure dialog explain exactly where to find each
- `SYNCABLE_PLATFORMS` (frontend) extended so the Test/Sync buttons appear on these three cards once connected
- Auto-sync scheduler (`scheduler.py`) now polls these three platforms every 15 min if `auto_sync` is enabled on the connection
- New pytest module `backend/tests/test_sync_yelp_trustpilot_foursquare.py` (8 tests) — mocks `httpx.AsyncClient` to verify response normalisation, missing-credential paths, and the `run_platform_sync` dispatcher integration. **38/38 backend tests pass.**

### Reply-back wiring for Yelp / Trustpilot / Foursquare (Complete - Feb 2026)
- Added `reply_to_review()` to all three service modules. Behaviour by platform:
  - **Yelp Fusion** — explicitly forbids third-party replies. Returns `unsupported` + a deep link to the original review on yelp.com
  - **Trustpilot** — when only the api-key/business-unit-id is configured, returns `unsupported` + a deep link to the Trustpilot Business app. **When the optional reply credentials (API Secret + Business email + Business password) are also configured, Trustpilot.reply_to_review now actually posts the reply** via the OAuth password-grant flow (`POST /v1/oauth/oauth-business-users-for-applications/accesstoken` for the Bearer token, then `POST /v1/private/reviews/{reviewId}/reply` with the message). Access token is cached in-memory per API instance to avoid re-fetching for back-to-back replies. Reply failures (auth, network, 4xx) gracefully fall back to the manual-CTA path with a precise error message.
  - **Foursquare** — Places API has no tip-reply endpoint at all. Returns `unsupported` + a link to the Foursquare venue page
- Refactored `routes/review_routes.reply_to_review` into a clean dispatcher that calls `_post_reply_to_platform(...)`. Successful Trustpilot replies clear the `platform_reply_unsupported` flag so the manual-reply CTA disappears from the UI
- New review fields persisted: `platform_reply_unsupported`, `platform_reply_message`, `platform_external_url`, `platform_external_label`
- `ReviewDetail.jsx` shows a clear amber CTA card under the saved reply when `platform_reply_unsupported` is true, with the platform-specific message and a one-click external CTA
- **Trustpilot Configure dialog** extended with an optional "Enable automatic replies" panel (collapsible, purple-themed) that collects: API Secret (mapped to `client_secret`), Business email (`additional_config.trustpilot_username`), Business password (`additional_config.trustpilot_password`). Sensitive values are encrypted server-side before storage and **never returned in cleartext** by `GET /credentials` — the API only surfaces `has_<field>` booleans so the UI can show a "Configured" badge without leaking secrets
- **9 new pytest cases** verifying password-grant flow (success, auth failure fallback, token caching), plus the existing dispatcher tests. **46/46 backend tests pass.** Live curl confirmed credentials are encrypted on disk, masked on read, and reply attempts surface helpful error messages on auth failure

### Brand rename → Critiquee (Complete - May 2026)
- Renamed every user-facing surface from "Handleey" to "Critiquee": login screen brand, sidebar logo, page `<title>` + meta tags, embed widget brand text + container ID (`critiquee-reviews`, with backwards-compat for the legacy `handleey-reviews` id), public review-form footer, embed snippet code on the GMB page, FastAPI service title and `/health` payload
- Cosmetic-only fallback strings in `auth.py` and `encryption.py` were also updated (production secrets come from `.env` and were intentionally left untouched to preserve existing tokens / encrypted credentials)
- **Intentionally preserved** to protect production data: `DB_NAME=handleey`, JWT/encryption .env values, localStorage keys (`handleey_token`, `handleey_user`, `handleey_branch_*`, `handleey_language` — keeps existing users logged-in across the rebrand), seeded super-admin email already in production DB

### Google Business Profile Insights Tab (Complete - May 2026)
- New "Profile Insights" tab on `/admin/gmb` powered by Google Business Profile **Performance API** (real metrics, not synthesized)
- New backend endpoint `GET /api/gmb/insights?branch_id=...&days=N` — resolves the OAuth access token from `platform_connections.google`, looks up the BP location resource by `place_id` via the Account Management + Business Information APIs (cached in-memory + persisted to `gmb_businesses.bp_location_id` for 24h), then calls `locations/{id}:fetchMultiDailyMetricsTimeSeries` for impressions / calls / website-clicks / direction-requests / messages / bookings / food orders, plus the monthly `searchkeywords/impressions/monthly` endpoint
- New service methods on `GoogleBusinessAPI`: `get_performance_metrics()`, `get_search_keywords()`, `find_location_id_by_place_id()`
- New frontend component `components/GMBInsightsTab.jsx` — date-range selector (7/30/90/180 days), 4-up topline summary (impressions / customer-actions / action-rate / daily-average), 6 KPI cards, multi-series stacked area chart (recharts), top search-keywords table with privacy-threshold indicator
- Graceful empty/error states: "Connect your GBP" / "Reconnect (token expired)" / "Performance API not enabled" — each with a Retry + "Open Platforms" deep link
- All 46 backend tests still pass; live curl confirms the endpoint returns a clean `not_authorised` payload when GBP isn't connected

### Event Callback URL — redirect attendees after registration (Complete - May 2026)
- **Backend** (`event_routes.py`):
  - Added `callback_url: Optional[str]` to `EventCreate` and `EventUpdate` Pydantic models
  - New `_normalize_callback_url()` helper validates the URL must start with `http://` or `https://` — blocks `javascript:`, `data:`, bare domains, etc., returning **400 Bad Request** with a clear message
  - Stored on event creation; cleared when admin PUTs `callback_url=""`
  - Exposed via `GET /api/events/public/{event_id}` AND echoed in the `POST /api/events/public/{event_id}/register` response so the frontend doesn't need a second round-trip
- **Admin UI** (`EventQR.jsx` Create Event dialog):
  - New "Callback URL (optional)" field after Description, with `ExternalLink` icon, `type="url"`, placeholder `https://your-site.com/thank-you`, and inline help text
  - Client-side `^https?://` regex guard prevents obvious typos; backend re-validates
- **Public form** (`EventRegistration.jsx`):
  - On successful registration, if a callback URL is configured: toast "Registered — redirecting…" → `window.location.replace(callback_url)` (replace so Back button skips the form)
  - Otherwise: the existing green "Thank you" success screen renders as before
- **Tested**: 8 backend scenarios via curl all pass — create with/without URL, reject invalid scheme, reject `javascript:`, reject bare domain, public info exposes URL, register echoes URL, register without echoes null, PUT-with-empty-string clears the field. Frontend dialog screenshot confirms field placement and styling.

### JustDial + Reply pill on Social + Preview on Share Review + Auto-copy on Submit (Complete - May 2026)

**1. JustDial integration** (mirrors Zomato — partner-only):
- New `services/justdial_api.py` (test/get_reviews/reply→unsupported) using `apikey` header + Bearer fallback + configurable `additional_config.api_base_url` (defaults to `https://api.justdial.com/businessconnect/v1`)
- Wired into `sync_routes.py` (api_getters + dispatcher + `sync_justdial_reviews` + `_REPLY_UNSUPPORTED_AT_SYNC` entry), `review_routes.py` reply dispatcher, `scheduler.py` 15-min poll
- Added to `PLATFORM_CONFIGS` under "Reviews & Local" with `partner_only=true` + 8-step setup instructions for Business Connect onboarding
- Frontend: `PlatformIcon` (`Building2` icon, JustDial yellow `#FFB200`), `Reviews.PLATFORMS` filter, `SYNCABLE_PLATFORMS` list

**2. Reply button on `/admin/social` — light pill style:**
- `bg-primary/10 text-primary border border-primary/20 rounded-md px-2.5 py-1` (replacing the old plain text-link). Hover boost `bg-primary/15 border-primary/30`
- Verified visually with seeded comments — clean pill shape with icon + chevron

**3. Preview button on `/admin/share-review` Shareable Review Link:**
- New `Eye` icon button between the URL display and Copy button — opens the review URL in a new tab
- `data-testid="preview-link-btn"`

**4. Auto-copy review text on submit (`/review/{branch_id}`):**
- Restructured `handleSubmit` to initiate `navigator.clipboard.writeText(reviewText)` SYNCHRONOUSLY inside the user-gesture chain (before `await fetch`), then await the resolved Promise after the API call — this satisfies Safari + strict CSP requirements
- On success: sets `reviewCopied` state, fires toast "Review copied to clipboard — paste it on the next platform!"
- New visual banner on the platforms step (`data-testid="review-copied-hint"`) — blue-tinted card with `ClipboardCheck` icon: "Your review is copied to your clipboard. Just paste it (Ctrl/Cmd + V) when you reach the platform."

### Configure-platform Dialog: Responsive Layout (Complete - May 2026)
- Restructured the Configure dialog on `/admin/platforms` to: sticky header (title + close) → scrollable middle (notes, quick links, setup instructions, credential fields, redirect URI banner) → sticky footer (Cancel + Save Credentials)
- Replaced fixed `sm:max-w-lg` with responsive `w-[calc(100vw-1rem)] sm:max-w-lg` so the dialog no longer overflows narrow viewports
- Added `max-h-[calc(100vh-1rem)] sm:max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden` — content scrolls inside the dialog, never spills past the viewport
- Redirect-URI banner (long callback URL) now stacks vertically on `<sm` so the Copy button stays visible
- Verified at 1440 / 1280×720 / 768 / 390 viewports + after inner-scroll on mobile: Save button remains visible in every case

### Zomato integration + Universal reply pattern + Share Review as Image (Complete - May 2026)
- New **Zomato** platform card on `/admin/platforms` under "Reviews & Local" with `partner_only=true` badge
  - New service `services/zomato_api.py` with `test_connection()`, `get_reviews()`, `reply_to_review()` (returns `unsupported` with deep link)
  - Stores partner `user-key` (encrypted), numeric `restaurant_id`, optional `additional_config.api_base_url` override (defaults to `https://api.zomato.com/v3`)
  - Auth honest about Zomato's reality: legacy `developers.zomato.com` API is dead since 2021 — only Zomato Restaurant Partner programme members get working credentials
  - Wired into `routes/sync_routes.py` (api_getters + dispatcher + new `sync_zomato_reviews`), `routes/review_routes.py` `_post_reply_to_platform()`, `scheduler.py` 15-min auto-sync poll
  - Setup instructions in Configure dialog explain the partner-rep onboarding flow
- **Universal "Reply via API or deep-link" pattern** applied to all review-syncing platforms:
  - `_REPLY_UNSUPPORTED_AT_SYNC` whitelist in `sync_routes._upsert_review()` pre-flags Yelp / Foursquare / Zomato reviews with `platform_reply_unsupported=true` + platform-specific message + external-CTA label at sync time, so the "Manual reply" amber badge appears immediately (not only after a reply is attempted)
  - Trustpilot stays dynamic — replies post via OAuth password-grant when credentials are configured; otherwise the dispatcher marks unsupported on the fly
  - Google / Facebook / Reddit / YouTube continue to reply through their respective APIs
- **Share Review button** on every row of `/admin/reviews`:
  - New shared component `components/ReviewShareCard.jsx` (extracted from GMB's inline copy + extended with platform pill)
  - Click the new Share icon next to the chevron → dialog opens with a stylised dark gradient card showing branch name, Zomato/etc. platform pill, avatar, star row, italic blockquote text, date
  - Three actions: **Close · Download (PNG)** · **Share** (Web Share API Level 2 — shares the rendered PNG file on mobile/iOS/Android, falls back to download on desktop)
- `PlatformIcon` extended with `zomato` (UtensilsCrossed icon, brand-red color)
- Frontend `SYNCABLE_PLATFORMS` + Reviews-page `PLATFORMS` filter now include `zomato`

### Privacy Policy & Terms pages on critiquee.com (Complete - May 2026)
- New public routes `/pp` (Privacy Policy) and `/tandc` (Terms & Conditions) — no auth required
- Comprehensive, production-grade content tailored to Critiquee's actual practices: account data, customer review submissions (incl. optional DOB), encrypted third-party OAuth credentials, sub-processors (OpenAI/Emergent, AWS S3 in eu-north-1, MongoDB), 21 connected platforms enumerated, GDPR/UK GDPR/India DPDP/CCPA rights, cookies, retention, security (TLS 1.2+, Fernet, bcrypt, JWT), governing law: India / New Delhi
- Shared `LegalLayout.jsx` with Critiquee header (logo + cross-link to sibling legal page), back-to-home link, last-updated date, and footer with `support@`, `privacy@`, `legal@`, `security@` contact emails + copyright
- Custom `.legal-prose` CSS in `index.css` (no `@tailwindcss/typography` dependency added) — Manrope headings, 15/1.7 body, slate-700 text, blue-600 links, slate-900 strongs, `code` chips
- Public review-form footer links updated from `handleey.vercel.app/tandc` & `/pp` → in-app `/tandc` & `/pp` (no more external Vercel hop)

### Event QR Share Button (Complete - May 2026)
- New **Share** button in the Event QR table Actions column (between Download QR and Copy Link) and in the QR Preview dialog (now a 3-up grid: Open · Share · Download QR)
- Helper `shareEvent()` uses progressive enhancement:
  1. Web Share API Level 2 — shares the QR PNG **file** + URL + title (works on mobile + recent desktop browsers; users can post the QR image directly to WhatsApp/Instagram/Mail/etc.)
  2. Falls back to native `navigator.share` with URL+text only (for browsers that don't support file sharing)
  3. Final fallback: copies the registration link to the clipboard with an informative toast
- Cancellations (`AbortError`) are silently handled — no false "Unable to share" toasts when the user dismisses the share sheet
- Added `events.shareQR` translation key (English: "Share QR")

### Date of Birth filter on Submissions table + Public footer T&C/Privacy links (Complete - May 2026)
- Admin `/admin/share-review` Review Submissions toolbar gained a new "DOB" chip (Cake icon). Click opens a 280px popover with **From** + **To** date inputs, a "Clear" link, and live preview text. The button label updates to e.g. "DOB: 2026-05-01 → 2026-05-31" once a range is set, and resets the page back to 1 on change
- Backend `GET /api/review-link/submissions` now accepts optional `dob_from` / `dob_to` query params (YYYY-MM-DD strings; lexicographic compare on the stored ISO date strings — automatically excludes null/missing DOBs). Verified with curl: full list (16 total) → range 2026-05-01..2026-05-31 returns 2 rows; out-of-range returns 0 rows; upper-bound-only correctly excludes records past the date
- Public review form footer (`/review/{branch_id}`) now shows two small hyperlinks below "Powered by Critiquee": **T&C** → `https://handleey.vercel.app/tandc` and **Privacy Policy** → `https://handleey.vercel.app/pp`. Both open in a new tab with `rel="noopener noreferrer"`

### "Manual reply needed" badge & filter (Complete - May 2026)
- New amber **"Manual reply"** badge on each Reviews list row where `platform_reply_unsupported=true && reply_text` — surfaces the rows that have a CRM-saved reply waiting to be posted manually on the source platform (currently Yelp + Foursquare; Trustpilot only when reply credentials aren't configured)
- New filter chip "Manual reply needed [count]" appears next to the existing Sentiment filter when at least one such review exists. Click toggles the filter on/off; the URL `?manual_reply=1` is preserved so the link is shareable
- Backend: extended `GET /api/reviews/?manual_reply_needed=true|false` and added `manual_reply_needed` to `GET /api/reviews/counts` so the chip can show a live count
- Tooltip on the badge shows the platform-specific message (e.g. "Yelp Fusion API does not allow third-party replies"), mirroring what the ReviewDetail page surfaces
- Logo letter updated from "H" → "C" on login & sidebar (final piece of the brand rebrand)
- 3 new pytest cases (counts contract + true/false filter behaviour); **49/49 backend tests pass**. Live screenshot confirms the badge, the filter chip, and the post-click filtered list

## P1 Backlog (Next Priority)
1. Department user assignment system with notifications (assign reviews/comments to specific users)

## P2 Backlog
1. Reporting module (response time metrics, rating trends)
2. Super Admin subscription/plan management
3. Automated weekly GMB email reports
4. Error dashboard for Super Admins
5. Email notifications, white-label branding, multi-language replies
6. Migrate frontend token storage from localStorage to httpOnly cookies
7. Refactor large components (`CreatePost.jsx`, `Platforms.jsx`, `ShareReviewLink.jsx`) and high-complexity backend functions (`platform_routes.py`, `gmb_routes.py`)
8. Expand i18n coverage to remaining pages (Reviews, GMB, Settings, Reports)
9. Real review-feed implementations for the partner-API platforms (Yelp Fusion, Trustpilot OAuth, TripAdvisor, Booking, Expedia, Viator, etc.) — currently only credentials & OAuth handshake are wired up
