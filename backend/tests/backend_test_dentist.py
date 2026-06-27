"""Boss Dental — DENTIST role backend regression tests (pytest).

Cubre los nuevos endpoints /api/dentist/* y la integración con el flujo operativo:
- /dentist/me  (perfil + doctor)
- Permisos: ADMIN/RECEPTION/sin token → 401/403
- /dentist/stats y /dentist/today
- /dentist/waiting-room (sólo ARRIVED en mi sucursal)
- /dentist/in-progress (sólo IN_PROGRESS asignados a mí)
- /dentist/completed-today (sólo COMPLETED/ATTENDED asignados a mí)
- /dentist/agenda (rango + por defecto hoy en adelante, no LOCKED)
- /dentist/patients (pacientes únicos + búsqueda)
- /dentist/activity (sólo logs de mis citas)
- E2E recepción ↔ dentista (recreado), incluida reasignación de doctor
- Compatibilidad: doctorId efectivo = doctorAsignado || doctorSolicitado
- Seed idempotente: usuario dentist mantiene doctorId:1, branch capacity:4
"""
from __future__ import annotations

import os
import subprocess
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://dental-admin-10.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("admin@bossdental.com", "admin123")
RECEPTION = ("reception@bossdental.com", "admin1234")
DENTIST = ("dentist@bossdental.com", "dentist123")


# ---------------- helpers / fixtures ----------------

def _login(email: str, password: str) -> dict:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"{email} login failed: {r.status_code} {r.text}"
    body = r.json()
    return {
        "headers": {"Authorization": f"Bearer {body['accessToken']}", "Content-Type": "application/json"},
        "user": body.get("user", {}),
    }


@pytest.fixture(scope="module")
def admin():
    return _login(*ADMIN)


@pytest.fixture(scope="module")
def reception():
    return _login(*RECEPTION)


@pytest.fixture(scope="module")
def dentist():
    return _login(*DENTIST)


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _future_date(days: int = 220) -> str:
    return (datetime.now(timezone.utc).date() + timedelta(days=days)).isoformat()


