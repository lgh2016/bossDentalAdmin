"""Boss Dental — P1 backend regression tests (pytest).

Cubren los nuevos endpoints del ciclo de vida de la cita y la capacidad
POR SUCURSAL (no por doctor):
- POST /appointments/lock con doctorSolicitado + horaProgramada
- PUT /appointments/{id}/confirm → hereda doctorAsignado del solicitado
- PUT /appointments/{id}/arrive → horaLlegada + 409 desde estados inválidos
- PUT /appointments/{id}/assign-doctor → cambia doctorAsignado, conserva doctorSolicitado
- PUT /appointments/{id}/start-attention (desde ARRIVED y desde CONFIRMED)
- PUT /appointments/{id}/finish-attention → concatena notas
- PUT /appointments/{id}/cancel → 409 sobre COMPLETED
- PUT /appointments/{id}/reschedule → resetea horarios, valida capacidad, 409 sobre CANCELLED/COMPLETED
- Capacidad por sucursal: 4 locks OK, 5to → 409 "capacidad"; intervalo a las 10:15 con [10:00,10:45) lleno → 409
- GET /appointments/{id} expone los nuevos campos
- schedule/day y schedule/month matchean dentistId contra doctorSolicitado/doctorAsignado/doctorId
- Activity logs con todos los action_codes nuevos
- Seed idempotente (no duplica branches ni sobrescribe capacity)
"""
from __future__ import annotations

import os
import re
import subprocess
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://dental-admin-10.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@bossdental.com"
ADMIN_PASSWORD = "admin123"


# ---------------- fixtures ----------------

@pytest.fixture(scope="module")
def admin_headers() -> dict:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['accessToken']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def doctors(admin_headers) -> list[dict]:
    r = requests.get(f"{API}/doctors/active?branchId=1", headers=admin_headers)
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 4
    return items


@pytest.fixture
def patient_id(admin_headers) -> int:
    suffix = uuid.uuid4().hex[:6]
    payload = {
        "name": "TEST",
        "lastName": f"P1_{suffix}",
        "email": f"test_p1_{suffix}@qa.local",
        "phone": "5512345678",
        "gender": "F",
        "birthDate": "1990-05-12",
        "address": "Calle Falsa 123",
        "emergencyContactName": "Mama",
        "emergencyContactPhone": "5599999999",
    }
    r = requests.post(f"{API}/patients", json=payload, headers=admin_headers)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _future_date(days: int = 21) -> str:
    return (datetime.now(timezone.utc).date() + timedelta(days=days)).isoformat()


