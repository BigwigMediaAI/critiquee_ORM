"""
Google Business Profile API Integration
Handles fetching reviews and posting replies
"""
import httpx
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from encryption import decrypt_token, is_encrypted

logger = logging.getLogger(__name__)

GOOGLE_API_BASE = "https://mybusinessaccountmanagement.googleapis.com/v1"
GOOGLE_BUSINESS_API = "https://mybusiness.googleapis.com/v4"


class GoogleBusinessAPI:
    def __init__(self, access_token: str):
        self.access_token = access_token
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
    
    async def test_connection(self) -> Dict[str, Any]:
        """Test API connectivity by fetching account info.

        Surfaces structured Google API errors so the UI can render actionable
        CTAs (Enable API, Wait + retry, Request quota increase) instead of
        dumping raw JSON in a toast.
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{GOOGLE_API_BASE}/accounts",
                    headers=self.headers,
                )

                if response.status_code == 200:
                    data = response.json()
                    accounts = data.get("accounts", [])
                    return {
                        "status": "connected",
                        "accounts_count": len(accounts),
                        "accounts": [{"name": a.get("accountName"), "id": a.get("name")} for a in accounts[:5]],
                    }
                if response.status_code == 401:
                    return {"status": "auth_error", "error": "Token expired or invalid. Reconnect Google from Platforms."}

                # Try to parse Google's structured error envelope
                try:
                    body = response.json()
                except Exception:
                    body = {}
                err = body.get("error") or {}
                gcode = err.get("code") or response.status_code
                gmsg = err.get("message") or response.text[:300]
                # Reason from the first detail entry (e.g. SERVICE_DISABLED, RATE_LIMIT_EXCEEDED)
                reason = ""
                project_id = ""
                api_host = ""
                for d in err.get("details", []) or []:
                    if d.get("reason"):
                        reason = d["reason"]
                    meta = d.get("metadata") or {}
                    if meta.get("consumer"):
                        # Format: "projects/430113304489"
                        project_id = (meta["consumer"] or "").split("/")[-1] or project_id
                    if meta.get("service"):
                        api_host = meta["service"] or api_host

                if response.status_code == 403 and reason in ("SERVICE_DISABLED", "ACCESS_TOKEN_SCOPE_INSUFFICIENT"):
                    return {
                        "status": "api_disabled",
                        "error_code": reason,
                        "error": (
                            "The Google My Business Account Management API isn't enabled "
                            "on your Google Cloud project. Enable it (one click), wait ~60s, then retry."
                        ),
                        "details_url": (
                            f"https://console.developers.google.com/apis/api/{api_host or 'mybusinessaccountmanagement.googleapis.com'}/overview"
                            + (f"?project={project_id}" if project_id else "")
                        ),
                        "details_label": "Enable API in Google Cloud Console",
                        "project_id": project_id or None,
                    }
                if response.status_code == 429 or reason == "RATE_LIMIT_EXCEEDED":
                    return {
                        "status": "rate_limited",
                        "error_code": "RATE_LIMIT_EXCEEDED",
                        "error": (
                            "Google's per-minute quota is exhausted. Wait ~60 seconds and retry. "
                            "The default quota for this API is just 1 request/min — request a quota increase to unblock."
                        ),
                        "details_url": "https://console.cloud.google.com/iam-admin/quotas"
                                       + (f"?project={project_id}" if project_id else ""),
                        "details_label": "Configure higher quota",
                        "project_id": project_id or None,
                    }
                # Generic Google error
                return {
                    "status": "error",
                    "error_code": reason or f"HTTP_{response.status_code}",
                    "error": f"Google API {gcode}: {gmsg[:300]}",
                }
        except Exception as e:
            logger.error(f"Google API test failed: {e}")
            return {"status": "error", "error": str(e)}
    
    async def get_locations(self, account_id: str) -> List[Dict]:
        """Get all locations for an account"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{GOOGLE_BUSINESS_API}/{account_id}/locations",
                    headers=self.headers
                )
                
                if response.status_code == 200:
                    data = response.json()
                    return data.get("locations", [])
                return []
        except Exception as e:
            logger.error(f"Failed to get locations: {e}")
            return []
    
    async def get_reviews(self, location_name: str, page_size: int = 50, page_token: str = None) -> Dict:
        """
        Fetch reviews for a location
        location_name format: accounts/{account_id}/locations/{location_id}
        """
        try:
            params = {"pageSize": page_size}
            if page_token:
                params["pageToken"] = page_token
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{GOOGLE_BUSINESS_API}/{location_name}/reviews",
                    headers=self.headers,
                    params=params
                )
                
                if response.status_code == 200:
                    data = response.json()
                    reviews = []
                    for r in data.get("reviews", []):
                        review = {
                            "platform_review_id": r.get("reviewId") or r.get("name", "").split("/")[-1],
                            "reviewer_name": r.get("reviewer", {}).get("displayName", "Anonymous"),
                            "reviewer_photo": r.get("reviewer", {}).get("profilePhotoUrl"),
                            "rating": self._star_rating_to_number(r.get("starRating")),
                            "text": r.get("comment", ""),
                            "date": r.get("createTime", ""),
                            "reply_text": r.get("reviewReply", {}).get("comment"),
                            "reply_time": r.get("reviewReply", {}).get("updateTime"),
                            "raw_data": r
                        }
                        reviews.append(review)
                    
                    return {
                        "reviews": reviews,
                        "next_page_token": data.get("nextPageToken"),
                        "total_count": data.get("totalReviewCount", len(reviews))
                    }
                elif response.status_code == 401:
                    return {"error": "Token expired", "reviews": []}
                else:
                    logger.error(f"Failed to fetch reviews: {response.status_code} - {response.text}")
                    return {"error": response.text[:200], "reviews": []}
        except Exception as e:
            logger.error(f"Exception fetching reviews: {e}")
            return {"error": str(e), "reviews": []}
    
    async def reply_to_review(self, review_name: str, reply_text: str) -> Dict:
        """
        Post a reply to a review
        review_name format: accounts/{account_id}/locations/{location_id}/reviews/{review_id}
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.put(
                    f"{GOOGLE_BUSINESS_API}/{review_name}/reply",
                    headers=self.headers,
                    json={"comment": reply_text}
                )
                
                if response.status_code in [200, 201]:
                    return {"status": "success", "data": response.json()}
                elif response.status_code == 401:
                    return {"status": "auth_error", "error": "Token expired"}
                else:
                    return {"status": "error", "error": response.text[:200]}
        except Exception as e:
            logger.error(f"Failed to reply to review: {e}")
            return {"status": "error", "error": str(e)}
    
    async def delete_reply(self, review_name: str) -> Dict:
        """Delete a reply from a review"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.delete(
                    f"{GOOGLE_BUSINESS_API}/{review_name}/reply",
                    headers=self.headers
                )
                
                if response.status_code in [200, 204]:
                    return {"status": "success"}
                else:
                    return {"status": "error", "error": response.text[:200]}
        except Exception as e:
            logger.error(f"Failed to delete reply: {e}")
            return {"status": "error", "error": str(e)}
    
    def _star_rating_to_number(self, star_rating: str) -> int:
        """Convert Google's star rating enum to number"""
        mapping = {
            "ONE": 1, "TWO": 2, "THREE": 3, "FOUR": 4, "FIVE": 5,
            "STAR_RATING_UNSPECIFIED": 0
        }
        return mapping.get(star_rating, 0)

    # ─── Business Profile Performance API ───────────────────────────────────
    # Docs: https://developers.google.com/my-business/reference/performance/rest

    async def get_performance_metrics(self, location_id: str, start_date, end_date) -> Dict:
        """Fetch a daily time-series of Business Profile performance metrics.

        Args:
            location_id: bare location ID (numeric or alphanumeric Place-ID-like).
                         Will be normalised — pass either "12345" or "locations/12345".
            start_date / end_date: datetime.date objects.
        Returns:
            dict with `series` (one entry per metric) or {"error": "..."}.
        """
        loc_id = location_id.split("/")[-1] if location_id else ""
        if not loc_id:
            return {"error": "Location ID missing"}

        metrics = [
            "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
            "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
            "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
            "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
            "CALL_CLICKS",
            "WEBSITE_CLICKS",
            "BUSINESS_DIRECTION_REQUESTS",
            "BUSINESS_CONVERSATIONS",
            "BUSINESS_BOOKINGS",
            "BUSINESS_FOOD_ORDERS",
            "BUSINESS_FOOD_MENU_CLICKS",
        ]
        params = [("dailyMetrics", m) for m in metrics] + [
            ("dailyRange.start_date.year", str(start_date.year)),
            ("dailyRange.start_date.month", str(start_date.month)),
            ("dailyRange.start_date.day", str(start_date.day)),
            ("dailyRange.end_date.year", str(end_date.year)),
            ("dailyRange.end_date.month", str(end_date.month)),
            ("dailyRange.end_date.day", str(end_date.day)),
        ]
        url = (
            "https://businessprofileperformance.googleapis.com/v1/"
            f"locations/{loc_id}:fetchMultiDailyMetricsTimeSeries"
        )
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.get(url, headers=self.headers, params=params)
            if res.status_code == 200:
                return {"series": res.json().get("multiDailyMetricTimeSeries", [])}
            if res.status_code == 401:
                return {"error": "Token expired", "auth_error": True}
            if res.status_code == 403:
                return {"error": "Performance API not enabled or insufficient scope. Enable 'Business Profile Performance API' in Google Cloud and ensure the connection uses the business.manage scope."}
            if res.status_code == 404:
                return {"error": f"Location not found ({loc_id})"}
            return {"error": f"GBP Performance API {res.status_code}: {res.text[:200]}"}
        except Exception as e:
            logger.error(f"GBP performance fetch failed: {e}")
            return {"error": str(e)}

    async def get_search_keywords(self, location_id: str, months_back: int = 1) -> Dict:
        """Fetch the top search keywords customers used to find this business.

        Returns the most-recent month's data only by default. Google's API only
        exposes monthly aggregates (no daily breakdown) for keywords.
        """
        from datetime import date
        loc_id = location_id.split("/")[-1] if location_id else ""
        if not loc_id:
            return {"error": "Location ID missing", "keywords": []}

        today = date.today()
        # Step back N months
        year = today.year
        month = today.month - months_back
        while month <= 0:
            month += 12
            year -= 1

        params = {
            "monthlyRange.startMonth.year": str(year),
            "monthlyRange.startMonth.month": str(month),
            "monthlyRange.endMonth.year": str(today.year),
            "monthlyRange.endMonth.month": str(today.month),
        }
        url = (
            "https://businessprofileperformance.googleapis.com/v1/"
            f"locations/{loc_id}/searchkeywords/impressions/monthly"
        )
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.get(url, headers=self.headers, params=params)
            if res.status_code == 200:
                items = res.json().get("searchKeywordsCounts", [])
                normalized = []
                for it in items:
                    counts = it.get("insightsValue", {}) or {}
                    impressions = (
                        int(counts.get("value") or 0)
                        if isinstance(counts.get("value"), (str, int))
                        else int(counts.get("threshold", 0) or 0)
                    )
                    normalized.append({
                        "keyword": it.get("searchKeyword", ""),
                        "impressions": impressions,
                        "is_threshold": "threshold" in counts,
                    })
                normalized.sort(key=lambda k: k["impressions"], reverse=True)
                return {"keywords": normalized}
            if res.status_code == 401:
                return {"error": "Token expired", "auth_error": True, "keywords": []}
            if res.status_code == 403:
                return {"error": "Search keywords endpoint not enabled.", "keywords": []}
            return {"error": f"GBP keywords API {res.status_code}: {res.text[:200]}", "keywords": []}
        except Exception as e:
            logger.error(f"GBP keywords fetch failed: {e}")
            return {"error": str(e), "keywords": []}

    async def find_location_id_by_place_id(self, place_id: str) -> Optional[str]:
        """Resolve a Business Profile location resource name from a Places API place_id.

        Iterates through all accounts the OAuth user manages and matches the
        location whose `metadata.placeId` equals the given place_id. Returns
        a string in the form "locations/{LOCATION_ID}" or None.
        """
        if not place_id:
            return None
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                accounts_res = await client.get(
                    "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
                    headers=self.headers,
                )
                if accounts_res.status_code != 200:
                    logger.warning(
                        "GBP accounts list failed: %s %s",
                        accounts_res.status_code, accounts_res.text[:200],
                    )
                    return None
                for acct in accounts_res.json().get("accounts", []):
                    acct_name = acct.get("name")
                    if not acct_name:
                        continue
                    locs_res = await client.get(
                        f"https://mybusinessbusinessinformation.googleapis.com/v1/{acct_name}/locations",
                        headers=self.headers,
                        params={"readMask": "name,metadata.placeId,title"},
                    )
                    if locs_res.status_code != 200:
                        continue
                    for loc in locs_res.json().get("locations", []):
                        if (loc.get("metadata") or {}).get("placeId") == place_id:
                            return loc.get("name")  # "locations/{id}"
            return None
        except Exception as e:
            logger.error(f"find_location_id_by_place_id failed: {e}")
            return None


async def get_google_api(db, client_id: str, branch_id: str = None) -> Optional[GoogleBusinessAPI]:
    """Get configured Google API client for a client/branch"""
    query = {"client_id": client_id, "platform": "google", "status": "connected"}
    if branch_id:
        query["branch_id"] = branch_id
    
    connection = await db.platform_connections.find_one(query)
    if not connection or not connection.get("access_token"):
        return None
    
    access_token = connection["access_token"]
    if is_encrypted(access_token):
        access_token = decrypt_token(access_token)
    
    return GoogleBusinessAPI(access_token)