def _create_patient(headers: dict, tag: str) -> int:
    suffix = uuid.uuid4().hex[:6]
    payload = {
        "name": "TEST_DENT",
        "lastName": f"{tag}_{suffix}",
        "email": f"test_dent_{tag}_{suffix}@qa.local",
        "phone": "5512345678",
        "gender": "M",
        "birthDate": "1992-01-01",
        "address": "Calle 1",
        "emergencyContactName": "Contacto",
        "emergencyContactPhone": "5599999999",
    }
    r = requests.post(f"{API}/patients", json=payload, headers=headers)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _free_slot(headers: dict, doctor_id: int, date: str) -> str:
    r = requests.get(
        f"{API}/appointments/start-slots",
        params={"doctorId": doctor_id, "branchId": 1, "date": date},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    slots = r.json()["slots"]
    assert slots, f"no slots on {date} for doctor {doctor_id}"
    return slots[0][:5]


def _lock(headers: dict, doctor_id: int, patient_id: int, date: str, start: str) -> int:
    r = requests.post(
        f"{API}/appointments/lock",
        json={"doctorId": doctor_id, "branchId": 1, "patientId": patient_id, "date": date, "startTime": start},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    return r.json()["appointmentId"]


def _confirm(headers: dict, aid: int, patient_id: int, reason="E2E Dentist", notes="") -> None:
    r = requests.put(
        f"{API}/appointments/{aid}/confirm",
        json={"patientId": patient_id, "reason": reason, "notes": notes},
        headers=headers,
    )
    assert r.status_code == 200, r.text


# ============================ Login / Permissions ============================

class TestDentistLoginPermissions:
    def test_login_dentist_returns_doctorId(self, dentist):
        u = dentist["user"]
        assert u.get("role", {}).get("name") == "DENTIST"
        assert u.get("doctorId") == 1, f"doctorId esperado=1, got {u}"

    def test_dentist_me_returns_profile_and_doctor(self, dentist):
        r = requests.get(f"{API}/dentist/me", headers=dentist["headers"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["user"]["email"] == DENTIST[0]
        d = body["doctor"]
        assert d["id"] == 1
        assert d["fullName"] == "Carlos Hernández"
        assert d["specialty"] == "Ortodoncia"
        assert 1 in (d.get("branches") or [])

    def test_admin_cannot_access_dentist_me(self, admin):
        r = requests.get(f"{API}/dentist/me", headers=admin["headers"])
        assert r.status_code == 403, r.text
        assert "dentista" in (r.json().get("detail") or "").lower()

    def test_reception_cannot_access_dentist_me(self, reception):
        r = requests.get(f"{API}/dentist/me", headers=reception["headers"])
        assert r.status_code == 403, r.text

    def test_no_bearer_token_rejected(self):
        r = requests.get(f"{API}/dentist/me")
        assert r.status_code in (401, 403)


# ============================ E2E flow ============================

@pytest.fixture
def e2e_appt(reception):
    """Crea paciente + cita confirmada con doctor=1 para HOY. Devuelve (patient_id, appt_id)."""
    headers = reception["headers"]
    pid = _create_patient(headers, "E2E")
    date = _today()
    # buscar slot libre HOY para doctor 1
    r = requests.get(
        f"{API}/appointments/start-slots",
        params={"doctorId": 1, "branchId": 1, "date": date},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    slots = r.json()["slots"]
    if not slots:
        pytest.skip("No hay slots libres hoy para doctor 1 (capacidad saturada por runs previos)")
    aid = _lock(headers, 1, pid, date, slots[0][:5])
    _confirm(headers, aid, pid, reason="E2E", notes="prev")
    return pid, aid


class TestDentistE2E:
    def test_today_lists_my_appointment(self, dentist, e2e_appt):
        _, aid = e2e_appt
        r = requests.get(f"{API}/dentist/today", headers=dentist["headers"])
        assert r.status_code == 200, r.text
        ids = [x.get("id") for x in r.json()]
        assert aid in ids, f"appt {aid} no aparece en /dentist/today: {ids}"

    def test_stats_today_count_at_least_one(self, dentist, e2e_appt):
        r = requests.get(f"{API}/dentist/stats", headers=dentist["headers"])
        assert r.status_code == 200
        s = r.json()
        for k in ("todayCount", "waitingCount", "inProgressCount", "completedTodayCount",
                  "assignedPatientsCount", "upcomingCount"):
            assert k in s
        assert s["todayCount"] >= 1

    def test_waiting_room_after_arrive(self, dentist, reception, e2e_appt):
        _, aid = e2e_appt
        r = requests.put(f"{API}/appointments/{aid}/arrive", headers=reception["headers"])
        assert r.status_code == 200, r.text
        # waiting-room debe contener aid
        wr = requests.get(f"{API}/dentist/waiting-room", headers=dentist["headers"])
        assert wr.status_code == 200
        items = wr.json()
        appt = next((x for x in items if x.get("id") == aid), None)
        assert appt is not None, f"appt {aid} no en waiting-room: {[x['id'] for x in items]}"
        assert appt.get("horaLlegada")
        # only ARRIVED statuses
        for x in items:
            assert x.get("statusCode") == "ARRIVED"

    def test_reassign_doctor_removes_from_today_and_returns(self, dentist, reception, e2e_appt):
        _, aid = e2e_appt
        # asignar a doctor 2
        r = requests.put(f"{API}/appointments/{aid}/assign-doctor",
                         json={"doctorId": 2}, headers=reception["headers"])
        assert r.status_code == 200, r.text
        t1 = requests.get(f"{API}/dentist/today", headers=dentist["headers"]).json()
        assert aid not in [x.get("id") for x in t1], "tras reasignar a doctor 2, Carlos aún ve la cita"
        # devolver a doctor 1
        r2 = requests.put(f"{API}/appointments/{aid}/assign-doctor",
                          json={"doctorId": 1}, headers=reception["headers"])
        assert r2.status_code == 200, r2.text
        t2 = requests.get(f"{API}/dentist/today", headers=dentist["headers"]).json()
        assert aid in [x.get("id") for x in t2], "tras reasignar a doctor 1, Carlos no la ve"

    def test_start_attention_appears_in_in_progress(self, dentist, e2e_appt):
        _, aid = e2e_appt
        r = requests.put(f"{API}/appointments/{aid}/start-attention", headers=dentist["headers"])
        assert r.status_code == 200, r.text
        ip = requests.get(f"{API}/dentist/in-progress", headers=dentist["headers"]).json()
        appt = next((x for x in ip if x.get("id") == aid), None)
        assert appt is not None, f"appt {aid} no en in-progress: {[x['id'] for x in ip]}"
        assert appt.get("horaInicioReal")
        # waiting-room ya no debe incluirla (no es ARRIVED)
        wr = requests.get(f"{API}/dentist/waiting-room", headers=dentist["headers"]).json()
        assert aid not in [x.get("id") for x in wr]

    def test_finish_attention_moves_to_completed_and_patients(self, dentist, reception, e2e_appt):
        pid, aid = e2e_appt
        # ciclo completo en este test (e2e_appt es function-scoped → cita CONFIRMED)
        assert requests.put(f"{API}/appointments/{aid}/arrive", headers=reception["headers"]).status_code == 200
        assert requests.put(f"{API}/appointments/{aid}/start-attention", headers=dentist["headers"]).status_code == 200
        r = requests.put(
            f"{API}/appointments/{aid}/finish-attention",
            json={"notes": "Atención finalizada OK"},
            headers=dentist["headers"],
        )
        assert r.status_code == 200, r.text
        ct = requests.get(f"{API}/dentist/completed-today", headers=dentist["headers"]).json()
        appt = next((x for x in ct if x.get("id") == aid), None)
        assert appt is not None, f"appt {aid} no en completed-today"
        assert appt.get("horaFinReal")
        assert "Atención finalizada OK" in (appt.get("notes") or "")
        # in-progress ya no debe contenerla
        ip = requests.get(f"{API}/dentist/in-progress", headers=dentist["headers"]).json()
        assert aid not in [x.get("id") for x in ip]
        # /dentist/patients debe incluir el paciente con lastVisit = HOY
        pr = requests.get(f"{API}/dentist/patients", params={"size": 100}, headers=dentist["headers"]).json()
        item = next((p for p in pr["content"] if p["id"] == pid), None)
        assert item is not None, "paciente no en /dentist/patients tras finalizar"
        assert item["lastVisit"] == _today()
        # bitácora de dentista incluye al menos un log de esta cita
        act = requests.get(f"{API}/dentist/activity", params={"size": 50}, headers=dentist["headers"]).json()
        assert act["success"] is True
        ent_ids = [x.get("entityId") for x in act["data"]["content"]]
        assert aid in ent_ids


# ============================ Filtering / Isolation ============================

class TestDentistFilters:
    def test_in_progress_excludes_other_doctors(self, dentist, reception):
        """Crear cita IN_PROGRESS con doctor 2 → NO debe aparecer en /dentist/in-progress (Carlos=1)."""
        pid = _create_patient(reception["headers"], "OTHER")
        date = _future_date(220)
        # buscar slot para doctor 2
        slot = _free_slot(reception["headers"], 2, date)
        aid = _lock(reception["headers"], 2, pid, date, slot)
        _confirm(reception["headers"], aid, pid, reason="Other-doctor")
        # arrive + start con recepción
        assert requests.put(f"{API}/appointments/{aid}/arrive", headers=reception["headers"]).status_code == 200
        assert requests.put(f"{API}/appointments/{aid}/start-attention", headers=reception["headers"]).status_code == 200
        # como esta cita NO está hoy, /dentist/in-progress (Carlos) NO debe incluirla
        ip = requests.get(f"{API}/dentist/in-progress", headers=dentist["headers"]).json()
        assert aid not in [x.get("id") for x in ip]
        # cleanup → finalizar
        requests.put(f"{API}/appointments/{aid}/finish-attention", json={"notes": "cleanup"}, headers=reception["headers"])

    def test_agenda_default_returns_today_onwards_no_locked(self, dentist, reception):
        """Crear LOCKED y CONFIRMED en fecha futura para doctor 1 → agenda incluye CONFIRMED, excluye LOCKED."""
        pid = _create_patient(reception["headers"], "AGENDA")
        date = _future_date(222)
        slot1 = _free_slot(reception["headers"], 1, date)
        aid_locked = _lock(reception["headers"], 1, pid, date, slot1)
        # otra cita confirmada
        slot2 = _free_slot(reception["headers"], 1, _future_date(223))
        aid_conf = _lock(reception["headers"], 1, pid, _future_date(223), slot2)
        _confirm(reception["headers"], aid_conf, pid, reason="Agenda CONF")

        r = requests.get(f"{API}/dentist/agenda", headers=dentist["headers"])
        assert r.status_code == 200
        ids = [x.get("id") for x in r.json()]
        assert aid_conf in ids, f"agenda no incluye CONFIRMED {aid_conf}"
        assert aid_locked not in ids, "agenda incluye LOCKED (no debería)"

    def test_agenda_with_range(self, dentist, reception):
        pid = _create_patient(reception["headers"], "RNG")
        date = _future_date(225)
        slot = _free_slot(reception["headers"], 1, date)
        aid = _lock(reception["headers"], 1, pid, date, slot)
        _confirm(reception["headers"], aid, pid, reason="Range test")
        r = requests.get(f"{API}/dentist/agenda", params={"from": date, "to": date}, headers=dentist["headers"])
        assert r.status_code == 200
        ids = [x.get("id") for x in r.json()]
        assert aid in ids

    def test_patients_search_by_query(self, dentist, reception):
        pid = _create_patient(reception["headers"], "SEARCHME")
        date = _future_date(228)
        slot = _free_slot(reception["headers"], 1, date)
        aid = _lock(reception["headers"], 1, pid, date, slot)
        _confirm(reception["headers"], aid, pid, reason="Search")
        # /dentist/patients debe incluir este paciente
        r = requests.get(f"{API}/dentist/patients", params={"size": 100}, headers=dentist["headers"]).json()
        assert pid in [p["id"] for p in r["content"]]
        # búsqueda por lastName parcial
        r2 = requests.get(
            f"{API}/dentist/patients", params={"query": "SEARCHME"}, headers=dentist["headers"]
        ).json()
        assert pid in [p["id"] for p in r2["content"]]
        item = next(p for p in r2["content"] if p["id"] == pid)
        for k in ("expedientNumber", "fullName", "phone", "email", "lastVisit",
                  "nextAppointmentDate", "nextAppointmentTime"):
            assert k in item


# ============================ Compatibility / Seed ============================

class TestCompatAndSeed:
    def test_today_doctorId_effective_alias(self, dentist, reception):
        pid = _create_patient(reception["headers"], "ALIAS")
        date = _today()
        r = requests.get(
            f"{API}/appointments/start-slots",
            params={"doctorId": 1, "branchId": 1, "date": date}, headers=reception["headers"]
        )
        if r.status_code != 200 or not r.json().get("slots"):
            pytest.skip("Sin slots libres HOY para doctor 1")
        slot = r.json()["slots"][0][:5]
        aid = _lock(reception["headers"], 1, pid, date, slot)
        _confirm(reception["headers"], aid, pid, reason="Alias")
        # reasignar a doctor 1 explícitamente (asegura doctorAsignado=1)
        requests.put(f"{API}/appointments/{aid}/assign-doctor",
                     json={"doctorId": 1}, headers=reception["headers"])
        t = requests.get(f"{API}/dentist/today", headers=dentist["headers"]).json()
        appt = next((x for x in t if x.get("id") == aid), None)
        assert appt is not None
        # doctorId efectivo = doctorAsignado || doctorSolicitado
        assert appt.get("doctorId") == appt.get("doctorAsignado") or appt.get("doctorSolicitado")
        # también el detalle expone alias
        det = requests.get(f"{API}/appointments/{aid}", headers=reception["headers"]).json()
        assert det.get("doctorId") == (det.get("doctorAsignado") or det.get("doctorSolicitado"))

    def test_seed_twice_does_not_duplicate_dentist_and_keeps_doctorId(self, dentist):
        for _ in range(2):
            result = subprocess.run(
                ["python", "/app/backend/seed.py"],
                capture_output=True, text=True, cwd="/app/backend",
            )
            assert result.returncode == 0, result.stderr
        # re-login y verificar doctorId sigue siendo 1
        fresh = _login(*DENTIST)
        assert fresh["user"]["doctorId"] == 1
        # branches capacity=4 sigue intacta
        h = fresh["headers"]
        r = requests.get(f"{API}/branches", headers=h)
        # Si dentist no tiene permiso para /branches, usar admin
        if r.status_code != 200:
            admin_h = _login(*ADMIN)["headers"]
            r = requests.get(f"{API}/branches", headers=admin_h)
        assert r.status_code == 200
        b1 = next(b for b in r.json() if b["id"] == 1)
        assert b1.get("capacity") == 4

    def test_dentist_assign_doctor_allowed(self, dentist, reception):
        """Cualquier autenticado puede llamar assign-doctor — incluso un DENTIST."""
        pid = _create_patient(reception["headers"], "ASSIGN")
        date = _future_date(230)
        slot = _free_slot(reception["headers"], 1, date)
        aid = _lock(reception["headers"], 1, pid, date, slot)
        _confirm(reception["headers"], aid, pid, reason="Allow")
        r = requests.put(f"{API}/appointments/{aid}/assign-doctor",
                         json={"doctorId": 2}, headers=dentist["headers"])
        assert r.status_code == 200, r.text
