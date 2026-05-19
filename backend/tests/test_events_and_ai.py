"""Backend tests for Event QR + AI Image Generation features (iteration 15)."""
import os
import io
import csv
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://social-sync-44.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# Business Admin creds (from /app/memory/test_credentials.md)
BIZ_KEY = "EOW-69RH8F"
BIZ_EMAIL = "manager@grandhotel.com"
BIZ_PASS = "Test1234!"


@pytest.fixture(scope="session")
def biz_token():
    r = requests.post(f"{API}/auth/login", json={"key": BIZ_KEY, "email": BIZ_EMAIL, "password": BIZ_PASS}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code} {r.text}")
    return r.json()["token"]


@pytest.fixture
def biz_session(biz_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {biz_token}", "Content-Type": "application/json"})
    return s


# ============ Event endpoints ============
class TestEventsCRUD:
    created_event_id = None

    def test_list_events_initial(self, biz_session):
        r = biz_session.get(f"{API}/events/", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "events" in data and isinstance(data["events"], list)

    def test_create_event(self, biz_session):
        payload = {
            "name": "TEST_Event_QR_PyTest",
            "description": "Backend automation test",
            "venue": "Test Hall",
            "event_date": "2030-12-25T10:00:00Z",
            "event_end_date": "2030-12-25T18:00:00Z",
        }
        r = biz_session.post(f"{API}/events/", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == payload["name"]
        assert data["venue"] == payload["venue"]
        assert data["is_active"] is True
        assert data["registrations_count"] == 0
        assert data["lifecycle"] == "upcoming"
        assert "id" in data and isinstance(data["id"], str)
        TestEventsCRUD.created_event_id = data["id"]

    def test_list_events_after_create(self, biz_session):
        assert TestEventsCRUD.created_event_id, "create must run first"
        r = biz_session.get(f"{API}/events/", timeout=15)
        assert r.status_code == 200
        ids = [e["id"] for e in r.json()["events"]]
        assert TestEventsCRUD.created_event_id in ids

    def test_update_event_toggle_inactive(self, biz_session):
        eid = TestEventsCRUD.created_event_id
        r = biz_session.put(f"{API}/events/{eid}", json={"is_active": False, "venue": "Updated Venue"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["is_active"] is False
        assert d["venue"] == "Updated Venue"

    def test_public_inactive_returns_403(self, biz_session):
        eid = TestEventsCRUD.created_event_id
        r = requests.get(f"{API}/events/public/{eid}", timeout=15)
        assert r.status_code == 403, r.text

    def test_reactivate_event(self, biz_session):
        eid = TestEventsCRUD.created_event_id
        r = biz_session.put(f"{API}/events/{eid}", json={"is_active": True}, timeout=15)
        assert r.status_code == 200
        assert r.json()["is_active"] is True

    def test_public_event_info_active(self):
        eid = TestEventsCRUD.created_event_id
        r = requests.get(f"{API}/events/public/{eid}", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["id"] == eid
        # Ensure no client_id leaked
        assert "client_id" not in d

    def test_public_event_info_404(self):
        r = requests.get(f"{API}/events/public/non-existent-uuid-zzz", timeout=15)
        assert r.status_code == 404

    def test_public_register_success(self):
        eid = TestEventsCRUD.created_event_id
        payload = {"name": "TEST User", "email": f"test_user_{int(time.time())}@example.com", "mobile": "9876543210"}
        r = requests.post(f"{API}/events/public/{eid}/register", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["success"] is True
        # Save email for duplicate test
        TestEventsCRUD._reg_email = payload["email"]

    def test_public_register_duplicate_409(self):
        eid = TestEventsCRUD.created_event_id
        email = getattr(TestEventsCRUD, "_reg_email", None)
        assert email
        r = requests.post(f"{API}/events/public/{eid}/register",
                          json={"name": "Dup", "email": email, "mobile": "1111111111"}, timeout=15)
        assert r.status_code == 409, r.text

    def test_list_registrations(self, biz_session):
        eid = TestEventsCRUD.created_event_id
        r = biz_session.get(f"{API}/events/{eid}/registrations", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "registrations" in d and len(d["registrations"]) >= 1
        assert "event" in d

    def test_export_events_csv(self, biz_session):
        r = biz_session.get(f"{API}/events/export/csv", timeout=15)
        assert r.status_code == 200, r.text
        assert "text/csv" in r.headers.get("content-type", "")
        # Verify CSV header
        reader = csv.reader(io.StringIO(r.text))
        header = next(reader)
        assert "Event Name" in header

    def test_export_registrations_csv(self, biz_session):
        eid = TestEventsCRUD.created_event_id
        r = biz_session.get(f"{API}/events/{eid}/registrations/export", timeout=15)
        assert r.status_code == 200, r.text
        assert "text/csv" in r.headers.get("content-type", "")
        reader = csv.reader(io.StringIO(r.text))
        header = next(reader)
        assert header[:3] == ["Name", "Email", "Mobile"]

    def test_delete_event(self, biz_session):
        eid = TestEventsCRUD.created_event_id
        r = biz_session.delete(f"{API}/events/{eid}", timeout=15)
        assert r.status_code == 200
        assert r.json()["deleted"] is True
        # Verify gone
        r2 = requests.get(f"{API}/events/public/{eid}", timeout=15)
        assert r2.status_code == 404

    def test_unauth_list_events(self):
        r = requests.get(f"{API}/events/", timeout=15)
        assert r.status_code in (401, 403)


# ============ AI Image Generation ============
class TestAIImage:
    def test_generate_image_validation(self, biz_session):
        r = biz_session.post(f"{API}/ai/generate-image", json={"prompt": "ab"}, timeout=30)
        assert r.status_code == 400, r.text

    def test_generate_image_unauth(self):
        r = requests.post(f"{API}/ai/generate-image", json={"prompt": "a beautiful sunset"}, timeout=30)
        assert r.status_code in (401, 403)

    @pytest.mark.timeout(180)
    def test_generate_image_success(self, biz_session):
        r = biz_session.post(
            f"{API}/ai/generate-image",
            json={"prompt": "a single red apple on a clean white background, photo realistic"},
            timeout=180,
        )
        if r.status_code == 500 and ("rate" in r.text.lower() or "limit" in r.text.lower()):
            pytest.skip(f"AI rate-limited: {r.text}")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "urls" in d and isinstance(d["urls"], list) and len(d["urls"]) >= 1
        assert d["count"] == 1
        assert d["urls"][0].startswith("http") or d["urls"][0].startswith("/")
