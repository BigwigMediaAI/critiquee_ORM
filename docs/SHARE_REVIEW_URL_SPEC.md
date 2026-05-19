# Share Review URL — Module Specification

> A reusable, framework-agnostic specification for building a "Share Review URL"
> module: a public review-collection form behind a shareable link/QR code, with
> sentiment-aware routing to external review platforms, multi-dimensional
> ratings, an admin dashboard, and CSV export.
>
> Use this as a build plan — not a copy-paste codebase. Adapt the stack
> (database, language, frontend framework) freely; the data model and HTTP
> contracts below are the binding part.

---

## 1. What this module does

Each business / branch gets a **unique shareable URL** (and matching **QR code**) that lets any customer leave a review. The form:

- Captures **name, email, mobile, optional DOB, and one or more star ratings** (each rating dimension is independently configured by the admin — e.g. "Food Quality", "Service", "Ambience").
- Stores **every submission** (good or bad) in the business's private dashboard, so the business never loses negative feedback.
- For **positive submissions** (average rating ≥ 3.5), optionally redirects the reviewer to the business's external review platforms (Google, TripAdvisor, Trustpilot, Zomato, etc.) — turning a private compliment into a public review.
- For **negative submissions**, shows a "Thank you" screen — the bad feedback stays private and gives the business a chance to recover.
- **Auto-copies** the reviewer's text to their clipboard at submit time so they can paste it on the external platform with one keystroke.

The admin dashboard lets the business owner:

- Copy / preview / QR-share the link.
- Configure rating dimensions, the positive-routing toggle, and the external platform redirect list.
- Browse all submissions with rating/DOB/text filters.
- Export submissions to CSV (today / week / month / all-time).

---

## 2. Personas

| Persona | Capability |
|---|---|
| **Business Admin** | Configures rating dimensions and external platforms, copies/shares the link, views all submissions, exports CSV. |
| **Department User** *(optional)* | Read-only access to submissions for their branch. |
| **End Customer** *(unauthenticated)* | Lands on the public review URL, rates, optionally writes text, submits. Gets redirected to external platforms if positive routing is on. |

---

## 3. Data model

Three MongoDB-style collections (translate to SQL tables if you prefer relational; the shapes are the same).

### 3.1 `review_link_settings`

One document per **client + branch** (or `branch_id="default"` for the all-branches default).

```json
{
  "id": "uuid",
  "client_id": "uuid",
  "branch_id": "uuid | 'default'",
  "positive_only": false,
  "rating_dimensions": [
    { "id": "uuid", "label": "Food Quality", "required": true },
    { "id": "uuid", "label": "Service",       "required": true },
    { "id": "uuid", "label": "Ambience",      "required": false }
  ],
  "created_at": "ISO-8601 UTC",
  "updated_at": "ISO-8601 UTC"
}
```

- If `rating_dimensions` is empty/missing → fall back to one implicit dimension labelled **"How was your experience?"**.
- Maximum 10 dimensions. Each `label` is trimmed and capped at **60 characters**.
- `positive_only=true` ⇒ positive reviewers are redirected to external platforms; `false` ⇒ everyone sees the Thank You screen.

### 3.2 `custom_review_platforms`

One document per external platform configured for a branch.

```json
{
  "id": "uuid",
  "client_id": "uuid",
  "branch_id": "uuid | 'default'",
  "platform_key":  "tripadvisor",
  "platform_name": "TripAdvisor",
  "category":      "hospitality",
  "review_url":    "https://www.tripadvisor.com/UserReviewEdit-g60763-d10005-…",
  "created_at": "ISO-8601 UTC"
}
```

- `platform_key="other"` is allowed; in that case `platform_name` must be supplied by the admin.

### 3.3 `review_submissions`

One document per public submission.

```json
{
  "id": "uuid",
  "client_id": "uuid",
  "branch_id": "uuid",
  "name":  "Priya Sharma",
  "email": "priya@example.com",
  "mobile": "+91 98xxx xxxxx",
  "date_of_birth": "1995-05-12 | null",
  "rating": 4.33,
  "ratings": [
    { "id": "uuid", "label": "Food Quality", "value": 5 },
    { "id": "uuid", "label": "Service",       "value": 4 },
    { "id": "uuid", "label": "Ambience",      "value": 4 }
  ],
  "review_text": "Outstanding service…",
  "is_positive": true,
  "redirected_to_platforms": true,
  "created_at": "ISO-8601 UTC"
}
```

