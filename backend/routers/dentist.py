"""Dentist — vistas operativas del rol DENTIST.

Todos los endpoints requieren rol DENTIST con `doctorId` ligado a un Doctor.

GET /dentist/me                         → { user, doctor }
GET /dentist/stats?date=YYYY-MM-DD      → KPIs operativos
GET /dentist/today?date=YYYY-MM-DD      → mis citas del día (no LOCKED, no CANCELLED)
GET /dentist/waiting-room?date=         → pacientes en sala de espera (ARRIVED) en mi sucursal
GET /dentist/in-progress                → en atención (IN_PROGRESS) asignados a mí
GET /dentist/completed-today?date=      → completadas hoy por mí
GET /dentist/agenda?from=&to=           → mis citas en rango
GET /dentist/patients?page=&size=&query → pacientes únicos asignados a mí
GET /dentist/activity?page=&size=       → bitácora limitada a MIS citas
"""
import re
from datetime import datetime, timezone
from typing import Any, Optional
from fastapi import APIRouter, Depends, Query

from core.db import db
from core.deps import current_dentist

router = APIRouter(prefix="/dentist", tags=["dentist"])


# ---------------- helpers ----------------

def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _doctor_match(doctor_id: int) -> dict:
    """Match: doctor asignado=me OR (asignado=null AND solicitado=me)."""
    return {
        "$or": [
            {"doctorAsignado": doctor_id},
            {"$and": [{"doctorAsignado": None}, {"doctorSolicitado": doctor_id}]},
        ]
    }


def _doctor_match_strict(doctor_id: int) -> dict:
    """Match: doctorAsignado=me (sin fallback al solicitado)."""
    return {"doctorAsignado": doctor_id}


def _serialize_appt(a: dict, patient: dict | None = None) -> dict:
    start = (a.get("startTime") or "")[:8]
    end = (a.get("endTime") or "")[:8]
    return {
        "appointmentId": a["id"],
        "id": a["id"],
        "appointmentDate": a.get("appointmentDate"),
        "date": a.get("appointmentDate"),
        "startTime": a.get("startTime"),
        "endTime": a.get("endTime"),
        "time": start[:5],
        "patientId": a.get("patientId"),
        "patientName": f"{(patient or {}).get('name', '')} {(patient or {}).get('lastName', '')}".strip() or "—",
        "patientPhone": (patient or {}).get("phone"),
        "patientExpedient": (patient or {}).get("expedientNumber"),
        "reason": a.get("reason") or "—",
        "branchId": a.get("branchId"),
        "branchName": a.get("branchName"),
        "doctorSolicitado": a.get("doctorSolicitado"),
        "doctorSolicitadoName": a.get("doctorSolicitadoName"),
        "doctorAsignado": a.get("doctorAsignado"),
        "doctorAsignadoName": a.get("doctorAsignadoName"),
        "doctorId": a.get("doctorAsignado") or a.get("doctorSolicitado") or a.get("doctorId"),
        "doctorName": a.get("doctorAsignadoName") or a.get("doctorSolicitadoName") or a.get("doctorName"),
        "statusCode": a.get("statusCode"),
        "statusName": a.get("statusName"),
        "statusColor": a.get("statusColor"),
        "horaProgramada": a.get("horaProgramada") or a.get("startTime"),
        "horaLlegada": a.get("horaLlegada"),
        "horaInicioReal": a.get("horaInicioReal"),
        "horaFinReal": a.get("horaFinReal"),
        "notes": a.get("notes"),
    }


async def _hydrate(items: list[dict]) -> list[dict]:
    """Adjunta info de paciente a cada cita en una sola pasada."""
    if not items:
        return []
    patient_ids = {a.get("patientId") for a in items if a.get("patientId") is not None}
    patients = {}
    async for p in db.patients.find({"id": {"$in": list(patient_ids)}}, {"_id": 0}):
        patients[p["id"]] = p
    return [_serialize_appt(a, patients.get(a.get("patientId"))) for a in items]


# ---------------- endpoints ----------------

@router.get("/me")
async def dentist_me(ctx = Depends(current_dentist)):
    user, doctor = ctx
    full_name = doctor.get("fullName") or f"{doctor.get('name', '')} {doctor.get('lastName', '')}".strip()
    return {
        "user": {
            "id": user["id"],
            "email": user.get("email"),
            "name": user.get("name"),
            "lastName": user.get("lastName"),
        },
        "doctor": {
            "id": doctor["id"],
            "name": doctor.get("name"),
            "lastName": doctor.get("lastName"),
            "fullName": full_name,
            "specialty": doctor.get("specialty"),
            "branches": doctor.get("branches", []),
        },
    }


