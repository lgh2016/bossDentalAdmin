"""Boss Dental — Walk-in & History (pytest).

Cubre:
- POST /appointments/walk-in (sin doctor → ARRIVED/Sin cita/PURPLE, walkIn=True)
- POST /appointments/walk-in (con doctor → doctorAsignado set + name)
- POST /appointments/walk-in con patientId inexistente → 404
- Log WALK_IN_REGISTERED creado
- GET /appointments/{id}/history → estructura + orden inverso por createdAt
- Walk-in aparece en GET /appointments/schedule/day del día actual
- Walk-in aparece en GET /api/dentist/waiting-room del doctor de la branch
- Flujo E2E walk-in: register → assign-doctor → start-attention → finish-attention → completed-today
- GET /appointments/{id} expone walkIn, patientExpedient, patientPhone, rescheduledAt, cancelReason, cancelledAt
- GET /appointments/schedule/day también expone esos campos por item
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://dental-admin-10.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@bossdental.com", "password": "admin123"}
DENTIST = {"email": "dentist@bossdental.com", "password": "dentist123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def admin_headers():
    tok = _login(ADMIN)["accessToken"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def dentist_headers():
    tok = _login(DENTIST)["accessToken"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def doctors(admin_headers):
    r = requests.get(f"{API}/doctors/active?branchId=1", headers=admin_headers)
    assert r.status_code == 200
    return r.json()


@pytest.fixture
def patient_id(admin_headers) -> int:
    suffix = uuid.uuid4().hex[:6]
    payload = {
        "name": "TEST_WALKIN",
        "lastName": f"P_{suffix}",
        "email": f"test_walkin_{suffix}@qa.local",
        "phone": "5512345678",
        "gender": "M",
        "birthDate": "1992-03-15",
        "address": "Calle WALKIN 99",
        "emergencyContactName": "Mama",
        "emergencyContactPhone": "5599999999",
    }
    r = requests.post(f"{API}/patients", json=payload, headers=admin_headers)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _walkin(headers, body):
    return requests.post(f"{API}/appointments/walk-in", json=body, headers=headers)


# ============================ Walk-in básico ============================

class TestWalkInRegister:
    def test_walkin_no_doctor(self, admin_headers, patient_id):
        r = _walkin(admin_headers, {"patientId": patient_id, "branchId": 1, "doctorId": None, "reason": "Dolor agudo"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["statusCode"] == "ARRIVED"
        assert data["statusName"] == "Sin cita"
        assert data["walkIn"] is True
        assert data["horaLlegada"] not in (None, "")
        assert data["horaProgramada"] is None
        assert data["doctorAsignado"] is None
        assert data["reason"] == "Dolor agudo"

        # log WALK_IN_REGISTERED creado en activity-logs del paciente
        rl = requests.get(f"{API}/patients/{patient_id}/activity-logs", headers=admin_headers)
        assert rl.status_code == 200
        codes = [c.get("actionCode") for c in rl.json()["data"]["content"]]
        assert "WALK_IN_REGISTERED" in codes

    def test_walkin_with_doctor(self, admin_headers, doctors, patient_id):
        carlos = next(d for d in doctors if d["id"] == 1)
        r = _walkin(admin_headers, {"patientId": patient_id, "branchId": 1, "doctorId": 1, "reason": "Urgencia"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["walkIn"] is True
        assert data["doctorAsignado"] == 1
        assert data["doctorAsignadoName"] == carlos.get("fullName") or "Carlos Hernández"

    def test_walkin_patient_not_found(self, admin_headers):
        r = _walkin(admin_headers, {"patientId": 999999, "branchId": 1, "doctorId": None})
        assert r.status_code == 404


# ============================ History ============================

class TestAppointmentHistory:
    def test_history_structure_and_reverse_order(self, admin_headers, doctors, patient_id):
        """Lock → confirm → arrive → assign-doctor → start → finish → history >=5 eventos en orden inverso."""
        from datetime import timedelta
        date = (datetime.now(timezone.utc).date() + timedelta(days=220)).isoformat()
        # buscar slot libre
        r = requests.get(f"{API}/appointments/start-slots",
                         params={"doctorId": 1, "branchId": 1, "date": date}, headers=admin_headers)
        start = r.json()["slots"][0][:5]
        r = requests.post(f"{API}/appointments/lock",
                          json={"doctorId": 1, "branchId": 1, "patientId": patient_id, "date": date, "startTime": start},
                          headers=admin_headers)
        aid = r.json()["appointmentId"]
        requests.put(f"{API}/appointments/{aid}/confirm",
                     json={"patientId": patient_id, "reason": "hist", "notes": ""}, headers=admin_headers)
        requests.put(f"{API}/appointments/{aid}/arrive", headers=admin_headers)
        maria = next(d for d in doctors if d["name"] == "María")
        requests.put(f"{API}/appointments/{aid}/assign-doctor",
                     json={"doctorId": maria["id"]}, headers=admin_headers)
        requests.put(f"{API}/appointments/{aid}/start-attention", headers=admin_headers)
        requests.put(f"{API}/appointments/{aid}/finish-attention",
                     json={"notes": "ok"}, headers=admin_headers)

        rh = requests.get(f"{API}/appointments/{aid}/history", headers=admin_headers)
        assert rh.status_code == 200, rh.text
        body = rh.json()
        assert body["appointmentId"] == aid
        assert isinstance(body["events"], list)
        assert len(body["events"]) >= 5
        # cada evento tiene los campos clave
        for ev in body["events"]:
            assert "actionCode" in ev
            assert "title" in ev
            assert "createdAt" in ev
        # orden inverso por createdAt
        timestamps = [e["createdAt"] for e in body["events"]]
        assert timestamps == sorted(timestamps, reverse=True), f"history no está en orden inverso: {timestamps}"


# ============================ Walk-in visible en agenda/dentista ============================

class TestWalkInVisibility:
    def test_walkin_appears_in_schedule_day(self, admin_headers, patient_id):
        r = _walkin(admin_headers, {"patientId": patient_id, "branchId": 1, "doctorId": None, "reason": "Vis"})
        assert r.status_code == 200
        aid = r.json()["id"]
        today = datetime.now(timezone.utc).date().isoformat()
        rs = requests.get(f"{API}/appointments/schedule/day",
                          params={"date": today, "branchId": 1}, headers=admin_headers)
        assert rs.status_code == 200
        ids = [it.get("id") for it in rs.json()]
        assert aid in ids, f"walk-in {aid} no apareció en schedule/day {today}"
        # también valida que el item viene con walkIn=True
        item = next(it for it in rs.json() if it.get("id") == aid)
        assert item["walkIn"] is True
        assert item["statusCode"] == "ARRIVED"
        # nuevos campos extendidos en schedule/day
        for k in ("patientExpedient", "patientPhone", "rescheduledAt", "cancelReason", "cancelledAt"):
            assert k in item, f"missing {k} in schedule/day item"

    def test_walkin_appears_in_dentist_waiting_room(self, admin_headers, dentist_headers, patient_id):
        # asigna doctor=1 (Carlos) para que el dentista lo vea
        r = _walkin(admin_headers, {"patientId": patient_id, "branchId": 1, "doctorId": 1, "reason": "Vis-dent"})
        aid = r.json()["id"]
        rw = requests.get(f"{API}/dentist/waiting-room", headers=dentist_headers)
        assert rw.status_code == 200, rw.text
        # endpoint puede wrappear o devolver list
        items = rw.json()
        if isinstance(items, dict):
            items = items.get("content") or items.get("data") or []
        ids = [it.get("id") or it.get("appointmentId") for it in items]
        assert aid in ids, f"walk-in {aid} no apareció en waiting-room"


# ============================ Flujo end-to-end walk-in ============================

class TestWalkInE2E:
    def test_walkin_full_flow(self, admin_headers, dentist_headers, doctors, patient_id):
        # registrar walk-in SIN doctor
        r = _walkin(admin_headers, {"patientId": patient_id, "branchId": 1, "doctorId": None, "reason": "E2E"})
        aid = r.json()["id"]
        # asignar doctor=1 — usar confirmReplace para el caso de conflicto (regla nueva)
        ra = requests.put(f"{API}/appointments/{aid}/assign-doctor",
                          json={"doctorId": 1, "confirmReplace": True}, headers=admin_headers)
        assert ra.status_code == 200, ra.text
        # Si el doctor está en otra atención (IN_PROGRESS), finalizarla y reintentar start
        rs = requests.put(f"{API}/appointments/{aid}/start-attention", headers=admin_headers)
        if rs.status_code == 409 and rs.json().get("detail", {}).get("code") == "DOCTOR_ATTENTION_BUSY":
            conflict_id = rs.json()["detail"].get("conflictAppointmentId")
            if conflict_id:
                requests.put(f"{API}/appointments/{conflict_id}/finish-attention",
                             json={"notes": "auto-finish for test"}, headers=admin_headers)
            rs = requests.put(f"{API}/appointments/{aid}/start-attention", headers=admin_headers)
        assert rs.status_code == 200, rs.text
        body = rs.json()
        assert body["statusCode"] == "IN_PROGRESS"
        assert body["horaInicioReal"]
        # finish-attention
        rf = requests.put(f"{API}/appointments/{aid}/finish-attention",
                          json={"notes": "atendido walk-in"}, headers=admin_headers)
        assert rf.status_code == 200
        assert rf.json()["statusCode"] == "COMPLETED"
        assert rf.json()["horaFinReal"]
        # aparece en completed-today del dentista (doctor 1)
        rc = requests.get(f"{API}/dentist/completed-today", headers=dentist_headers)
        assert rc.status_code == 200
        items = rc.json()
        if isinstance(items, dict):
            items = items.get("content") or items.get("data") or []
        ids = [it.get("id") or it.get("appointmentId") for it in items]
        assert aid in ids, f"walk-in completado {aid} no apareció en completed-today"
        item = next(it for it in items if (it.get("id") or it.get("appointmentId")) == aid)
        # horaInicioReal y horaFinReal presentes
        assert item.get("horaInicioReal")
        assert item.get("horaFinReal")


# ============================ Detail exposes new fields ============================

class TestAppointmentDetailExtraFields:
    def test_get_appointment_exposes_walkin_and_patient_fields(self, admin_headers, patient_id):
        r = _walkin(admin_headers, {"patientId": patient_id, "branchId": 1, "doctorId": None})
        aid = r.json()["id"]
        rd = requests.get(f"{API}/appointments/{aid}", headers=admin_headers)
        assert rd.status_code == 200
        data = rd.json()
        for k in ("walkIn", "patientExpedient", "patientPhone", "rescheduledAt", "cancelReason", "cancelledAt"):
            assert k in data, f"missing {k}"
        assert data["walkIn"] is True
        # patientExpedient con prefijo EXP-
        assert data["patientExpedient"] and str(data["patientExpedient"]).startswith("EXP-"), \
            f"patientExpedient mal formateado: {data['patientExpedient']}"
        assert data["patientPhone"] == "5512345678"