- `rating` = average of `ratings[*].value`, rounded to 2 dp (used by legacy UIs/filters).
- `is_positive` = `rating >= 3.5`.
- `redirected_to_platforms` = `is_positive && settings.positive_only`.

### 3.4 Recommended indexes

```text
review_link_settings  : { client_id, branch_id }  unique
custom_review_platforms : { client_id, branch_id, created_at }
review_submissions    : { client_id, branch_id, created_at desc }
review_submissions    : { date_of_birth }  for DOB-range filter
```

---

## 4. HTTP API contract

All routes are prefixed `/api/review-link`. Authenticated routes use a bearer JWT carrying `{ user_id, client_id, role }`. Public routes require **no auth**.

### 4.1 Admin — settings

#### `GET /settings?branch_id=<branch_id>` *(auth)*

Returns the settings doc for the branch. Creates a default if none exists.

#### `PUT /settings?branch_id=<branch_id>` *(auth, role=business_admin)*

```json
{
  "positive_only": true,
  "rating_dimensions": [
    { "label": "Food Quality", "required": true },
    { "label": "Service",      "required": true }
  ]
}
```

- `id` per dimension is generated server-side if missing.
- Empty / non-list `rating_dimensions` → **400 Bad Request**.

### 4.2 Admin — custom external platforms

| Method | Path | Body / Query | Purpose |
|---|---|---|---|
| `GET`    | `/platform-categories` *(auth)* | — | Returns the curated catalog of regional review platforms grouped by industry (Hospitality, Healthcare, Travel, Real Estate, Automotive, E-commerce, Beauty, Education, B2B, Local). Each platform has `value`, `label`, `region`. |
| `GET`    | `/custom-platforms?branch_id=…` *(auth)* | — | Returns the configured platforms for this branch. |
| `POST`   | `/custom-platforms?branch_id=…` *(auth, business_admin)* | `{ platform_key, platform_name?, review_url, category? }` | Adds one. `platform_name` required only when `platform_key="other"`. |
| `DELETE` | `/custom-platforms/{platform_id}` *(auth, business_admin)* | — | Removes one. |

### 4.3 Admin — submissions

#### `GET /submissions` *(auth)*

| Query param | Type | Description |
|---|---|---|
| `branch_id` | str | Filter by branch. |
| `page` | int ≥ 1 | Pagination. |
| `limit` | int 1–100 | Page size. |
| `rating_filter` | `"all" \| "positive" \| "negative" \| "5" \| "4.5" \| …` | Filter by sentiment or exact star. |
| `search` | str | Case-insensitive search across name, email, review_text. |
| `dob_from` | `YYYY-MM-DD` | Lexicographic comparison on the stored ISO date — automatically excludes null DOBs. |
| `dob_to`   | `YYYY-MM-DD` | Upper bound. |

Response:
```json
{ "submissions": [ ... ], "total": 87, "page": 1, "total_pages": 5 }
```

#### `GET /submissions/export?period=today|weekly|monthly|all` *(auth)*

Streams a CSV with columns: `Name, Email, Mobile, Rating, Sentiment, Review Text, Redirected to Platforms, Submitted At`.

### 4.4 Public — review form

#### `GET /public/{branch_id}` *(no auth)*

Returns the bare minimum needed to render the form:
```json
{
  "business_name": "Grand Hotel",
  "branch_name":   "Main Branch",
  "positive_only": true,
  "rating_dimensions": [ ... ]
}
```

If no settings exist for `branch_id`, falls back to the `branch_id="default"` settings (single-branch businesses). If still none, returns **404**.

#### `GET /public/{branch_id}/platforms` *(no auth)*

