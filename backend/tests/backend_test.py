"""Boss Dental — Backend regression tests (pytest).

Covers contract for FastAPI replacement of the old Java backend:
- /api/health (público)
- /api/auth/{login,me,refresh,validate}
- /api/patients (POST list / detail / appointments / activity-logs)
- /api/doctors/active, /api/branches
- /api/appointments lock-workflow (start-slots, lock, end-slots, end-time/start-time/dentist/date, confirm, conflict 409, cleanup, get detail)
- /api/appointments/schedule/{month,day}
- /api/dashboard/appointments/today/{count,paged}
- /api/activity-logs
- Seed idempotency
"""
import os
import subprocess
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
import requests

# Always test through external ingress
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://dental-admin-10.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@bossdental.com"
ADMIN_PASSWORD = "admin123"
RECEPTION_EMAIL = "reception@bossdental.com"
RECEPTION_PASSWORD = "admin1234"


# ----------------------------- fixtures -----------------------------

@pytest.fixture(scope="session")
def session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_tokens(session):
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="session")
def admin_headers(admin_tokens):
    return {"Authorization": f"Bearer {admin_tokens['accessToken']}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def reception_tokens(session):
    r = session.post(f"{API}/auth/login", json={"email": RECEPTION_EMAIL, "password": RECEPTION_PASSWORD})
    assert r.status_code == 200, f"reception login failed: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="session")
def admin_user_id(admin_tokens):
    return admin_tokens["user"]["id"]


# Shared mutable state across tests (resource ids created in flow)
state: dict = {}


# ----------------------------- helpers -----------------------------

def _future_date(days=14) -> str:
    return (datetime.now(timezone.utc).date() + timedelta(days=days)).isoformat()


# ============================ tests ============================

# --- health ---
class TestHealth:
    def test_health_public_no_auth(self, session):
        r = session.get(f"{API}/health")
        assert r.status_code == 200
        assert r.json() == {"status": "ok"}


# --- auth ---
class TestAuth:
    def test_login_admin(self, admin_tokens):
        data = admin_tokens
        assert "accessToken" in data and "refreshToken" in data
        u = data["user"]
        for k in ("id", "name", "lastName", "email", "role", "branch"):
            assert k in u, f"missing {k} in login user"
        assert u["email"] == ADMIN_EMAIL
        assert u["role"]["name"] == "ADMIN"
        for k in ("id", "name", "description"):
            assert k in u["role"]
        assert u["branch"]["id"] == 1
        assert u["branch"]["name"]

    def test_login_reception(self, reception_tokens):
        u = reception_tokens["user"]
        assert u["email"] == RECEPTION_EMAIL
        assert u["role"]["name"] == "RECEPTION"

    def test_login_bad_credentials(self, session):
        r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong-pass"})
        assert r.status_code == 401

    def test_protected_without_token(self, session):
        r = session.get(f"{API}/auth/me")
        assert r.status_code in (401, 403)

    def test_me_with_token(self, admin_headers):
        r = requests.get(f"{API}/auth/me", headers=admin_headers)
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == ADMIN_EMAIL
        assert u["role"]["name"] == "ADMIN"

    def test_refresh(self, session, admin_tokens):
        r = session.post(f"{API}/auth/refresh", json={"refreshToken": admin_tokens["refreshToken"]})
        assert r.status_code == 200
        data = r.json()
        assert "accessToken" in data and "token" in data and "refreshToken" in data
        # token alias should equal accessToken
        assert data["token"] == data["accessToken"]

    def test_refresh_invalid(self, session):
        r = session.post(f"{API}/auth/refresh", json={"refreshToken": "not-a-token"})
        assert r.status_code == 401

    def test_protected_bad_token(self, session):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": "Bearer bad.token.here"})
        assert r.status_code in (401, 403)


# --- branches & doctors ---
class TestBranchesDoctors:
    def test_list_branches(self, admin_headers):
        r = requests.get(f"{API}/branches", headers=admin_headers)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list) and len(items) >= 1
        b = next((x for x in items if x.get("id") == 1), None)
        assert b is not None
        assert b.get("name") == "Boss Dental"
        assert b.get("active") is True

    def test_doctors_active(self, admin_headers):
        r = requests.get(f"{API}/doctors/active?branchId=1", headers=admin_headers)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) == 4, f"expected 4 doctors, got {len(items)}"
        for d in items:
            for k in ("id", "name", "lastName", "fullName", "specialty"):
                assert k in d
            assert d.get("active") is True
            assert d.get("availableForAppointments") is True
        state["doctor_id"] = items[0]["id"]