@router.get("/stats")
async def dentist_stats(date: str | None = None, ctx = Depends(current_dentist)):
    _, doctor = ctx
    did = doctor["id"]
    branch_ids = doctor.get("branches", [])
    d = date or _today()

    today_q = {**_doctor_match(did), "appointmentDate": d, "statusCode": {"$nin": ["LOCKED", "CANCELLED"]}}
    today_count = await db.appointments.count_documents(today_q)

    waiting_q = {"appointmentDate": d, "statusCode": "ARRIVED", "branchId": {"$in": branch_ids or [None]}}
    waiting_count = await db.appointments.count_documents(waiting_q)

    in_progress_q = {**_doctor_match_strict(did), "statusCode": "IN_PROGRESS"}
    in_progress_count = await db.appointments.count_documents(in_progress_q)

    completed_q = {**_doctor_match_strict(did), "appointmentDate": d, "statusCode": {"$in": ["COMPLETED", "ATTENDED"]}}
    completed_count = await db.appointments.count_documents(completed_q)

    # Pacientes asignados (alguna vez) → distinct
    distinct_patients = await db.appointments.distinct("patientId", _doctor_match_strict(did))
    patient_count = len([p for p in distinct_patients if p is not None])

    upcoming_q = {**_doctor_match(did), "appointmentDate": {"$gt": d}, "statusCode": {"$nin": ["LOCKED", "CANCELLED"]}}
    upcoming_count = await db.appointments.count_documents(upcoming_q)

    return {
        "date": d,
        "todayCount": today_count,
        "waitingCount": waiting_count,
        "inProgressCount": in_progress_count,
        "completedTodayCount": completed_count,
        "assignedPatientsCount": patient_count,
        "upcomingCount": upcoming_count,
    }


@router.get("/today")
async def dentist_today(date: str | None = None, ctx = Depends(current_dentist)):
    _, doctor = ctx
    d = date or _today()
    q = {**_doctor_match(doctor["id"]), "appointmentDate": d, "statusCode": {"$nin": ["LOCKED", "CANCELLED"]}}
    items = [a async for a in db.appointments.find(q, {"_id": 0}).sort([("startTime", 1)])]
    return await _hydrate(items)


@router.get("/waiting-room")
async def dentist_waiting_room(date: str | None = None, ctx = Depends(current_dentist)):
    """Pacientes ARRIVED en mi sucursal (sin importar asignación; el dentista decide)."""
    _, doctor = ctx
    d = date or _today()
    branch_ids = doctor.get("branches", []) or [1]
    q = {"appointmentDate": d, "statusCode": "ARRIVED", "branchId": {"$in": branch_ids}}
    items = [a async for a in db.appointments.find(q, {"_id": 0}).sort([("horaLlegada", 1), ("startTime", 1)])]
    return await _hydrate(items)


@router.get("/in-progress")
async def dentist_in_progress(ctx = Depends(current_dentist)):
    _, doctor = ctx
    q = {**_doctor_match_strict(doctor["id"]), "statusCode": "IN_PROGRESS"}
    items = [a async for a in db.appointments.find(q, {"_id": 0}).sort([("horaInicioReal", 1)])]
    return await _hydrate(items)


@router.get("/completed-today")
async def dentist_completed_today(date: str | None = None, ctx = Depends(current_dentist)):
    _, doctor = ctx
    d = date or _today()
    q = {**_doctor_match_strict(doctor["id"]), "appointmentDate": d, "statusCode": {"$in": ["COMPLETED", "ATTENDED"]}}
    items = [a async for a in db.appointments.find(q, {"_id": 0}).sort([("horaFinReal", -1), ("startTime", -1)])]
    return await _hydrate(items)