Returns the list of external platforms the customer should be offered after a positive submission, **merged** from:
- `platform_connections` (OAuth-connected platforms like Google / Facebook / Yelp where the URL is derived from API data — e.g. Google's `https://search.google.com/local/writereview?placeid=<placeId>`).
- `custom_review_platforms` (admin-supplied URLs).

Each item: `{ platform: "google", name: "Google", review_url: "https://…" }`. Deduped by platform key.

#### `POST /public/{branch_id}/submit` *(no auth)*

```json
{
  "name":           "Priya Sharma",
  "email":          "priya@example.com",
  "mobile":         "+91 9876543210",
  "date_of_birth":  "1995-05-12",
  "ratings": [
    { "id": "<dim_id>", "value": 5 },
    { "id": "<dim_id>", "value": 4 }
  ],
  "review_text":    "Outstanding service…"
}
```

Validation:
- `name`, `email` required.
- Each rating `value` between **0.5 and 5** (allow half-stars).
- For every `rating_dimensions[i].required` that is missing → **400** with the dimension's label in the error message.
- Legacy single-rating body `{ rating: 5 }` still accepted — server synthesises one entry mapped to the first configured dimension.

Server computes `rating = avg(ratings[*].value)`, sets `is_positive`, sets `redirected_to_platforms = is_positive && positive_only`, persists to `review_submissions`, returns:
```json
{ "status": "ok", "redirect_to_platforms": true, "submission_id": "<uuid>" }
```

---

## 5. Sentiment & routing

```text
final_rating = round(avg(ratings.value), 2)
is_positive  = final_rating >= 3.5
positive_only = settings.positive_only          // admin toggle
redirect    = is_positive AND positive_only
```

- `redirect=true` ⇒ frontend transitions to the **Platforms step** (one button per `GET /public/{branch_id}/platforms` entry, plus an "Our Website" entry pointing back to your own marketing page if you want).
- Otherwise ⇒ frontend transitions to the **Thank-You step**.

The **submission is persisted regardless** — even negative reviews are saved so the business can follow up.

---

## 6. Admin frontend — `/admin/share-review`

### 6.1 Sections (top to bottom)

1. **Shareable Review Link card** — read-only URL display + 3 icon buttons:
   - `Preview` (opens the public URL in a new tab — `target="_blank" rel="noopener noreferrer"`)
   - `Copy` (clipboard)
   - `QR code` (download as PNG; use `qrcode.react` / equivalent)
2. **Settings card**
   - Toggle: "Route positive reviews to external platforms"
   - Rating-dimension editor: add/edit/remove rows; each row = `[label input | required toggle | delete]`; sticky "Save" button.
3. **External Platforms card**
   - Add-platform dialog with `platform_categories` dropdown grouped by industry, search across regions, "Custom URL" + "Custom Name" inputs when category=other.
   - Configured platforms listed with delete button.
4. **Submissions table**
   - Columns: avatar/name+email, rating chips, sentiment badge, review excerpt, date, "View" button.
   - Toolbar filters: rating dropdown, free-text search, **DOB range popover** (From / To date inputs + Clear).
   - Sticky paginator (server-driven; uses `total_pages` from API).
   - "Download" dropdown: today / weekly / monthly / all → hits `/submissions/export`.
5. **Submission detail dialog** — shows full reviewer info, every rating dimension with its label and stars, full review text, DOB if present, copyable email/mobile.

### 6.2 UX rules

- Branch context (`currentBranch.id`) is included in every API call as `?branch_id=`.
- Setting changes reset the table to page 1.
- All interactive elements carry `data-testid` (e.g. `copy-link-btn`, `preview-link-btn`, `dob-filter-toggle`).
- All long lists / tables use the same pagination component.

---

## 7. Public frontend — `/review/{branch_id}`

### 7.1 State machine

```text
loading → form ──submit──▶ {
                            positive + positive_only → platforms
                            otherwise                → thank_you
                          }
platforms / thank_you  → (terminal — no back nav)
```

### 7.2 Form step

- Header: business logo (or default star icon), `business_name`, `branch_name`.
- Card containing in order:
  1. **One rating widget per configured dimension** — half-star clickable (left = X.5, right = X).
  2. **Name** (required), **Email** (required), **Mobile** (optional), **Date of Birth** (optional `<input type="date">`).
  3. **Review text** — multi-line textarea (placeholder: "Tell us about your experience…").
  4. **Submit** button — disabled until every required dimension has a value > 0 AND name+email are non-empty.
- Validation errors show inline + as a toast.

### 7.3 Auto-copy on submit *(critical UX detail)*

When the user clicks Submit:

```js
// Step 1: synchronously initiate clipboard write INSIDE the user gesture.
//          await fetch() breaks the gesture chain in Safari + strict CSP, so
//          the writeText() call must happen *before* the first await.
let copyPromise = null;
const trimmed = reviewText.trim();
if (trimmed) {
  try { copyPromise = navigator.clipboard.writeText(trimmed); }
  catch { /* clipboard unavailable */ }
}

// Step 2: do the API call.
const res = await fetch(`/api/review-link/public/${branchId}/submit`, { … });
const data = await res.json();
if (!res.ok) throw new Error(data.detail || 'Submission failed');

// Step 3: only after success, await the copy promise + flip UI state.
if (copyPromise) {
  try {
    await copyPromise;
    setReviewCopied(true);          // controls the on-screen banner
    toast.success('Review copied to clipboard — paste it on the next platform!');
  } catch { /* silent fallback */ }
}
```

### 7.4 Platforms step (positive route)

- Heading: "Thank you! We'd love for you to share your experience on these platforms too."
- **If clipboard write succeeded**, render a blue info banner *above* the platform list:
  > 📋 **Your review is copied to your clipboard.** Just paste it (Ctrl/Cmd + V) when you reach the platform.
- One large button per platform `{platform, name, review_url}` → `target="_blank" rel="noopener noreferrer"`. Show a checkmark for each platform the user has clicked.
- "Skip" link at the bottom to leave the flow.

### 7.5 Thank-You step (negative route)

- Heading: "Thanks for your feedback".
- Subtext: "We've shared this with the team and someone will follow up shortly."
- (Optional) Show contact methods so the customer can reach the manager directly.

### 7.6 Footer (every step)

- `Powered by <Brand>`
- Two small text links:
  - `T&C` → `/tandc`
  - `Privacy Policy` → `/pp`
- Both open in a new tab.

---

## 8. QR code

Use a client-side QR library (`qrcode.react` for React, `qrcode-svg` for vanilla) to encode the public URL. Render as a `<canvas>` so it can be downloaded as a PNG with `canvas.toDataURL('image/png')` → trigger a `<a download>` click.

Recommended PNG export size: **512 × 512 px** (scale × 2 of an on-screen 256 × 256 canvas) for crisp printing.

---

## 9. CSV export — server side

- Stream the response with `Content-Disposition: attachment; filename=review_submissions_<period>_<YYYYMMDD>.csv`.
- Period filter is a single query param: `today` / `weekly` (last 7 days) / `monthly` (last 30 days) / `all`.
- Quote text fields properly — review text often contains commas and newlines.
- Cap at 10 000 rows per export (paginate in the UI if you need bigger pulls).

---

## 10. Security & privacy checklist

| Concern | How to handle it |
|---|---|
| Auth on admin endpoints | Bearer JWT with `role` claim; `require_role('business_admin')` on `PUT /settings` and add/delete custom-platform routes. |
| Public submission spam | Rate-limit `POST /public/{branch_id}/submit` to e.g. 10 req / IP / hour (Redis or in-memory counter). Add a CAPTCHA above ~5 submissions / hour from the same IP. |
| PII at rest | Hash + salt passwords (you should already), encrypt PII *only* if regulation requires it (DPDP / HIPAA / etc.); plain storage of name/email/phone is fine for normal SaaS. |
| MongoDB `_id` leaking | Always project out `_id` from queries returned to clients. |
| Date timezones | Store all timestamps as **ISO-8601 UTC strings**. Format for display in the user's locale on the client. |
| Open redirect risk | `review_url` for custom platforms must be validated as `http(s)://…` and shown as a clear external link (`rel="noopener noreferrer"`) — don't route through your own `/redirect?to=` endpoint. |
| Privacy notice | Show a footer link to your Privacy Policy on every screen. Mention what data you collect (name, email, mobile, optional DOB, review text). |

---

## 11. Suggested build phases

Build in **vertical slices** so the feature is testable end-to-end at each step.

1. **MVP — single-dimension rating, no routing**
   - Backend: `GET/PUT /settings`, `POST /public/{branch_id}/submit`, `GET /submissions`.
   - Frontend public: name + email + 5-star rating + text + submit → thank-you.
   - Frontend admin: read-only submissions table.
2. **Sentiment routing + external platforms**
   - Add `positive_only` toggle, `custom_review_platforms` collection + CRUD endpoints, `GET /public/{branch_id}/platforms`, the platforms-step UI.
3. **QR + Copy + Preview controls** on the admin page.
4. **Multi-dimensional ratings**
   - Add `rating_dimensions` to settings (with the validation rules in §3.1 & §4.1).
   - Render N rating widgets on the public form; validate every required dimension.
   - Update submission persistence to store the per-dim array + computed average.
5. **DOB + filters + CSV export**
   - Add `date_of_birth` to the public form (optional).
   - Add `dob_from` / `dob_to` filter to `GET /submissions`.
   - Add `GET /submissions/export?period=` streaming endpoint.
6. **Auto-copy on submit** with the synchronous-clipboard pattern in §7.3 and the on-screen banner in §7.4.
7. **Polish**
   - Submission detail dialog with full rating breakdown.
   - Custom-platform catalog by region (the `platform_categories` shape in §4.2).
   - Pagination, search, branch context, role-based access checks.
   - Footer T&C + Privacy Policy public routes.

Treat each phase as shippable. Don't bundle phases 4–6 in one PR — they're independently valuable.

---

## 12. Test-credential layout (for QA / CI)

For automated tests, seed:

- 1 `client` with 1 `branch_id`.
- 1 `business_admin` user with a known password.
- 1 `review_link_settings` doc with 3 rating dimensions (2 required, 1 optional) and `positive_only=true`.
- 2 `custom_review_platforms`: Google + TripAdvisor.
- ~20 `review_submissions` across a 90-day range, mix of positive/negative, half with `date_of_birth` populated.

Standard test cases to write:

1. PUT settings with empty `rating_dimensions` → 400.
2. PUT settings with 11 dimensions → only first 10 persisted.
3. POST `/submit` missing a required dim → 400 with the dim label in the error.
4. POST `/submit` with all 5-star ratings → `redirect_to_platforms: true`, doc has `is_positive=true`.
5. POST `/submit` with mixed 5/2/3 ratings (avg 3.33) → `is_positive=false`.
6. GET `/submissions?dob_from=1990-01-01&dob_to=1995-12-31` → only rows with a DOB in that range.
7. GET `/submissions/export?period=today` → CSV with today's rows only, correct quoting.
8. Public submission with `name=""` → 400.
9. Concurrent submission from same email → both succeed (no uniqueness constraint).
10. Frontend: Submit a 5-star review and verify clipboard contains `review_text`.

---

## 13. Drop-in folder structure (suggested)

```
backend/
  routes/
    review_link_routes.py        # all endpoints in §4
  services/
    review_sentiment.py          # is_positive helper, future ML hooks
  tests/
    test_review_link_settings.py
    test_review_link_submit.py
    test_review_link_export.py

frontend/
  pages/
    admin/ShareReviewLink.jsx    # admin dashboard (§6)
    public/ReviewForm.jsx        # public form (§7)
    public/PrivacyPolicy.jsx     # /pp
    public/TermsAndConditions.jsx # /tandc
  components/
    HalfStarRating.jsx           # half-star clickable rating widget
    DataPagination.jsx           # shared paginator
    LegalLayout.jsx              # shared layout for /pp, /tandc
```

---

## 14. Open extensions / future ideas

- **Pre-fill external platforms** with the review text via URL query params where allowed (TripAdvisor, Trustpilot, Yelp, Booking.com — each accepts a different param name).
- **One-click testimonial post** — turn each 5★ review into a pre-composed social-media post with the rating card image attached.
- **Department assignment** — auto-assign negative submissions to a department user with in-app notification.
- **NPS-style score** alongside the star rating.
- **Multi-language form** — pass `?lang=hi` etc. and look up translations of the dimension labels.
- **Anti-bot** — honeypot field + reCAPTCHA v3 invisible challenge on the submit endpoint.
- **Webhook** — fire to a configurable URL on every submission so businesses can pipe it to their CRM / Slack.

---

**That's the whole module.** Hand this doc to any engineer with the data model in §3 and the API contract in §4, and they have everything they need to rebuild Share Review URL in any stack — Node/Express, Rails, Django, .NET, etc. The frontend portion in §6–§7 is descriptive enough to apply to React, Vue, Svelte, or plain HTML.