def _find_free_slot(admin_headers, doctor_id: int, date: str, prefer="10:00") -> str:
    """Busca un slot libre — devuelve 'HH:MM'."""
    r = requests.get(
        f"{API}/appointments/start-slots",
        params={"doctorId": doctor_id, "branchId": 1, "date": date},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    slots = r.json()["slots"]
    assert slots, f"no free slots on {date}"
    full_prefer = f"{prefer}:00"
    if full_prefer in slots:
        return prefer
    return slots[0][:5]


def _lock(admin_headers, doctor_id: int, patient_id: int, date: str, start: str) -> dict:
    r = requests.post(
        f"{API}/appointments/lock",
        json={
            "doctorId": doctor_id, "branchId": 1, "patientId": patient_id,
            "date": date, "startTime": start,
        },
        headers=admin_headers,
    )
    return r


def _confirm(admin_headers, aid: int, patient_id: int, reason="Consulta P1", notes="prev") -> requests.Response:
    return requests.put(
        f"{API}/appointments/{aid}/confirm",
        json={"patientId": patient_id, "reason": reason, "notes": notes},
        headers=admin_headers,
    )


# ============================ Branch capacity ============================

class TestBranchCapacity:
    def test_capacity_per_branch_allows_4_same_slot(self, admin_headers, doctors, patient_id):
        """Boss Dental capacity=4: 4 locks en el MISMO slot+mismo doctor deben permitirse,
        el 5to debe fallar con 409 conteniendo 'capacidad'."""
        date = _future_date(28)
        start = _find_free_slot(admin_headers, doctors[0]["id"], date, prefer="10:00")
        ids = []
        for i in range(4):
            r = _lock(admin_headers, doctors[0]["id"], patient_id, date, start)
            assert r.status_code == 200, f"lock #{i+1} should succeed (cap=4): {r.status_code} {r.text}"
            ids.append(r.json()["appointmentId"])
        # 5to → 409
        r = _lock(admin_headers, doctors[0]["id"], patient_id, date, start)
        assert r.status_code == 409, r.text
        assert "capacidad" in (r.json().get("detail") or "").lower()

    def test_capacity_respects_intervals(self, admin_headers, doctors, patient_id):
        """4 citas CONFIRMED ocupando [10:00,10:45) → 5to lock a las 10:15 → 409."""
        # Offset alto para evitar DB saturada por runs previos
        date = _future_date(1535)
        start = _find_free_slot(admin_headers, doctors[0]["id"], date, prefer="10:00")
        # Crear 4 locks y confirmarlos (la confirmación NO libera capacidad)
        for i in range(4):
            r = _lock(admin_headers, doctors[0]["id"], patient_id, date, start)
            assert r.status_code == 200, f"lock #{i+1}: {r.text}"
            aid = r.json()["appointmentId"]
            rc = _confirm(admin_headers, aid, patient_id)
            assert rc.status_code == 200, rc.text
        # Lock dentro del intervalo (10:15) → la ocupación a las 10:15 ya es 4 → 409
        # Calcular 10:15 (15 min después del start)
        h, m = map(int, start.split(":"))
        m += 15
        if m >= 60: h += 1; m -= 60
        mid = f"{h:02d}:{m:02d}"
        r = _lock(admin_headers, doctors[0]["id"], patient_id, date, mid)
        assert r.status_code == 409, f"esperado 409 por intervalo lleno, got {r.status_code}: {r.text}"
        assert "capacidad" in (r.json().get("detail") or "").lower()


# ============================ Lock payload P1 ============================

class TestLockPayloadP1:
    def test_lock_contains_p1_fields(self, admin_headers, doctors, patient_id):
        date = _future_date(42)
        start = _find_free_slot(admin_headers, doctors[0]["id"], date, prefer="10:00")
        r = _lock(admin_headers, doctors[0]["id"], patient_id, date, start)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "LOCKED"
        assert body["doctorSolicitado"] == doctors[0]["id"]
        # horaProgramada == startTime (siempre HH:MM:SS)
        assert body["horaProgramada"] == body["startTime"]
        assert isinstance(body.get("endSlots"), list) and body["endSlots"]


# ============================ Confirm hereda doctorAsignado ============================

class TestConfirmInheritsDoctor:
    def test_confirm_inherits_doctor_solicitado(self, admin_headers, doctors, patient_id):
        date = _future_date(49)
        start = _find_free_slot(admin_headers, doctors[0]["id"], date)
        r = _lock(admin_headers, doctors[0]["id"], patient_id, date, start)
        aid = r.json()["appointmentId"]
        rc = _confirm(admin_headers, aid, patient_id)
        assert rc.status_code == 200, rc.text
        # leer y comprobar
        r2 = requests.get(f"{API}/appointments/{aid}", headers=admin_headers)
        assert r2.status_code == 200
        a = r2.json()
        assert a["statusCode"] == "CONFIRMED"
        assert a["doctorAsignado"] == doctors[0]["id"]
        assert a["doctorAsignadoName"] == doctors[0]["fullName"]
        assert a["doctorSolicitado"] == doctors[0]["id"]
        # aliases en sync con asignado
        assert a["doctorId"] == doctors[0]["id"]
        assert a["doctorName"] == doctors[0]["fullName"]
        assert a["dentistId"] == doctors[0]["id"]


# ============================ Arrive ============================

class TestArrive:
    def test_arrive_from_confirmed(self, admin_headers, doctors, patient_id):
        date = _future_date(56)
        start = _find_free_slot(admin_headers, doctors[0]["id"], date)
        aid = _lock(admin_headers, doctors[0]["id"], patient_id, date, start).json()["appointmentId"]
        assert _confirm(admin_headers, aid, patient_id).status_code == 200
        r = requests.put(f"{API}/appointments/{aid}/arrive", headers=admin_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["statusCode"] == "ARRIVED"
        assert body["statusName"] in ("Llegó", "Llego")
        assert re.match(r"^\d{2}:\d{2}:\d{2}$", body["horaLlegada"] or "")

    def test_arrive_invalid_state_409(self, admin_headers, doctors, patient_id):
        date = _future_date(63)
        start = _find_free_slot(admin_headers, doctors[0]["id"], date)
        aid = _lock(admin_headers, doctors[0]["id"], patient_id, date, start).json()["appointmentId"]
        # estado LOCKED → no se puede marcar llegada
        r = requests.put(f"{API}/appointments/{aid}/arrive", headers=admin_headers)
        assert r.status_code == 409, r.text


# ============================ Assign doctor ============================

class TestAssignDoctor:
    def test_assign_doctor_keeps_solicitado(self, admin_headers, doctors, patient_id):
        date = _future_date(70)
        start = _find_free_slot(admin_headers, doctors[0]["id"], date)
        # solicitado = doctor[0] (Carlos), asignaremos doctor[1] (María)
        r = _lock(admin_headers, doctors[0]["id"], patient_id, date, start)
        aid = r.json()["appointmentId"]
        assert _confirm(admin_headers, aid, patient_id).status_code == 200

        # localizar a María González (doctor[1])
        new_doctor = next(d for d in doctors if d["name"] == "María" and d["lastName"] == "González")
        r2 = requests.put(
            f"{API}/appointments/{aid}/assign-doctor",
            json={"doctorId": new_doctor["id"]},
            headers=admin_headers,
        )
        assert r2.status_code == 200, r2.text

        # leer detalle
        r3 = requests.get(f"{API}/appointments/{aid}", headers=admin_headers).json()
        assert r3["doctorAsignado"] == new_doctor["id"]
        assert r3["doctorAsignadoName"] == "María González"
        # doctorSolicitado no cambia
        assert r3["doctorSolicitado"] == doctors[0]["id"]
        # aliases en sync con asignado
        assert r3["doctorId"] == new_doctor["id"]
        assert r3["doctorName"] == "María González"

        # activity log APPOINTMENT_DOCTOR_ASSIGNED registrado
        rl = requests.get(f"{API}/patients/{patient_id}/activity-logs", headers=admin_headers)
        assert rl.status_code == 200
        codes = [c.get("actionCode") for c in rl.json()["data"]["content"]]
        assert "APPOINTMENT_DOCTOR_ASSIGNED" in codes

    def test_assign_doctor_on_completed_409(self, admin_headers, doctors, patient_id):
        date = _future_date(77)
        start = _find_free_slot(admin_headers, doctors[0]["id"], date)
        aid = _lock(admin_headers, doctors[0]["id"], patient_id, date, start).json()["appointmentId"]
        assert _confirm(admin_headers, aid, patient_id).status_code == 200
        requests.put(f"{API}/appointments/{aid}/arrive", headers=admin_headers)
        requests.put(f"{API}/appointments/{aid}/start-attention", headers=admin_headers)
        requests.put(f"{API}/appointments/{aid}/finish-attention", json={"notes": "ok"}, headers=admin_headers)
        # ahora COMPLETED
        r = requests.put(f"{API}/appointments/{aid}/assign-doctor", json={"doctorId": doctors[1]["id"]}, headers=admin_headers)
        assert r.status_code == 409, r.text


# ============================ Start / Finish attention ============================

class TestAttention:
    def test_start_attention_from_arrived(self, admin_headers, doctors, patient_id):
        date = _future_date(84)
        start = _find_free_slot(admin_headers, doctors[0]["id"], date)
        aid = _lock(admin_headers, doctors[0]["id"], patient_id, date, start).json()["appointmentId"]
        assert _confirm(admin_headers, aid, patient_id).status_code == 200
        requests.put(f"{API}/appointments/{aid}/arrive", headers=admin_headers)
        r = requests.put(f"{API}/appointments/{aid}/start-attention", headers=admin_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["statusCode"] == "IN_PROGRESS"
        assert re.match(r"^\d{2}:\d{2}:\d{2}$", body["horaInicioReal"] or "")

    def test_start_attention_from_confirmed_inherits_doctor(self, admin_headers, doctors, patient_id):
        date = _future_date(91)
        start = _find_free_slot(admin_headers, doctors[0]["id"], date)
        aid = _lock(admin_headers, doctors[0]["id"], patient_id, date, start).json()["appointmentId"]
        assert _confirm(admin_headers, aid, patient_id).status_code == 200
        # sin marcar llegada
        r = requests.put(f"{API}/appointments/{aid}/start-attention", headers=admin_headers)
        assert r.status_code == 200, r.text
        a = requests.get(f"{API}/appointments/{aid}", headers=admin_headers).json()
        assert a["statusCode"] == "IN_PROGRESS"
        # heredó doctorAsignado del solicitado (confirm ya lo había hecho, pero verificamos consistencia)
        assert a["doctorAsignado"] is not None

    def test_start_attention_locked_409(self, admin_headers, doctors, patient_id):
        date = _future_date(98)
        start = _find_free_slot(admin_headers, doctors[0]["id"], date)
        aid = _lock(admin_headers, doctors[0]["id"], patient_id, date, start).json()["appointmentId"]
        # sigue LOCKED → 409
        r = requests.put(f"{API}/appointments/{aid}/start-attention", headers=admin_headers)
        assert r.status_code == 409, r.text

    def test_finish_attention_concatenates_notes(self, admin_headers, doctors, patient_id):
        date = _future_date(105)
        start = _find_free_slot(admin_headers, doctors[0]["id"], date)
        aid = _lock(admin_headers, doctors[0]["id"], patient_id, date, start).json()["appointmentId"]
        # confirm con notes previas
        rc = requests.put(
            f"{API}/appointments/{aid}/confirm",
            json={"patientId": patient_id, "reason": "Cita P1", "notes": "PREV_NOTE"},
            headers=admin_headers,
        )
        assert rc.status_code == 200
        requests.put(f"{API}/appointments/{aid}/arrive", headers=admin_headers)
        requests.put(f"{API}/appointments/{aid}/start-attention", headers=admin_headers)
        r = requests.put(
            f"{API}/appointments/{aid}/finish-attention",
            json={"notes": "NEW_NOTE"},
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["statusCode"] == "COMPLETED"
        assert re.match(r"^\d{2}:\d{2}:\d{2}$", body["horaFinReal"] or "")
        # notas concatenan previas + nuevas
        assert "PREV_NOTE" in (body.get("notes") or "")
        assert "NEW_NOTE" in (body.get("notes") or "")

    def test_finish_non_in_progress_409(self, admin_headers, doctors, patient_id):
        date = _future_date(112)
        start = _find_free_slot(admin_headers, doctors[0]["id"], date)
        aid = _lock(admin_headers, doctors[0]["id"], patient_id, date, start).json()["appointmentId"]
        # estado LOCKED → finish 409
        r = requests.put(f"{API}/appointments/{aid}/finish-attention", json={"notes": "x"}, headers=admin_headers)
        assert r.status_code == 409


# ============================ Cancel ============================

class TestCancel:
    def test_cancel_confirmed(self, admin_headers, doctors, patient_id):
        date = _future_date(119)
        start = _find_free_slot(admin_headers, doctors[0]["id"], date)
        aid = _lock(admin_headers, doctors[0]["id"], patient_id, date, start).json()["appointmentId"]
        assert _confirm(admin_headers, aid, patient_id).status_code == 200
        r = requests.put(f"{API}/appointments/{aid}/cancel", json={"reason": "No podrá asistir"}, headers=admin_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["statusCode"] == "CANCELLED"
        assert body.get("cancelReason") == "No podrá asistir"

    def test_cancel_completed_409(self, admin_headers, doctors, patient_id):
        date = _future_date(126)
        start = _find_free_slot(admin_headers, doctors[0]["id"], date)
        aid = _lock(admin_headers, doctors[0]["id"], patient_id, date, start).json()["appointmentId"]
        assert _confirm(admin_headers, aid, patient_id).status_code == 200
        requests.put(f"{API}/appointments/{aid}/arrive", headers=admin_headers)
        requests.put(f"{API}/appointments/{aid}/start-attention", headers=admin_headers)
        requests.put(f"{API}/appointments/{aid}/finish-attention", json={"notes": "ok"}, headers=admin_headers)
        r = requests.put(f"{API}/appointments/{aid}/cancel", json={"reason": "x"}, headers=admin_headers)
        assert r.status_code == 409


# ============================ Reschedule ============================

class TestReschedule:
    def test_reschedule_confirmed_resets_real_times(self, admin_headers, doctors, patient_id):
        date = _future_date(133)
        start = _find_free_slot(admin_headers, doctors[0]["id"], date)
        aid = _lock(admin_headers, doctors[0]["id"], patient_id, date, start).json()["appointmentId"]
        assert _confirm(admin_headers, aid, patient_id).status_code == 200
        requests.put(f"{API}/appointments/{aid}/arrive", headers=admin_headers)

        new_date = _future_date(140)
        new_start = _find_free_slot(admin_headers, doctors[0]["id"], new_date)
        new_doctor = next(d for d in doctors if d["name"] == "María")
        r = requests.put(
            f"{API}/appointments/{aid}/reschedule",
            json={"appointmentDate": new_date, "startTime": new_start, "doctorId": new_doctor["id"]},
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text
        a = requests.get(f"{API}/appointments/{aid}", headers=admin_headers).json()
        assert a["statusCode"] == "CONFIRMED"
        assert a["appointmentDate"] == new_date
        assert (a["startTime"] or "").startswith(new_start)
        assert a["doctorSolicitado"] == new_doctor["id"]
        assert a["doctorAsignado"] == new_doctor["id"]
        assert a["doctorName"] == "María González"
        assert a["horaLlegada"] is None
        assert a["horaInicioReal"] is None
        assert a["horaFinReal"] is None

    def test_reschedule_capacity_check(self, admin_headers, doctors, patient_id):
        # Saturar el horario nuevo con 4 confirmadas y luego intentar reagendar otra a ese slot → 409
        # Offset alto para evitar DB saturada por runs previos
        date = _future_date(1547)
        start = _find_free_slot(admin_headers, doctors[0]["id"], date, prefer="11:00")
        # confirmar 4 citas en ese slot
        for _ in range(4):
            aid = _lock(admin_headers, doctors[0]["id"], patient_id, date, start).json()["appointmentId"]
            assert _confirm(admin_headers, aid, patient_id).status_code == 200
        # crear una 5ta cita en OTRO día y confirmarla
        other_date = _future_date(1554)
        other_start = _find_free_slot(admin_headers, doctors[0]["id"], other_date)
        aid2 = _lock(admin_headers, doctors[0]["id"], patient_id, other_date, other_start).json()["appointmentId"]
        assert _confirm(admin_headers, aid2, patient_id).status_code == 200
        # reagendar la 5ta al slot saturado → 409
        r = requests.put(
            f"{API}/appointments/{aid2}/reschedule",
            json={"appointmentDate": date, "startTime": start},
            headers=admin_headers,
        )
        assert r.status_code == 409, r.text

    def test_reschedule_cancelled_409(self, admin_headers, doctors, patient_id):
        date = _future_date(161)
        start = _find_free_slot(admin_headers, doctors[0]["id"], date)
        aid = _lock(admin_headers, doctors[0]["id"], patient_id, date, start).json()["appointmentId"]
        assert _confirm(admin_headers, aid, patient_id).status_code == 200
        requests.put(f"{API}/appointments/{aid}/cancel", json={"reason": "x"}, headers=admin_headers)
        r = requests.put(
            f"{API}/appointments/{aid}/reschedule",
            json={"appointmentDate": _future_date(168), "startTime": "10:00"},
            headers=admin_headers,
        )
        assert r.status_code == 409


# ============================ GET detail expone nuevos campos ============================

class TestAppointmentDetailFields:
    def test_get_appointment_has_p1_fields(self, admin_headers, doctors, patient_id):
        date = _future_date(175)
        start = _find_free_slot(admin_headers, doctors[0]["id"], date)
        aid = _lock(admin_headers, doctors[0]["id"], patient_id, date, start).json()["appointmentId"]
        assert _confirm(admin_headers, aid, patient_id).status_code == 200
        a = requests.get(f"{API}/appointments/{aid}", headers=admin_headers).json()
        for k in ("doctorSolicitado", "doctorSolicitadoName", "doctorAsignado", "doctorAsignadoName",
                  "horaProgramada", "horaLlegada", "horaInicioReal", "horaFinReal",
                  "dentistId", "dentistName", "doctorId", "doctorName"):
            assert k in a, f"missing {k}"
        # dentistId/doctorId == asignado (porque ya está confirmada)
        assert a["doctorId"] == a["doctorAsignado"]
        assert a["dentistId"] == a["doctorAsignado"]


# ============================ schedule/day & month dentistId matchea aliases ============================

class TestScheduleDentistMatch:
    def test_schedule_day_matches_doctor_asignado(self, admin_headers, doctors, patient_id):
        date = _future_date(182)
        start = _find_free_slot(admin_headers, doctors[0]["id"], date)
        aid = _lock(admin_headers, doctors[0]["id"], patient_id, date, start).json()["appointmentId"]
        assert _confirm(admin_headers, aid, patient_id).status_code == 200
        # reasignar a María
        maria = next(d for d in doctors if d["name"] == "María")
        requests.put(f"{API}/appointments/{aid}/assign-doctor", json={"doctorId": maria["id"]}, headers=admin_headers)
        # filtrar schedule/day por dentistId=María.id → debe traer la cita (doctorAsignado=maria)
        r = requests.get(
            f"{API}/appointments/schedule/day",
            params={"date": date, "branchId": 1, "dentistId": maria["id"]},
            headers=admin_headers,
        )
        assert r.status_code == 200
        ids = [x.get("id") for x in r.json()]
        assert aid in ids, "schedule/day no matcheó por doctorAsignado"
        # filtrar por doctorSolicitado=Carlos también debe traerla
        r2 = requests.get(
            f"{API}/appointments/schedule/day",
            params={"date": date, "branchId": 1, "dentistId": doctors[0]["id"]},
            headers=admin_headers,
        )
        assert r2.status_code == 200
        ids2 = [x.get("id") for x in r2.json()]
        assert aid in ids2, "schedule/day no matcheó por doctorSolicitado"


# ============================ Activity logs codes ============================

class TestActivityLogsCodes:
    def test_full_lifecycle_logs(self, admin_headers, doctors, patient_id):
        date = _future_date(189)
        start = _find_free_slot(admin_headers, doctors[0]["id"], date)
        aid = _lock(admin_headers, doctors[0]["id"], patient_id, date, start).json()["appointmentId"]
        assert _confirm(admin_headers, aid, patient_id).status_code == 200
        requests.put(f"{API}/appointments/{aid}/arrive", headers=admin_headers)
        maria = next(d for d in doctors if d["name"] == "María")
        requests.put(f"{API}/appointments/{aid}/assign-doctor", json={"doctorId": maria["id"]}, headers=admin_headers)
        requests.put(f"{API}/appointments/{aid}/start-attention", headers=admin_headers)
        requests.put(f"{API}/appointments/{aid}/finish-attention", json={"notes": "ok"}, headers=admin_headers)

        r = requests.get(f"{API}/patients/{patient_id}/activity-logs", params={"size": 50}, headers=admin_headers)
        assert r.status_code == 200
        codes = [c.get("actionCode") for c in r.json()["data"]["content"]]
        for required in ("APPOINTMENT_CREATED", "APPOINTMENT_ARRIVED",
                         "APPOINTMENT_DOCTOR_ASSIGNED", "APPOINTMENT_STARTED",
                         "APPOINTMENT_COMPLETED"):
            assert required in codes, f"missing log {required} in {codes}"

    def test_cancel_and_reschedule_logs(self, admin_headers, doctors, patient_id):
        # cancel log
        date = _future_date(196)
        start = _find_free_slot(admin_headers, doctors[0]["id"], date)
        aid = _lock(admin_headers, doctors[0]["id"], patient_id, date, start).json()["appointmentId"]
        assert _confirm(admin_headers, aid, patient_id).status_code == 200
        requests.put(f"{API}/appointments/{aid}/cancel", json={"reason": "x"}, headers=admin_headers)

        # reschedule log on another appt
        date2 = _future_date(203)
        start2 = _find_free_slot(admin_headers, doctors[0]["id"], date2)
        aid2 = _lock(admin_headers, doctors[0]["id"], patient_id, date2, start2).json()["appointmentId"]
        assert _confirm(admin_headers, aid2, patient_id).status_code == 200
        new_date = _future_date(210)
        new_start = _find_free_slot(admin_headers, doctors[0]["id"], new_date)
        requests.put(
            f"{API}/appointments/{aid2}/reschedule",
            json={"appointmentDate": new_date, "startTime": new_start},
            headers=admin_headers,
        )

        r = requests.get(f"{API}/patients/{patient_id}/activity-logs", params={"size": 50}, headers=admin_headers)
        assert r.status_code == 200
        codes = [c.get("actionCode") for c in r.json()["data"]["content"]]
        assert "APPOINTMENT_CANCELLED" in codes
        assert "APPOINTMENT_RESCHEDULED" in codes


# ============================ Seed idempotency ============================

class TestSeedIdempotencyP1:
    def test_seed_twice_no_dup_no_overwrite_capacity(self, admin_headers):
        # capacity actual antes
        r1 = requests.get(f"{API}/branches", headers=admin_headers)
        before_branches = r1.json()
        b1 = next(b for b in before_branches if b["id"] == 1)
        cap_before = b1.get("capacity")
        assert cap_before == 4, f"capacity esperada=4, got {cap_before}"

        # 2 corridas seguidas
        for _ in range(2):
            result = subprocess.run(
                ["python", "/app/backend/seed.py"],
                capture_output=True, text=True, cwd="/app/backend",
            )
            assert result.returncode == 0, result.stderr

        r2 = requests.get(f"{API}/branches", headers=admin_headers)
        after = r2.json()
        # mismo número de branches
        assert len(after) == len(before_branches)
        b1_after = next(b for b in after if b["id"] == 1)
        # capacity sigue siendo 4 (no se sobrescribió)
        assert b1_after.get("capacity") == 4