@router.get("/agenda")
async def dentist_agenda(
    date: str | None = None,
    fromDate: str | None = Query(None, alias="from"),
    toDate: str | None = Query(None, alias="to"),
    ctx = Depends(current_dentist),
):
    """Si se pasa `date`, devuelve sólo ese día. Si se pasan `from` y `to`, rango inclusivo.
    Si nada, devuelve hoy + 7 días siguientes (próximas)."""
    _, doctor = ctx
    if date:
        date_q: Any = date
    elif fromDate and toDate:
        date_q = {"$gte": fromDate, "$lte": toDate}
    elif fromDate:
        date_q = {"$gte": fromDate}
    elif toDate:
        date_q = {"$lte": toDate}
    else:
        date_q = {"$gte": _today()}
    q = {**_doctor_match(doctor["id"]), "appointmentDate": date_q, "statusCode": {"$nin": ["LOCKED"]}}
    items = [a async for a in db.appointments.find(q, {"_id": 0}).sort([("appointmentDate", 1), ("startTime", 1)]).limit(200)]
    return await _hydrate(items)


@router.get("/patients")
async def dentist_patients(
    page: int = Query(0, ge=0),
    size: int = Query(20, ge=1, le=100),
    query: str = "",
    ctx = Depends(current_dentist),
):
    """Pacientes únicos atendidos o asignados (doctorAsignado=me) por este dentista."""
    _, doctor = ctx
    patient_ids = await db.appointments.distinct("patientId", _doctor_match_strict(doctor["id"]))
    patient_ids = [p for p in patient_ids if p is not None]
    if not patient_ids:
        return {"content": [], "page": page, "size": size, "totalElements": 0, "totalPages": 0}
    q: dict[str, Any] = {"id": {"$in": patient_ids}}
    if query and query.strip():
        rx = {"$regex": re.escape(query.strip()), "$options": "i"}
        q["$or"] = [{"name": rx}, {"lastName": rx}, {"expedientNumber": rx}, {"phone": rx}, {"email": rx}]
    total = await db.patients.count_documents(q)
    cursor = db.patients.find(q, {"_id": 0}).sort("createdAt", -1).skip(page * size).limit(size)
    items = []
    async for p in cursor:
        full = f"{p.get('name', '')} {p.get('lastName', '')}".strip()
        last_completed = await db.appointments.find_one(
            {"patientId": p["id"], **_doctor_match_strict(doctor["id"]), "statusCode": {"$in": ["COMPLETED", "ATTENDED"]}},
            {"_id": 0, "appointmentDate": 1, "horaFinReal": 1},
            sort=[("appointmentDate", -1)],
        )
        next_scheduled = await db.appointments.find_one(
            {"patientId": p["id"], **_doctor_match(doctor["id"]), "statusCode": "CONFIRMED", "appointmentDate": {"$gte": _today()}},
            {"_id": 0, "appointmentDate": 1, "startTime": 1},
            sort=[("appointmentDate", 1), ("startTime", 1)],
        )
        items.append({
            "id": p["id"],
            "expedientNumber": p.get("expedientNumber"),
            "fullName": full,
            "phone": p.get("phone"),
            "email": p.get("email"),
            "photoUrl": p.get("photoUrl"),
            "active": p.get("active", True),
            "lastVisit": (last_completed or {}).get("appointmentDate"),
            "nextAppointmentDate": (next_scheduled or {}).get("appointmentDate"),
            "nextAppointmentTime": ((next_scheduled or {}).get("startTime") or "")[:5] or None,
        })
    total_pages = (total + size - 1) // size if total else 0
    return {"content": items, "page": page, "size": size, "totalElements": total, "totalPages": total_pages}


@router.get("/activity")
async def dentist_activity(
    page: int = Query(0, ge=0),
    size: int = Query(20, ge=1, le=100),
    ctx = Depends(current_dentist),
):
    """Bitácora limitada a las citas donde participo (doctorAsignado=me o solicitado=me)."""
    _, doctor = ctx
    did = doctor["id"]
    # citas vinculadas a mí (alguna vez)
    appt_ids = await db.appointments.distinct("id", _doctor_match(did))
    if not appt_ids:
        return {"data": {"content": [], "page": page, "size": size, "totalElements": 0, "totalPages": 0}, "message": "Sin actividad", "success": True}
    q = {"entityType": "APPOINTMENT", "entityId": {"$in": appt_ids}}
    total = await db.activity_logs.count_documents(q)
    cursor = db.activity_logs.find(q, {"_id": 0}).sort("createdAt", -1).skip(page * size).limit(size)
    content = [doc async for doc in cursor]
    total_pages = (total + size - 1) // size if total else 0
    return {
        "data": {"content": content, "page": page, "size": size, "totalElements": total, "totalPages": total_pages},
        "message": "Actividad obtenida correctamente",
        "success": True,
    }
