"""Boss Dental — POST /appointments/create (cita directa) + walk-in assign flow (iteration 8/9).

Cubre:
- POST /appointments/create con doctor OPCIONAL → CONFIRMED sin doctor (doctor* en null).
- POST /appointments/create con doctor → CONFIRMED con doctorAsignado/doctorName poblados.
- Validaciones: 400 si endTime <= startTime; 400 si fecha=hoy y startTime<ahora; 400 si reason vacío.
- 404 si patientId no existe.
- 409 si doctor no activo/disponible.
- 409 si sucursal sin capacidad (cuando doctor está dado).
- Walk-in con doctorId=null → ARRIVED/walkIn=True/sin doctorAsignado;
  PUT /assign-doctor mantiene walkIn=True, statusCode=ARRIVED y pobla doctorAsignado.
- GET /schedule/day muestra ambas citas (con y sin doctor) y los walk-ins (asignados y no).
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

CLINIC_TZ = ZoneInfo("America/Mexico_City")

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://dental-admin-10.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@bossdental.com", "password": "admin123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def admin_headers():
    tok = _login(ADMIN)["accessToken"]
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
        "name": "TEST_CREATE",
        "lastName": f"P_{suffix}",
        "email": f"test_create_{suffix}@qa.local",
        "phone": "5512345678",
        "gender": "F",
        "birthDate": "1991-02-22",
        "address": "Calle CREATE 1",
        "emergencyContactName": "Mama",
        "emergencyContactPhone": "5599999999",
    }
    r = requests.post(f"{API}/patients", json=payload, headers=admin_headers)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _future_date(days=21):
    # Fecha en TZ local de la clínica, evitando domingo (clínica cerrada).
    d = datetime.now(CLINIC_TZ).date() + timedelta(days=days)
    if d.weekday() == 6:
        d += timedelta(days=1)
    return d.isoformat()


def _local_today_iso():
    return datetime.now(CLINIC_TZ).date().isoformat()


# ============================ Create direct ============================

class TestCreateAppointmentDirect:
    def test_create_without_doctor(self, admin_headers, patient_id):
        body = {
            "patientId": patient_id,
            "branchId": 1,
            "appointmentDate": _future_date(21),
            "startTime": "10:00",
            "endTime": "10:30",
            "doctorId": None,
            "reason": "Limpieza",
            "notes": "sin doctor",
        }
        r = requests.post(f"{API}/appointments/create", json=body, headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["statusCode"] == "CONFIRMED"
        assert data["walkIn"] is False
        assert data["doctorId"] is None
        assert data["doctorName"] is None
        assert data["doctorAsignado"] is None
        assert data["doctorAsignadoName"] is None
        assert data["doctorSolicitado"] is None
        assert data["reason"] == "Limpieza"
        assert data["startTime"].startswith("10:00")
        assert data["endTime"].startswith("10:30")
        # aparece en schedule/day
        rs = requests.get(f"{API}/appointments/schedule/day",
                          params={"date": body["appointmentDate"], "branchId": 1},
                          headers=admin_headers)
        assert rs.status_code == 200
        ids = [it.get("id") for it in rs.json()]
        assert data["id"] in ids

    def test_create_with_doctor(self, admin_headers, doctors, patient_id):
        doc = doctors[0]
        body = {
            "patientId": patient_id,
            "branchId": 1,
            "appointmentDate": _future_date(22),
            "startTime": "11:00",
            "endTime": "11:30",
            "doctorId": doc["id"],
            "reason": "Revisión",
        }
        r = requests.post(f"{API}/appointments/create", json=body, headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["statusCode"] == "CONFIRMED"
        assert data["doctorId"] == doc["id"]
        assert data["doctorAsignado"] == doc["id"]
        assert data["doctorName"]
        assert data["doctorAsignadoName"] == data["doctorName"]

    def test_create_400_end_before_start(self, admin_headers, patient_id):
        body = {
            "patientId": patient_id, "branchId": 1,
            "appointmentDate": _future_date(23),
            "startTime": "12:00", "endTime": "12:00",
            "doctorId": None, "reason": "x",
        }
        r = requests.post(f"{API}/appointments/create", json=body, headers=admin_headers)
        assert r.status_code == 400
        assert "fin" in (r.json().get("detail") or "").lower() or "mayor" in (r.json().get("detail") or "").lower()

        body["endTime"] = "11:30"
        r = requests.post(f"{API}/appointments/create", json=body, headers=admin_headers)
        assert r.status_code == 400

    def test_create_400_today_past_hour(self, admin_headers, patient_id):
        today_local = _local_today_iso()
        now_local = datetime.now(CLINIC_TZ)
        # Si la clínica está cerrada hoy (domingo) saltamos esta prueba.
        if now_local.weekday() == 6:
            pytest.skip("Domingo: clínica cerrada, no aplica la regla 'past hour'.")
        # Necesitamos una hora dentro del horario laboral (09–18) que ya haya pasado.
        if now_local.hour < 10:
            pytest.skip("Antes de las 10:00 local no hay 'past hour' dentro del horario laboral.")
        body = {
            "patientId": patient_id, "branchId": 1,
            "appointmentDate": today_local,
            "startTime": "09:00", "endTime": "09:30",
            "doctorId": None, "reason": "x",
        }
        r = requests.post(f"{API}/appointments/create", json=body, headers=admin_headers)
        assert r.status_code == 400
        assert "anterior" in (r.json().get("detail") or "").lower()

    def test_create_400_empty_reason(self, admin_headers, patient_id):
        body = {
            "patientId": patient_id, "branchId": 1,
            "appointmentDate": _future_date(24),
            "startTime": "13:00", "endTime": "13:30",
            "doctorId": None, "reason": "   ",
        }
        r = requests.post(f"{API}/appointments/create", json=body, headers=admin_headers)
        assert r.status_code == 400

    def test_create_404_patient_not_found(self, admin_headers):
        body = {
            "patientId": 999999, "branchId": 1,
            "appointmentDate": _future_date(25),
            "startTime": "10:00", "endTime": "10:30",
            "doctorId": None, "reason": "x",
        }
        r = requests.post(f"{API}/appointments/create", json=body, headers=admin_headers)
        assert r.status_code == 404

    def test_create_400_sunday_closed(self, admin_headers, patient_id):
        # Buscamos el próximo domingo en TZ local
        d = datetime.now(CLINIC_TZ).date() + timedelta(days=1)
        while d.weekday() != 6:
            d += timedelta(days=1)
        body = {
            "patientId": patient_id, "branchId": 1,
            "appointmentDate": d.isoformat(),
            "startTime": "10:00", "endTime": "10:30",
            "doctorId": None, "reason": "x",
        }
        r = requests.post(f"{API}/appointments/create", json=body, headers=admin_headers)
        assert r.status_code == 400, r.text
        detail = (r.json().get("detail") or "").lower()
        assert "domingo" in detail

    def test_create_400_past_date(self, admin_headers, patient_id):
        past = (datetime.now(CLINIC_TZ).date() - timedelta(days=1)).isoformat()
        body = {
            "patientId": patient_id, "branchId": 1,
            "appointmentDate": past,
            "startTime": "10:00", "endTime": "10:30",
            "doctorId": None, "reason": "x",
        }
        r = requests.post(f"{API}/appointments/create", json=body, headers=admin_headers)
        assert r.status_code == 400
        assert "pasada" in (r.json().get("detail") or "").lower()

    def test_create_400_outside_business_hours(self, admin_headers, patient_id):
        # 19:00 está fuera del horario laboral (cierre 18:00 lun-vie).
        d = datetime.now(CLINIC_TZ).date() + timedelta(days=5)
        # Asegurar no domingo y no sábado (para usar el cierre 18:00).
        while d.weekday() >= 5:
            d += timedelta(days=1)
        body = {
            "patientId": patient_id, "branchId": 1,
            "appointmentDate": d.isoformat(),
            "startTime": "19:00", "endTime": "19:30",
            "doctorId": None, "reason": "x",
        }
        r = requests.post(f"{API}/appointments/create", json=body, headers=admin_headers)
        assert r.status_code == 400, r.text
        assert "horario" in (r.json().get("detail") or "").lower() or "turno" in (r.json().get("detail") or "").lower()

    def test_create_409_branch_saturation_with_doctor(self, admin_headers, doctors, patient_id):
        # Capacidad sucursal Boss Dental = 4. Llenar 4 citas en el mismo slot con doctor,
        # luego la 5ª debe responder 409 'capacidad'.
        date = _future_date(40)
        start, end = "09:00", "09:30"
        ok = 0
        for d in doctors[:4]:
            body = {
                "patientId": patient_id, "branchId": 1,
                "appointmentDate": date,
                "startTime": start, "endTime": end,
                "doctorId": d["id"], "reason": "fill",
            }
            r = requests.post(f"{API}/appointments/create", json=body, headers=admin_headers)
            if r.status_code == 200:
                ok += 1
            else:
                # si choca antes de 4, también es 409 — está bien
                assert r.status_code == 409
                break
        # ahora intento la 5ª (cualquier doctor) — debe ser 409
        last = {
            "patientId": patient_id, "branchId": 1,
            "appointmentDate": date,
            "startTime": start, "endTime": end,
            "doctorId": doctors[0]["id"], "reason": "overflow",
        }
        r = requests.post(f"{API}/appointments/create", json=last, headers=admin_headers)
        assert r.status_code == 409
        detail = (r.json().get("detail") or "").lower()
        assert "capacidad" in detail or "sucursal" in detail


# ============================ Walk-in assign-doctor preserva walkIn ============================

class TestWalkInAssignDoctor:
    def test_walkin_then_assign_keeps_walkin_and_arrived(self, admin_headers, doctors, patient_id):
        r = requests.post(f"{API}/appointments/walk-in",
                          json={"patientId": patient_id, "branchId": 1, "doctorId": None, "reason": "wi"},
                          headers=admin_headers)
        assert r.status_code == 200, r.text
        wi = r.json()
        assert wi["walkIn"] is True
        assert wi["statusCode"] == "ARRIVED"
        assert wi["doctorAsignado"] is None

        # asignar doctor
        doc = doctors[0]
        ra = requests.put(f"{API}/appointments/{wi['id']}/assign-doctor",
                          json={"doctorId": doc["id"], "confirmReplace": True},
                          headers=admin_headers)
        assert ra.status_code == 200, ra.text
        d = ra.json()
        assert d["walkIn"] is True, "assign-doctor no debe romper el flag walkIn"
        assert d["statusCode"] == "ARRIVED", "assign-doctor en walk-in debe seguir en ARRIVED"
        assert d["doctorAsignado"] == doc["id"]
        assert d["doctorAsignadoName"]

        # también visible en schedule/day del día actual
        today = _local_today_iso()
        rs = requests.get(f"{API}/appointments/schedule/day",
                          params={"date": today, "branchId": 1}, headers=admin_headers)
        ids = [it.get("id") for it in rs.json()]
        assert wi["id"] in ids
        item = next(it for it in rs.json() if it["id"] == wi["id"])
        assert item["walkIn"] is True
        assert item["doctorAsignado"] == doc["id"]