# --- patients ---
class TestPatients:
    def test_create_patient(self, admin_headers):
        suffix = uuid.uuid4().hex[:6]
        payload = {
            "name": "TEST",
            "lastName": f"Auto_{suffix}",
            "email": f"test_{suffix}@qa.local",
            "phone": "5512345678",
            "gender": "F",
            "birthDate": "1990-05-12",
            "address": "Calle Falsa 123",
            "emergencyContactName": "Mama",
            "emergencyContactPhone": "5599999999",
        }
        r = requests.post(f"{API}/patients", json=payload, headers=admin_headers)
        assert r.status_code in (200, 201), r.text
        body = r.json()
        assert "id" in body
        assert body.get("patientNumber", "").startswith(f"EXP-{datetime.utcnow().year}-")
        assert body["name"] == "TEST"
        assert body["lastName"] == payload["lastName"]
        state["patient_id"] = body["id"]
        state["patient_lastName"] = payload["lastName"]

    def test_list_patients_search(self, admin_headers):
        # find the created one via search by lastName
        ln = state["patient_lastName"]
        r = requests.get(f"{API}/patients", params={"page": 0, "size": 10, "query": ln}, headers=admin_headers)
        assert r.status_code == 200
        body = r.json()
        for k in ("content", "page", "size", "totalElements", "totalPages"):
            assert k in body
        assert body["totalElements"] >= 1
        first = body["content"][0]
        for k in ("id", "expedientNumber", "fullName", "phone", "email", "photoUrl", "active"):
            assert k in first

    def test_patient_detail(self, admin_headers):
        pid = state["patient_id"]
        r = requests.get(f"{API}/patients/{pid}/detail", headers=admin_headers)
        assert r.status_code == 200
        envelope = r.json()
        assert envelope["success"] is True
        d = envelope["data"]
        for k in ("id", "expedientNumber", "fullName", "age", "gender", "email", "phone",
                  "location", "createdAt", "initials", "balance", "paidAmount", "totalBudgeted",
                  "previousAppointment", "nextAppointment"):
            assert k in d, f"missing {k} in patient detail"
        assert d["id"] == pid
        assert d["initials"] == "TA"

    def test_patient_appointments_empty(self, admin_headers):
        pid = state["patient_id"]
        r = requests.get(f"{API}/patients/{pid}/appointments", headers=admin_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True
        assert isinstance(body["data"], list)

    def test_patient_activity_logs(self, admin_headers):
        pid = state["patient_id"]
        r = requests.get(f"{API}/patients/{pid}/activity-logs", headers=admin_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True
        d = body["data"]
        for k in ("content", "page", "size", "totalElements", "totalPages"):
            assert k in d
        # PATIENT_CREATED should be logged
        codes = [c.get("actionCode") for c in d["content"]]
        assert "PATIENT_CREATED" in codes


# --- appointments lock workflow ---
class TestAppointmentsLockWorkflow:
    def test_start_slots(self, admin_headers):
        d = _future_date(14)
        state["date"] = d
        r = requests.get(
            f"{API}/appointments/start-slots",
            params={"doctorId": state["doctor_id"], "branchId": 1, "date": d},
            headers=admin_headers,
        )
        assert r.status_code == 200
        body = r.json()
        assert "slots" in body and isinstance(body["slots"], list)
        assert len(body["slots"]) > 0
        # Pick a slot present in the list
        chosen = "10:00" if "10:00:00" in body["slots"] else body["slots"][0][:5]
        state["start_time"] = chosen
        state["start_full"] = chosen + ":00"
        state["initial_free_slots"] = len(body["slots"])

    def test_lock_slot(self, admin_headers):
        body = {
            "doctorId": state["doctor_id"],
            "branchId": 1,
            "patientId": state["patient_id"],
            "date": state["date"],
            "startTime": state["start_time"],
        }
        r = requests.post(f"{API}/appointments/lock", json=body, headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("appointmentId", "status", "lockedUntil", "endSlots"):
            assert k in data
        assert data["status"] == "LOCKED"
        assert isinstance(data["endSlots"], list) and len(data["endSlots"]) > 0
        state["appointment_id"] = data["appointmentId"]
        state["endSlots"] = data["endSlots"]

    def test_lock_conflict_409(self, admin_headers):
        # P1 contract: capacity is per BRANCH (Boss Dental cap=4), no longer per doctor.
        # Run against an externally shared DB → previous test runs may have already
        # left CONFIRMED appts on this same date+slot, so capacity might saturate
        # earlier than 4. We just assert: at some point within up to 4 extra lock
        # attempts we MUST hit a 409 "capacidad" (or all 4 succeed and the 5th 409s).
        body = {
            "doctorId": state["doctor_id"],
            "branchId": 1,
            "patientId": state["patient_id"],
            "date": state["date"],
            "startTime": state["start_time"],
        }
        saw_capacity_409 = False
        for _ in range(5):
            r = requests.post(f"{API}/appointments/lock", json=body, headers=admin_headers)
            if r.status_code == 409:
                detail = (r.json().get("detail") or "").lower()
                assert "capacidad" in detail, f"unexpected 409 detail: {detail}"
                saw_capacity_409 = True
                break
            assert r.status_code == 200, r.text
        assert saw_capacity_409, "branch capacity 409 'capacidad' never triggered after 5 lock attempts"

    def test_locked_excluded_from_schedule(self, admin_headers):
        d = state["date"]
        y, m, _ = d.split("-")
        # NOTE: Other prior test runs may have left CONFIRMED appts on this same date,
        # so we can't assert "no bucket for this date". We just verify schedule/day
        # never exposes a LOCKED row for the date.
        r = requests.get(
            f"{API}/appointments/schedule/month",
            params={"year": int(y), "month": int(m), "branchId": 1},
            headers=admin_headers,
        )
        assert r.status_code == 200

        r2 = requests.get(
            f"{API}/appointments/schedule/day",
            params={"date": d, "branchId": 1},
            headers=admin_headers,
        )
        assert r2.status_code == 200
        items = r2.json()
        assert all(x.get("statusCode") != "LOCKED" for x in items)
        # Our just-created LOCKED appointment id must NOT be present
        ids = [x.get("id") for x in items]
        assert state["appointment_id"] not in ids

    def test_end_slots(self, admin_headers):
        aid = state["appointment_id"]
        r = requests.get(
            f"{API}/appointments/{aid}/end-slots",
            params={"startTime": state["start_time"]},
            headers=admin_headers,
        )
        assert r.status_code == 200
        data = r.json()
        assert "endSlots" in data and isinstance(data["endSlots"], list)
        assert len(data["endSlots"]) > 0
        state["end_full"] = data["endSlots"][0] if isinstance(data["endSlots"][0], str) else data["endSlots"][0]

    def test_update_end_time(self, admin_headers):
        aid = state["appointment_id"]
        new_end = "10:45"
        r = requests.put(f"{API}/appointments/{aid}/end-time", json={"endTime": new_end}, headers=admin_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["endTime"].startswith(new_end)

    def test_update_start_time(self, admin_headers):
        # keep same start to avoid conflict checks
        aid = state["appointment_id"]
        r = requests.put(
            f"{API}/appointments/{aid}/start-time",
            json={"startTime": state["start_time"]},
            headers=admin_headers,
        )
        assert r.status_code == 200
        assert r.json()["startTime"].startswith(state["start_time"])

    def test_update_dentist(self, admin_headers):
        aid = state["appointment_id"]
        r = requests.put(
            f"{API}/appointments/{aid}/dentist",
            json={"dentistId": state["doctor_id"]},
            headers=admin_headers,
        )
        assert r.status_code == 200
        assert r.json()["doctorId"] == state["doctor_id"]

    def test_update_date(self, admin_headers):
        aid = state["appointment_id"]
        r = requests.put(
            f"{API}/appointments/{aid}/date",
            json={"appointmentDate": state["date"]},
            headers=admin_headers,
        )
        assert r.status_code == 200

    def test_confirm_appointment(self, admin_headers):
        aid = state["appointment_id"]
        r = requests.put(
            f"{API}/appointments/{aid}/confirm",
            json={"patientId": state["patient_id"], "reason": "Consulta general", "notes": "QA test"},
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["statusCode"] == "CONFIRMED"
        assert out["reason"] == "Consulta general"

    def test_get_appointment_detail(self, admin_headers):
        aid = state["appointment_id"]
        r = requests.get(f"{API}/appointments/{aid}", headers=admin_headers)
        assert r.status_code == 200
        a = r.json()
        for k in ("patientName", "dentistName", "branchName", "durationMinutes",
                  "statusCode", "startTime", "endTime"):
            assert k in a
        assert a["statusCode"] == "CONFIRMED"
        assert a["durationMinutes"] > 0
        assert a["branchName"]

    def test_confirmed_appears_in_schedule_day(self, admin_headers):
        d = state["date"]
        r = requests.get(f"{API}/appointments/schedule/day", params={"date": d, "branchId": 1}, headers=admin_headers)
        assert r.status_code == 200
        items = r.json()
        ids = [x.get("id") for x in items]
        assert state["appointment_id"] in ids
        my = next(x for x in items if x["id"] == state["appointment_id"])
        assert my["statusCode"] == "CONFIRMED"

    def test_appointment_logged(self, admin_headers):
        # APPOINTMENT_CREATED should now be in patient logs
        pid = state["patient_id"]
        r = requests.get(f"{API}/patients/{pid}/activity-logs", headers=admin_headers)
        assert r.status_code == 200
        codes = [c.get("actionCode") for c in r.json()["data"]["content"]]
        assert "APPOINTMENT_CREATED" in codes


# --- expired lock 410 ---
class TestExpiredLock:
    def test_expired_lock_returns_410(self, admin_headers):
        # Create a fresh lock then force-expire via Mongo
        d = _future_date(20)
        # find a free slot
        r = requests.get(
            f"{API}/appointments/start-slots",
            params={"doctorId": state["doctor_id"], "branchId": 1, "date": d},
            headers=admin_headers,
        )
        assert r.status_code == 200
        slots = r.json()["slots"]
        assert slots
        start = slots[0][:5]

        r2 = requests.post(
            f"{API}/appointments/lock",
            json={
                "doctorId": state["doctor_id"],
                "branchId": 1,
                "patientId": state["patient_id"],
                "date": d,
                "startTime": start,
            },
            headers=admin_headers,
        )
        assert r2.status_code == 200
        aid = r2.json()["appointmentId"]

        # Force expire directly in Mongo (use motor via subprocess)
        # We patch lockedUntil to a past iso timestamp.
        past = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
        py = (
            "import asyncio,os;"
            "from motor.motor_asyncio import AsyncIOMotorClient;"
            f"aid={aid};past='{past}';"
            "async def run():\n"
            " c=AsyncIOMotorClient(os.environ['MONGO_URL']);\n"
            " await c[os.environ['DB_NAME']].appointments.update_one({'id':aid},{'$set':{'lockedUntil':past}});\n"
            "asyncio.run(run())"
        )
        # Use a temp file to avoid escaping issues
        path = "/tmp/_force_expire.py"
        with open(path, "w") as f:
            f.write(
                "import asyncio, os\n"
                "from motor.motor_asyncio import AsyncIOMotorClient\n"
                "from dotenv import load_dotenv\n"
                "load_dotenv('/app/backend/.env')\n"
                f"AID = {aid}\n"
                f"PAST = '{past}'\n"
                "async def run():\n"
                "    c = AsyncIOMotorClient(os.environ['MONGO_URL'])\n"
                "    await c[os.environ['DB_NAME']].appointments.update_one({'id':AID},{'$set':{'lockedUntil':PAST}})\n"
                "asyncio.run(run())\n"
            )
        subprocess.run(["python", path], check=True, cwd="/app/backend")

        # Now PUT end-time should return 410
        r3 = requests.put(
            f"{API}/appointments/{aid}/end-time",
            json={"endTime": "11:00"},
            headers=admin_headers,
        )
        assert r3.status_code == 410, f"expected 410, got {r3.status_code}: {r3.text}"
        state["expired_aid"] = aid

    def test_cleanup_expired_locks(self, admin_headers):
        r = requests.post(f"{API}/appointments/cleanup-expired-locks", headers=admin_headers)
        assert r.status_code == 200
        body = r.json()
        assert "deletedCount" in body
        assert body["deletedCount"] >= 1

        # The expired appointment should no longer exist
        aid = state.get("expired_aid")
        if aid:
            r2 = requests.get(f"{API}/appointments/{aid}", headers=admin_headers)
            assert r2.status_code == 404


# --- schedule + dashboard + activity-logs ---
class TestScheduleDashboard:
    def test_schedule_month_buckets(self, admin_headers):
        d = state["date"]
        y, m, _ = d.split("-")
        r = requests.get(
            f"{API}/appointments/schedule/month",
            params={"year": int(y), "month": int(m), "branchId": 1},
            headers=admin_headers,
        )
        assert r.status_code == 200
        buckets = r.json()
        assert isinstance(buckets, list)
        my = next((b for b in buckets if b.get("date") == d), None)
        assert my is not None
        for k in ("totalAppointments", "confirmedCount", "completedCount", "cancelledCount", "loadLevel"):
            assert k in my
        assert my["loadLevel"] in ("VACIO", "BAJA", "MEDIA", "ALTA", "SATURADA")
        assert my["confirmedCount"] >= 1

    def test_dashboard_today_count(self, admin_headers):
        r = requests.get(f"{API}/dashboard/appointments/today/count", headers=admin_headers)
        assert r.status_code == 200
        assert "total" in r.json()
        assert isinstance(r.json()["total"], int)

    def test_dashboard_today_paged(self, admin_headers):
        r = requests.get(f"{API}/dashboard/appointments/today", params={"page": 0, "size": 10}, headers=admin_headers)
        assert r.status_code == 200
        body = r.json()
        for k in ("content", "page", "size", "totalElements", "totalPages"):
            assert k in body
        if body["content"]:
            item = body["content"][0]
            for k in ("appointmentId", "time", "patientName", "patientId", "reason",
                      "doctorName", "branchName", "statusCode", "statusName", "statusColor"):
                assert k in item

    def test_activity_logs(self, admin_headers):
        r = requests.get(f"{API}/activity-logs", params={"page": 0, "size": 20}, headers=admin_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True
        d = body["data"]
        for k in ("content", "page", "size", "totalElements", "totalPages"):
            assert k in d
        if d["content"]:
            c = d["content"][0]
            for k in ("actionCode", "module", "entityType", "entityId", "title",
                      "description", "actorName", "actorRole", "createdAt"):
                assert k in c, f"missing {k} in activity log"


# --- seed idempotency ---
class TestSeedIdempotency:
    def test_seed_idempotent(self, admin_headers):
        # snapshot counts via API
        r1 = requests.get(f"{API}/doctors/active?branchId=1", headers=admin_headers)
        before_doctors = len(r1.json())
        r2 = requests.get(f"{API}/branches", headers=admin_headers)
        before_branches = len(r2.json())

        result = subprocess.run(
            ["python", "/app/backend/seed.py"],
            capture_output=True, text=True, cwd="/app/backend",
        )
        assert result.returncode == 0, result.stderr

        r1b = requests.get(f"{API}/doctors/active?branchId=1", headers=admin_headers)
        assert len(r1b.json()) == before_doctors
        r2b = requests.get(f"{API}/branches", headers=admin_headers)
        assert len(r2b.json()) == before_branches

        # Admin login still works (password not overwritten)
        rl = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert rl.status_code == 200
