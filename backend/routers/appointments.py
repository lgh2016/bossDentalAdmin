"""Appointments — Boss Dental.

Modelo operativo P1:
  Estados:
    LOCKED      → reserva temporal (lockedUntil), no visible en agenda pública
    CONFIRMED   → programada
    ARRIVED     → paciente llegó (horaLlegada)
    IN_PROGRESS → en atención (horaInicioReal)
    COMPLETED   → atendida (horaFinReal). Alias: ATTENDED para compat.
    CANCELLED   → cancelada

  Campos de tracking:
    doctorSolicitado / doctorSolicitadoName     → quien pidió la recepción
    doctorAsignado   / doctorAsignadoName       → quien efectivamente atiende (puede cambiar)
    doctorId / doctorName                       → ALIAS = doctorAsignado || doctorSolicitado (compat frontend)
    horaProgramada (HH:MM:SS)                   → ALIAS de startTime
    horaLlegada    (HH:MM:SS)                   → set al /arrive
    horaInicioReal (HH:MM:SS)                   → set al /start-attention
    horaFinReal    (HH:MM:SS)                   → set al /finish-attention

  Capacidad de agenda: POR SUCURSAL (no por doctor). Se usa el campo
  `branch.capacity` (fallback: número de doctores activos en la sucursal).

  Endpoints:
    POST /cleanup-expired-locks
    GET  /start-slots ?doctorId&branchId&date
    POST /lock
    GET  /{id}/end-slots ?startTime
    PUT  /{id}/start-time   (sobre lock activo)
    PUT  /{id}/end-time     (sobre lock activo)
    PUT  /{id}/dentist      (sobre lock activo)
    PUT  /{id}/date         (sobre lock activo)
    PUT  /{id}/confirm
    PUT  /{id}/cancel
    PUT  /{id}/reschedule
    PUT  /{id}/arrive
    PUT  /{id}/assign-doctor
    PUT  /{id}/start-attention
    PUT  /{id}/finish-attention
    GET  /{id}
    GET  /schedule/month
    GET  /schedule/day
"""
from datetime import datetime, timedelta, timezone, date
from typing import Optional
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from core.db import db
from core.deps import current_user
from core.audit import log_activity
from utils.ids import next_seq

router = APIRouter(prefix="/appointments", tags=["appointments"])

# Zona horaria de la clínica. Toda comparación "hoy / hora actual" usa esta TZ,
# no UTC, para evitar bloqueos falsos por desfase.
CLINIC_TZ = ZoneInfo("America/Mexico_City")

LOCK_TTL_MINUTES = 10
DEFAULT_SLOT_MINUTES = 30          # paso para start-slots
ENDSLOT_STEP_MINUTES = 15          # granularidad de end-slots y de ocupación
DEFAULT_LOCK_DURATION_MINUTES = 45 # duración por defecto del lock al crearse
MAX_END_SLOTS = 12
WORK_START = "09:00"
WORK_END = "18:00"
ENDSLOT_END = "20:00"

# Estados que ocupan capacidad
ACTIVE_STATUSES = ("LOCKED", "CONFIRMED", "ARRIVED", "IN_PROGRESS", "ATTENDED", "COMPLETED")
COMPLETED_STATUSES = ("ATTENDED", "COMPLETED")


# ---------------- helpers ----------------

def _trim_sec(t: str | None) -> str:
    return (t or "")[:5]


def _full_time(t: str) -> str:
    """Convierte HH:MM o HH:MM:SS a HH:MM:SS."""
    if not t:
        return ""
    return t if len(t) > 5 else f"{t}:00"


def _to_minutes(t: str) -> int:
    """HH:MM o HH:MM:SS → minutos."""
    parts = t.split(":")
    return int(parts[0]) * 60 + int(parts[1])


def _from_minutes(m: int) -> str:
    """minutos → HH:MM:SS"""
    return f"{m // 60:02d}:{m % 60:02d}:00"


def _generate_day_slots(start=WORK_START, end=WORK_END, step=DEFAULT_SLOT_MINUTES):
    sh, sm = [int(x) for x in start.split(":")]
    eh, em = [int(x) for x in end.split(":")]
    t = sh * 60 + sm
    end_t = eh * 60 + em
    out = []
    while t < end_t:
        out.append(f"{t // 60:02d}:{t % 60:02d}:00")
        t += step
    return out


def _now_hhmmss() -> str:
    """HH:MM:SS en hora LOCAL de la clínica (America/Mexico_City)."""
    return datetime.now(CLINIC_TZ).strftime("%H:%M:%S")


def _local_now():
    """datetime aware en zona local de la clínica."""
    return datetime.now(CLINIC_TZ)


def _local_today_iso() -> str:
    """YYYY-MM-DD en zona local de la clínica."""
    return _local_now().date().isoformat()


def _weekday_of(date_iso: str) -> int:
    """Devuelve weekday() de una fecha YYYY-MM-DD. 0=Lunes ... 6=Domingo."""
    y, m, d = (int(x) for x in date_iso.split("-"))
    return date(y, m, d).weekday()


def _business_window(date_iso: str):
    """Ventana de horario laboral para la fecha (en minutos desde 00:00).
    Devuelve (open_min, close_min) o None si la clínica está cerrada (domingo)."""
    wd = _weekday_of(date_iso)
    if wd == 6:        # domingo cerrado
        return None
    if wd == 5:        # sábado 09:00–17:00
        return (9 * 60, 17 * 60)
    return (9 * 60, 18 * 60)  # lun–vie 09:00–18:00


def _is_lock_expired(a: dict) -> bool:
    if a.get("statusCode") != "LOCKED":
        return False
    locked_until = a.get("lockedUntil")
    if not locked_until:
        return True
    try:
        return datetime.fromisoformat(locked_until.replace("Z", "+00:00")) < datetime.now(timezone.utc)
    except Exception:
        return True


async def _branch_capacity(branch_id: int) -> int:
    """Capacidad efectiva de la sucursal. Fallback: nº doctores activos. Mínimo 1."""
    branch = await db.branches.find_one({"id": branch_id}, {"_id": 0}) or {}
    cap = branch.get("capacity")
    if cap is None:
        cap = await db.doctors.count_documents({
            "active": True, "availableForAppointments": True,
            "branches": {"$elemMatch": {"$eq": branch_id}},
        })
    return max(int(cap or 1), 1)


async def _branch_slot_occupancy(branch_id: int, date: str, exclude_appt_id: int | None = None) -> dict[str, int]:
    """Devuelve {slot_HH:MM:SS: count} de citas que ocupan ese paso (15 min) en la sucursal.
    LOCKs expirados se ignoran.
    """
    q = {
        "branchId": branch_id,
        "appointmentDate": date,
        "statusCode": {"$in": list(ACTIVE_STATUSES)},
    }
    if exclude_appt_id is not None:
        q["id"] = {"$ne": exclude_appt_id}
    occ: dict[str, int] = {}
    async for a in db.appointments.find(q, {"_id": 0, "startTime": 1, "endTime": 1, "statusCode": 1, "lockedUntil": 1}):
        if a.get("statusCode") == "LOCKED" and _is_lock_expired(a):
            continue
        start = (a.get("startTime") or "")[:8]
        end = (a.get("endTime") or "")[:8]
        if not start:
            continue
        if not end:
            end = _from_minutes(_to_minutes(start) + DEFAULT_LOCK_DURATION_MINUTES)
        s_min = _to_minutes(start)
        e_min = _to_minutes(end)
        for t in range(s_min, e_min, ENDSLOT_STEP_MINUTES):
            slot = _from_minutes(t)
            occ[slot] = occ.get(slot, 0) + 1
    return occ


def _interval_ok(occupancy: dict[str, int], start_full: str, end_full: str, capacity: int) -> bool:
    s_min = _to_minutes(start_full)
    e_min = _to_minutes(end_full)
    for t in range(s_min, e_min, ENDSLOT_STEP_MINUTES):
        slot = _from_minutes(t)
        if occupancy.get(slot, 0) >= capacity:
            return False
    return True


async def _doctor_lookup(doctor_id: int) -> dict:
    d = await db.doctors.find_one({"id": doctor_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Doctor no existe")
    return d


def _doctor_full_name(d: dict) -> str:
    return d.get("fullName") or f"{d.get('name','')} {d.get('lastName','')}".strip()


async def _ensure_active_lock(appointment_id: int) -> dict:
    a = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Cita no existe")
    if a.get("statusCode") != "LOCKED":
        raise HTTPException(status_code=409, detail="La cita ya no está en estado LOCKED")
    if _is_lock_expired(a):
        raise HTTPException(status_code=410, detail="Appointment lock has expired.")
    return a


def _effective_doctor(a: dict) -> tuple[Optional[int], Optional[str]]:
    """Devuelve el doctor efectivo (asignado si existe, si no solicitado)."""
    did = a.get("doctorAsignado") or a.get("doctorSolicitado") or a.get("doctorId")
    dname = a.get("doctorAsignadoName") or a.get("doctorSolicitadoName") or a.get("doctorName")
    return did, dname


# ---------------- request models ----------------

class LockIn(BaseModel):
    doctorId: int          # doctor solicitado
    branchId: int = 1
    patientId: int
    date: str
    startTime: str         # HH:mm o HH:mm:ss


class TimeIn(BaseModel):
    startTime: Optional[str] = None
    endTime: Optional[str] = None


class DentistIn(BaseModel):
    dentistId: int


class DateIn(BaseModel):
    appointmentDate: str


class ConfirmIn(BaseModel):
    patientId: int
    reason: str
    notes: Optional[str] = ""


class CancelIn(BaseModel):
    reason: Optional[str] = ""


class RescheduleIn(BaseModel):
    appointmentDate: Optional[str] = None
    startTime: Optional[str] = None
    endTime: Optional[str] = None
    doctorId: Optional[int] = None


class AssignDoctorIn(BaseModel):
    doctorId: int
    confirmReplace: bool = False


class FinishIn(BaseModel):
    notes: Optional[str] = ""


class WalkInIn(BaseModel):
    patientId: int
    branchId: int = 1
    doctorId: Optional[int] = None  # se puede asignar después
    reason: Optional[str] = "Sin cita previa"


class CreateAppointmentIn(BaseModel):
    """Crea una cita programada directamente (sin lock workflow).
    doctorId es opcional — si no se provee, la cita queda como SCHEDULED sin doctor
    y aparece en "Pacientes citados" (sin asignar)."""
    patientId: int
    branchId: int = 1
    appointmentDate: str            # YYYY-MM-DD
    startTime: str                  # HH:mm o HH:mm:ss
    endTime: str                    # HH:mm o HH:mm:ss
    doctorId: Optional[int] = None
    reason: str
    notes: Optional[str] = ""


# ---------------- endpoints ----------------

@router.post("/create")
async def create_appointment_direct(body: CreateAppointmentIn, user = Depends(current_user)):
    """Crea una cita programada directamente (sin lock workflow). Doctor opcional.

    - Si `doctorId` es None → cita SCHEDULED sin doctor (aparece en "Pacientes citados").
    - Si `doctorId` se provee → valida que el doctor exista, esté activo, y que haya
      capacidad de sucursal en ese horario. La cita queda con doctor asignado.

    Validaciones:
      - paciente debe existir
      - endTime > startTime
      - si la fecha es hoy, startTime >= hora actual
      - reason requerido (no vacío)
      - si hay doctor: validar capacidad de sucursal en el intervalo
    """
    if not await db.patients.find_one({"id": body.patientId}):
        raise HTTPException(status_code=404, detail="Paciente no existe")
    reason = (body.reason or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Motivo requerido")

    branch = await db.branches.find_one({"id": body.branchId}, {"_id": 0})
    branch_name = (branch or {}).get("name", "Boss Dental")

    # Fecha pasada: rechazar (TZ local de la clínica).
    today_iso = _local_today_iso()
    if body.appointmentDate < today_iso:
        raise HTTPException(status_code=400, detail="No se puede agendar en una fecha pasada")

    # Domingo: clínica cerrada.
    window = _business_window(body.appointmentDate)
    if window is None:
        raise HTTPException(status_code=400, detail="La clínica no atiende los domingos")
    open_min, close_min = window

    start_full = _full_time(body.startTime)
    end_full = _full_time(body.endTime)
    s_min = _to_minutes(start_full)
    e_min = _to_minutes(end_full)
    if e_min <= s_min:
        raise HTTPException(status_code=400, detail="La hora fin debe ser mayor a la hora inicial")

    # Dentro de horario laboral.
    if s_min < open_min or e_min > close_min:
        raise HTTPException(
            status_code=400,
            detail=f"Horario fuera de turno (laboral {open_min//60:02d}:{open_min%60:02d}–{close_min//60:02d}:{close_min%60:02d})",
        )

    # Si la fecha es hoy (en TZ de la clínica) la hora no puede ser anterior a "ahora".
    if body.appointmentDate == today_iso:
        now_min = _to_minutes(_now_hhmmss())
        if s_min < now_min:
            raise HTTPException(status_code=400, detail="La hora inicial no puede ser anterior a la hora actual")

    doctor_id = None
    doctor_name = None
    if body.doctorId is not None:
        d = await _doctor_lookup(body.doctorId)
        if not d.get("active", True) or not d.get("availableForAppointments", True):
            raise HTTPException(status_code=409, detail="El doctor no está activo o disponible para citas")
        doctor_id = body.doctorId
        doctor_name = _doctor_full_name(d)

        # Validar capacidad de sucursal en el intervalo
        capacity = await _branch_capacity(body.branchId)
        occupancy = await _branch_slot_occupancy(body.branchId, body.appointmentDate)
        if not _interval_ok(occupancy, start_full, end_full, capacity):
            raise HTTPException(status_code=409, detail="Sucursal sin capacidad disponible en ese horario")

    seq = await next_seq("appointment")
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": seq,
        "patientId": body.patientId,
        "doctorSolicitado": doctor_id,
        "doctorSolicitadoName": doctor_name,
        "doctorAsignado": doctor_id,
        "doctorAsignadoName": doctor_name,
        "doctorId": doctor_id,
        "doctorName": doctor_name,
        "branchId": body.branchId,
        "branchName": branch_name,
        "appointmentDate": body.appointmentDate,
        "startTime": start_full,
        "endTime": end_full,
        "horaProgramada": start_full,
        "horaLlegada": None,
        "horaInicioReal": None,
        "horaFinReal": None,
        "reason": reason,
        "notes": (body.notes or "").strip(),
        "statusCode": "CONFIRMED",
        "statusName": "Confirmada",
        "statusColor": "GREEN",
        "walkIn": False,
        "createdAt": now_iso,
        "createdBy": user["id"],
        "confirmedAt": now_iso,
    }
    await db.appointments.insert_one(doc)
    patient = await db.patients.find_one({"id": body.patientId}, {"_id": 0}) or {}
    full_name = f"{patient.get('name','')} {patient.get('lastName','')}".strip()
    await log_activity(
        action_code="APPOINTMENT_CREATED",
        module="APPOINTMENTS",
        entity_type="APPOINTMENT",
        entity_id=seq,
        title="Cita agendada",
        description=(
            f"Se agendó una cita para {full_name} el {body.appointmentDate} {start_full[:5]}"
            + (f" con {doctor_name}" if doctor_name else " (sin doctor asignado)")
        ),
        actor=user,
        patient_id=body.patientId,
    )
    return await db.appointments.find_one({"id": seq}, {"_id": 0})


@router.post("/walk-in")
async def walk_in(body: WalkInIn, user = Depends(current_user)):
    """Registra un paciente sin cita previa.
    El paciente ya queda en ARRIVED listo para atención. NO consume capacidad de citas programadas
    (no se valida contra el calendario). Si se pasa doctorId, queda asignado de inmediato.
    """
    if not await db.patients.find_one({"id": body.patientId}):
        raise HTTPException(status_code=404, detail="Paciente no existe")
    branch = await db.branches.find_one({"id": body.branchId}, {"_id": 0})
    branch_name = (branch or {}).get("name", "Boss Dental")

    doctor_id = None
    doctor_name = None
    doctor_busy_reason = None
    if body.doctorId is not None:
        d = await _doctor_lookup(body.doctorId)
        if not d.get("active", True) or not d.get("availableForAppointments", True):
            doctor_busy_reason = "El doctor no está activo/disponible — paciente registrado sin asignación."
        else:
            # Walk-in: sólo bloquear si el doctor tiene IN_PROGRESS (atención activa).
            # Pacientes ARRIVED en cola son aceptables — el walk-in se suma a la fila.
            conflict = await db.appointments.find_one(
                {"doctorAsignado": body.doctorId, "statusCode": "IN_PROGRESS"},
                {"_id": 0},
            )
            if conflict:
                doctor_busy_reason = "El doctor está atendiendo a otro paciente — registrado sin asignación."
            else:
                doctor_id = body.doctorId
                doctor_name = _doctor_full_name(d)

    seq = await next_seq("appointment")
    now_iso = datetime.now(timezone.utc).isoformat()
    now_t = _now_hhmmss()
    today = datetime.now(timezone.utc).date().isoformat()

    doc = {
        "id": seq,
        "patientId": body.patientId,
        "doctorSolicitado": None,
        "doctorSolicitadoName": None,
        "doctorAsignado": doctor_id,
        "doctorAsignadoName": doctor_name,
        "doctorId": doctor_id,
        "doctorName": doctor_name,
        "branchId": body.branchId,
        "branchName": branch_name,
        "appointmentDate": today,
        "startTime": now_t,           # ancla horaria para visualización
        "endTime": None,
        "horaProgramada": None,        # walk-in nunca tuvo programación
        "horaLlegada": now_t,
        "horaInicioReal": None,
        "horaFinReal": None,
        "reason": (body.reason or "Sin cita previa").strip(),
        "notes": "",
        "statusCode": "ARRIVED",
        "statusName": "Sin cita",
        "statusColor": "PURPLE",
        "walkIn": True,
        "createdAt": now_iso,
        "createdBy": user["id"],
        "arrivedAt": now_iso,
    }
    await db.appointments.insert_one(doc)
    await log_activity(
        action_code="WALK_IN_REGISTERED",
        module="APPOINTMENTS",
        entity_type="APPOINTMENT",
        entity_id=seq,
        title="Paciente sin cita registrado",
        description=(f"Llegó a las {now_t[:5]}" + (f" — asignado a {doctor_name}" if doctor_name else " — sin doctor asignado")
                     + (f" ({doctor_busy_reason})" if doctor_busy_reason else "")),
        actor=user,
        patient_id=body.patientId,
    )
    result = await db.appointments.find_one({"id": seq}, {"_id": 0})
    if doctor_busy_reason:
        result["doctorBusyWarning"] = doctor_busy_reason
    return result


@router.put("/{appointment_id}/no-show")
async def mark_no_show(appointment_id: int, user = Depends(current_user)):
    """Recepción marca la cita como No asistió. Libera doctor y bloque operativo."""
    a = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Cita no existe")
    if a.get("statusCode") not in ("CONFIRMED", "ARRIVED"):
        raise HTTPException(status_code=409, detail="Sólo una cita confirmada o que llegó puede marcarse como No asistió")
    await db.appointments.update_one(
        {"id": appointment_id},
        {"$set": {
            "statusCode": "NO_SHOW",
            "statusName": "No asistió",
            "statusColor": "RED",
            "noShowAt": datetime.now(timezone.utc).isoformat(),
            "noShowBy": user["id"],
            # Liberar doctor asignado (queda solo el solicitado en histórico)
            "doctorAsignado": None,
            "doctorAsignadoName": None,
            "doctorId": a.get("doctorSolicitado"),
            "doctorName": a.get("doctorSolicitadoName"),
        }},
    )
    await log_activity(
        action_code="APPOINTMENT_NO_SHOW",
        module="APPOINTMENTS",
        entity_type="APPOINTMENT",
        entity_id=appointment_id,
        title="No asistió",
        description="Recepción marcó la cita como no asistida — bloque operativo liberado",
        actor=user,
        patient_id=a.get("patientId"),
    )
    return await db.appointments.find_one({"id": appointment_id}, {"_id": 0})


@router.post("/cleanup-expired-locks")
async def cleanup_expired_locks(user = Depends(current_user)):
    now = datetime.now(timezone.utc).isoformat()
    res = await db.appointments.delete_many({
        "statusCode": "LOCKED",
        "lockedUntil": {"$lt": now},
    })
    return {"deletedCount": res.deleted_count, "executedAt": now, "message": "Locks expirados eliminados"}


@router.get("/start-slots")
async def start_slots(
    doctorId: int,
    branchId: int = 1,
    date: str = Query(...),
    user = Depends(current_user),
):
    """Capacidad por sucursal: un slot está libre si la ocupación de la sucursal a esa hora < capacity."""
    capacity = await _branch_capacity(branchId)
    occupancy = await _branch_slot_occupancy(branchId, date)
    free = []
    for s in _generate_day_slots():
        if occupancy.get(s, 0) < capacity:
            free.append(s)
    return {"slots": free}


@router.post("/lock")
async def lock_slot(body: LockIn, user = Depends(current_user)):
    if not await db.patients.find_one({"id": body.patientId}):
        raise HTTPException(status_code=404, detail="Paciente no existe")
    doctor = await _doctor_lookup(body.doctorId)
    branch = await db.branches.find_one({"id": body.branchId}, {"_id": 0})
    branch_name = branch.get("name", "Boss Dental") if branch else "Boss Dental"

    capacity = await _branch_capacity(body.branchId)
    start_full = _full_time(body.startTime)
    end_full = _from_minutes(_to_minutes(start_full) + DEFAULT_LOCK_DURATION_MINUTES)

    occupancy = await _branch_slot_occupancy(body.branchId, body.date)
    if not _interval_ok(occupancy, start_full, end_full, capacity):
        raise HTTPException(status_code=409, detail="Sucursal sin capacidad disponible en ese horario")

    seq = await next_seq("appointment")
    locked_until = (datetime.now(timezone.utc) + timedelta(minutes=LOCK_TTL_MINUTES)).isoformat()
    doctor_name = _doctor_full_name(doctor)
    doc = {
        "id": seq,
        "patientId": body.patientId,
        # solicitud original
        "doctorSolicitado": body.doctorId,
        "doctorSolicitadoName": doctor_name,
        # asignación final (vacía hasta /assign-doctor o /confirm)
        "doctorAsignado": None,
        "doctorAsignadoName": None,
        # aliases (compat frontend)
        "doctorId": body.doctorId,
        "doctorName": doctor_name,
        "branchId": body.branchId,
        "branchName": branch_name,
        "appointmentDate": body.date,
        "startTime": start_full,
        "endTime": end_full,
        "horaProgramada": start_full,
        "horaLlegada": None,
        "horaInicioReal": None,
        "horaFinReal": None,
        "reason": None,
        "notes": "",
        "statusCode": "LOCKED",
        "statusName": "Bloqueada",
        "statusColor": "AMBER",
        "lockedUntil": locked_until,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "createdBy": user["id"],
    }
    await db.appointments.insert_one(doc)
    end_slots = await _build_end_slots(seq)
    return {
        "appointmentId": seq,
        "doctorId": body.doctorId,
        "doctorSolicitado": body.doctorId,
        "branchId": body.branchId,
        "patientId": body.patientId,
        "date": body.date,
        "startTime": start_full,
        "endTime": end_full,
        "horaProgramada": start_full,
        "status": "LOCKED",
        "lockedUntil": locked_until,
        "endSlots": end_slots,
    }


async def _build_end_slots(appointment_id: int) -> list[str]:
    a = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    if not a:
        return []
    start = (a.get("startTime") or "")[:8]
    if not start:
        return []
    capacity = await _branch_capacity(a["branchId"])
    occupancy = await _branch_slot_occupancy(
        a["branchId"], a["appointmentDate"], exclude_appt_id=a["id"],
    )
    all_slots = _generate_day_slots(start=WORK_START, end=ENDSLOT_END, step=ENDSLOT_STEP_MINUTES)
    valid: list[str] = []
    for s in all_slots:
        if s <= start:
            continue
        if not _interval_ok(occupancy, start, s, capacity):
            break
        valid.append(s)
        if len(valid) >= MAX_END_SLOTS:
            break
    return valid


@router.get("/{appointment_id}/end-slots")
async def end_slots(appointment_id: int, startTime: str = Query(...), user = Depends(current_user)):
    a = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Cita no existe")
    return {
        "appointmentId": appointment_id,
        "startTime": _full_time(startTime),
        "endSlots": await _build_end_slots(appointment_id),
    }


@router.put("/{appointment_id}/start-time")
async def update_start_time(appointment_id: int, body: TimeIn, user = Depends(current_user)):
    if not body.startTime:
        raise HTTPException(status_code=400, detail="startTime requerido")
    await _ensure_active_lock(appointment_id)
    new_full = _full_time(body.startTime)
    new_locked = (datetime.now(timezone.utc) + timedelta(minutes=LOCK_TTL_MINUTES)).isoformat()
    await db.appointments.update_one(
        {"id": appointment_id},
        {"$set": {"startTime": new_full, "horaProgramada": new_full, "lockedUntil": new_locked}},
    )
    return {"appointmentId": appointment_id, "startTime": new_full, "lockedUntil": new_locked}


@router.put("/{appointment_id}/end-time")
async def update_end_time(appointment_id: int, body: TimeIn, user = Depends(current_user)):
    if not body.endTime:
        raise HTTPException(status_code=400, detail="endTime requerido")
    await _ensure_active_lock(appointment_id)
    new_full = _full_time(body.endTime)
    new_locked = (datetime.now(timezone.utc) + timedelta(minutes=LOCK_TTL_MINUTES)).isoformat()
    await db.appointments.update_one(
        {"id": appointment_id},
        {"$set": {"endTime": new_full, "lockedUntil": new_locked}},
    )
    return {"appointmentId": appointment_id, "endTime": new_full, "lockedUntil": new_locked}


@router.put("/{appointment_id}/dentist")
async def update_dentist(appointment_id: int, body: DentistIn, user = Depends(current_user)):
    """Sobre LOCK activo: cambia el doctor SOLICITADO."""
    await _ensure_active_lock(appointment_id)
    doctor = await _doctor_lookup(body.dentistId)
    full_name = _doctor_full_name(doctor)
    new_locked = (datetime.now(timezone.utc) + timedelta(minutes=LOCK_TTL_MINUTES)).isoformat()
    await db.appointments.update_one(
        {"id": appointment_id},
        {"$set": {
            "doctorSolicitado": body.dentistId,
            "doctorSolicitadoName": full_name,
            "doctorId": body.dentistId,
            "doctorName": full_name,
            "lockedUntil": new_locked,
        }},
    )
    return {"appointmentId": appointment_id, "doctorId": body.dentistId, "lockedUntil": new_locked}


@router.put("/{appointment_id}/date")
async def update_date(appointment_id: int, body: DateIn, user = Depends(current_user)):
    await _ensure_active_lock(appointment_id)
    new_locked = (datetime.now(timezone.utc) + timedelta(minutes=LOCK_TTL_MINUTES)).isoformat()
    await db.appointments.update_one(
        {"id": appointment_id},
        {"$set": {"appointmentDate": body.appointmentDate, "lockedUntil": new_locked}},
    )
    return {"appointmentId": appointment_id, "appointmentDate": body.appointmentDate, "lockedUntil": new_locked}


@router.put("/{appointment_id}/confirm")
async def confirm_appointment(appointment_id: int, body: ConfirmIn, user = Depends(current_user)):
    a = await _ensure_active_lock(appointment_id)
    # Si no hay doctorAsignado, hereda del solicitado
    doctor_asignado = a.get("doctorAsignado") or a.get("doctorSolicitado") or a.get("doctorId")
    doctor_asignado_name = a.get("doctorAsignadoName") or a.get("doctorSolicitadoName") or a.get("doctorName")
    await db.appointments.update_one(
        {"id": appointment_id},
        {"$set": {
            "statusCode": "CONFIRMED",
            "statusName": "Confirmada",
            "statusColor": "GREEN",
            "reason": body.reason,
            "notes": body.notes or "",
            "patientId": body.patientId,
            "doctorAsignado": doctor_asignado,
            "doctorAsignadoName": doctor_asignado_name,
            "doctorId": doctor_asignado,
            "doctorName": doctor_asignado_name,
            "confirmedAt": datetime.now(timezone.utc).isoformat(),
            "lockedUntil": None,
        }},
    )
    patient = await db.patients.find_one({"id": body.patientId}, {"_id": 0})
    full_name = f"{patient.get('name','')} {patient.get('lastName','')}".strip() if patient else ""
    await log_activity(
        action_code="APPOINTMENT_CREATED",
        module="APPOINTMENTS",
        entity_type="APPOINTMENT",
        entity_id=appointment_id,
        title="Cita agendada",
        description=f"Se agendó una cita para {full_name}",
        actor=user,
        patient_id=body.patientId,
    )
    out = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    return out


@router.put("/{appointment_id}/cancel")
async def cancel_appointment(appointment_id: int, body: CancelIn, user = Depends(current_user)):
    a = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Cita no existe")
    if a.get("statusCode") in ("CANCELLED",) + COMPLETED_STATUSES:
        raise HTTPException(status_code=409, detail="La cita ya está cerrada y no puede cancelarse")
    await db.appointments.update_one(
        {"id": appointment_id},
        {"$set": {
            "statusCode": "CANCELLED",
            "statusName": "Cancelada",
            "statusColor": "RED",
            "cancelledAt": datetime.now(timezone.utc).isoformat(),
            "cancelReason": (body.reason or "").strip(),
            "cancelledBy": user["id"],
            "lockedUntil": None,
        }},
    )
    await log_activity(
        action_code="APPOINTMENT_CANCELLED",
        module="APPOINTMENTS",
        entity_type="APPOINTMENT",
        entity_id=appointment_id,
        title="Cita cancelada",
        description=(body.reason or "").strip() or "Sin motivo especificado",
        actor=user,
        patient_id=a.get("patientId"),
    )
    return await db.appointments.find_one({"id": appointment_id}, {"_id": 0})


@router.put("/{appointment_id}/reschedule")
async def reschedule_appointment(appointment_id: int, body: RescheduleIn, user = Depends(current_user)):
    a = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Cita no existe")
    if a.get("statusCode") not in ("CONFIRMED", "ARRIVED"):
        raise HTTPException(status_code=409, detail="Sólo se puede reagendar una cita confirmada o ya llegada")

    new_date = body.appointmentDate or a.get("appointmentDate")
    new_start = _full_time(body.startTime) if body.startTime else (a.get("startTime") or "")[:8]
    if body.endTime:
        new_end = _full_time(body.endTime)
    else:
        # mantener duración previa
        prev_start = _to_minutes((a.get("startTime") or "")[:8])
        prev_end = _to_minutes((a.get("endTime") or "")[:8] or (a.get("startTime") or "")[:8])
        dur = max(prev_end - prev_start, DEFAULT_LOCK_DURATION_MINUTES)
        new_end = _from_minutes(_to_minutes(new_start) + dur)

    capacity = await _branch_capacity(a["branchId"])
    occupancy = await _branch_slot_occupancy(a["branchId"], new_date, exclude_appt_id=appointment_id)
    if not _interval_ok(occupancy, new_start, new_end, capacity):
        raise HTTPException(status_code=409, detail="Sucursal sin capacidad disponible en el nuevo horario")

    update: dict = {
        "appointmentDate": new_date,
        "startTime": new_start,
        "endTime": new_end,
        "horaProgramada": new_start,
        "rescheduledAt": datetime.now(timezone.utc).isoformat(),
        "rescheduledBy": user["id"],
        # al reagendar reseteamos los horarios reales
        "horaLlegada": None,
        "horaInicioReal": None,
        "horaFinReal": None,
        "statusCode": "CONFIRMED",
        "statusName": "Confirmada",
        "statusColor": "GREEN",
    }
    if body.doctorId is not None:
        doctor = await _doctor_lookup(body.doctorId)
        dname = _doctor_full_name(doctor)
        update.update({
            "doctorSolicitado": body.doctorId,
            "doctorSolicitadoName": dname,
            "doctorAsignado": body.doctorId,
            "doctorAsignadoName": dname,
            "doctorId": body.doctorId,
            "doctorName": dname,
        })
    await db.appointments.update_one({"id": appointment_id}, {"$set": update})
    await log_activity(
        action_code="APPOINTMENT_RESCHEDULED",
        module="APPOINTMENTS",
        entity_type="APPOINTMENT",
        entity_id=appointment_id,
        title="Cita reagendada",
        description=f"Nueva fecha: {new_date} {new_start[:5]}",
        actor=user,
        patient_id=a.get("patientId"),
    )
    return await db.appointments.find_one({"id": appointment_id}, {"_id": 0})


@router.put("/{appointment_id}/arrive")
async def mark_arrival(appointment_id: int, user = Depends(current_user)):
    a = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Cita no existe")
    if a.get("statusCode") != "CONFIRMED":
        raise HTTPException(status_code=409, detail="Sólo una cita CONFIRMED puede marcar llegada")
    now_t = _now_hhmmss()
    await db.appointments.update_one(
        {"id": appointment_id},
        {"$set": {
            "statusCode": "ARRIVED",
            "statusName": "Llegó",
            "statusColor": "BLUE",
            "horaLlegada": now_t,
            "arrivedAt": datetime.now(timezone.utc).isoformat(),
        }},
    )
    await log_activity(
        action_code="APPOINTMENT_ARRIVED",
        module="APPOINTMENTS",
        entity_type="APPOINTMENT",
        entity_id=appointment_id,
        title="Paciente llegó",
        description=f"Hora de llegada: {now_t[:5]}",
        actor=user,
        patient_id=a.get("patientId"),
    )
    return await db.appointments.find_one({"id": appointment_id}, {"_id": 0})


@router.put("/{appointment_id}/assign-doctor")
async def assign_doctor(appointment_id: int, body: AssignDoctorIn, user = Depends(current_user)):
    a = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Cita no existe")
    if a.get("statusCode") in ("CANCELLED",) + COMPLETED_STATUSES:
        raise HTTPException(status_code=409, detail="La cita está cerrada — no se puede asignar doctor")
    doctor = await _doctor_lookup(body.doctorId)
    if not doctor.get("active", True) or not doctor.get("availableForAppointments", True):
        raise HTTPException(status_code=409, detail="El doctor no está activo o disponible para citas")
    dname = _doctor_full_name(doctor)

    # Validar capacidad operativa: 1 IN_PROGRESS + 1 ASSIGNED en bloque (mismo día)
    if not body.confirmReplace:
        conflict = await _check_doctor_block_conflict(body.doctorId, a, exclude_id=appointment_id)
        if conflict:
            raise HTTPException(status_code=409, detail={
                "code": "DOCTOR_BLOCK_CONFLICT",
                "message": "El doctor ya tiene un paciente asignado o en atención.",
                "conflictAppointmentId": conflict["id"],
                "conflictPatientName": conflict.get("patientName"),
                "conflictStatus": conflict.get("statusCode"),
                "conflictTime": (conflict.get("startTime") or "")[:5],
                "requiresConfirmation": True,
            })

    # Si confirmReplace, desasignar al paciente previo del doctor en el mismo bloque (si lo hay).
    # NUNCA desasignar IN_PROGRESS — esas deben finalizarse explícitamente, no reemplazarse.
    if body.confirmReplace:
        conflict = await _check_doctor_block_conflict(body.doctorId, a, exclude_id=appointment_id)
        if conflict and conflict.get("statusCode") != "IN_PROGRESS":
            await db.appointments.update_one(
                {"id": conflict["id"]},
                {"$set": {
                    "doctorAsignado": None,
                    "doctorAsignadoName": None,
                    "doctorId": conflict.get("doctorSolicitado"),
                    "doctorName": conflict.get("doctorSolicitadoName"),
                }},
            )
            await log_activity(
                action_code="APPOINTMENT_DOCTOR_UNASSIGNED",
                module="APPOINTMENTS",
                entity_type="APPOINTMENT",
                entity_id=conflict["id"],
                title="Doctor desasignado por reemplazo",
                description=f"Reemplazado por nueva asignación al doctor {dname} (cita {appointment_id})",
                actor=user,
                patient_id=conflict.get("patientId"),
            )

    await db.appointments.update_one(
        {"id": appointment_id},
        {"$set": {
            "doctorAsignado": body.doctorId,
            "doctorAsignadoName": dname,
            "doctorId": body.doctorId,
            "doctorName": dname,
            "doctorAssignedAt": datetime.now(timezone.utc).isoformat(),
        }},
    )
    await log_activity(
        action_code="APPOINTMENT_DOCTOR_ASSIGNED",
        module="APPOINTMENTS",
        entity_type="APPOINTMENT",
        entity_id=appointment_id,
        title="Doctor asignado",
        description=f"Asignado: {dname}" + (" (reemplazo confirmado)" if body.confirmReplace else ""),
        actor=user,
        patient_id=a.get("patientId"),
    )
    return await db.appointments.find_one({"id": appointment_id}, {"_id": 0})


async def _check_doctor_block_conflict(doctor_id: int, target_appt: dict, exclude_id: int) -> dict | None:
    """Conflicto si el doctor ya está ocupado en el MISMO bloque operativo (ventana ~30 min).
    Reglas:
      - 1 IN_PROGRESS por doctor en cualquier momento → conflicto.
      - 1 ARRIVED con doctorAsignado=doctor en bloque solapado → conflicto.
    """
    day = target_appt.get("appointmentDate")
    target_start = _to_minutes((target_appt.get("startTime") or "00:00")[:8]) if target_appt.get("startTime") else None
    BLOCK_WINDOW = 30  # minutos

    # IN_PROGRESS: cualquier momento
    busy_in_progress = await db.appointments.find_one(
        {"id": {"$ne": exclude_id}, "doctorAsignado": doctor_id, "statusCode": "IN_PROGRESS"},
        {"_id": 0},
    )
    if busy_in_progress:
        return busy_in_progress

    # ARRIVED en el mismo día y en ventana solapada
    if target_start is None:
        return None
    async for other in db.appointments.find(
        {"id": {"$ne": exclude_id}, "doctorAsignado": doctor_id, "statusCode": "ARRIVED", "appointmentDate": day},
        {"_id": 0, "id": 1, "startTime": 1, "patientId": 1, "patientName": 1, "statusCode": 1},
    ):
        other_start = _to_minutes((other.get("startTime") or "00:00")[:8])
        if abs(other_start - target_start) < BLOCK_WINDOW:
            return other
    return None


@router.put("/{appointment_id}/start-attention")
async def start_attention(appointment_id: int, user = Depends(current_user)):
    a = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Cita no existe")
    if a.get("statusCode") not in ("ARRIVED", "CONFIRMED"):
        raise HTTPException(status_code=409, detail="Sólo se puede iniciar atención sobre una cita confirmada o que ya llegó")
    if not (a.get("doctorAsignado") or a.get("doctorSolicitado")):
        raise HTTPException(status_code=400, detail="Debe asignarse un doctor antes de iniciar atención")
    eff_doctor = a.get("doctorAsignado") or a.get("doctorSolicitado")
    # Guard: 1 IN_PROGRESS por doctor.
    busy = await db.appointments.find_one(
        {"id": {"$ne": appointment_id}, "doctorAsignado": eff_doctor, "statusCode": "IN_PROGRESS"},
        {"_id": 0, "id": 1, "patientId": 1, "patientName": 1, "startTime": 1},
    )
    if busy:
        raise HTTPException(status_code=409, detail={
            "code": "DOCTOR_ATTENTION_BUSY",
            "message": "El doctor ya está atendiendo a otro paciente. Finalízala primero.",
            "conflictAppointmentId": busy["id"],
            "conflictPatientId": busy.get("patientId"),
            "conflictPatientName": busy.get("patientName"),
            "conflictTime": (busy.get("startTime") or "")[:5],
        })
    now_t = _now_hhmmss()
    update = {
        "statusCode": "IN_PROGRESS",
        "statusName": "En atención",
        "statusColor": "AMBER",
        "horaInicioReal": now_t,
        "startedAt": datetime.now(timezone.utc).isoformat(),
    }
    # Si no había horaLlegada, dejarla en None (la atención puede empezar sin marcar llegada manual)
    if not a.get("doctorAsignado"):
        update["doctorAsignado"] = a.get("doctorSolicitado")
        update["doctorAsignadoName"] = a.get("doctorSolicitadoName")
        update["doctorId"] = a.get("doctorSolicitado")
        update["doctorName"] = a.get("doctorSolicitadoName")
    await db.appointments.update_one({"id": appointment_id}, {"$set": update})
    await log_activity(
        action_code="APPOINTMENT_STARTED",
        module="APPOINTMENTS",
        entity_type="APPOINTMENT",
        entity_id=appointment_id,
        title="Atención iniciada",
        description=f"Hora inicio real: {now_t[:5]}",
        actor=user,
        patient_id=a.get("patientId"),
    )
    return await db.appointments.find_one({"id": appointment_id}, {"_id": 0})


@router.put("/{appointment_id}/finish-attention")
async def finish_attention(appointment_id: int, body: FinishIn, user = Depends(current_user)):
    a = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Cita no existe")
    if a.get("statusCode") != "IN_PROGRESS":
        raise HTTPException(status_code=409, detail="Sólo una cita IN_PROGRESS puede finalizarse")
    now_t = _now_hhmmss()
    notes_new = (body.notes or "").strip()
    notes_prev = (a.get("notes") or "").strip()
    notes_combined = ("\n".join([notes_prev, notes_new]).strip()) if notes_new else notes_prev
    await db.appointments.update_one(
        {"id": appointment_id},
        {"$set": {
            "statusCode": "COMPLETED",
            "statusName": "Atendida",
            "statusColor": "GREEN",
            "horaFinReal": now_t,
            "completedAt": datetime.now(timezone.utc).isoformat(),
            "notes": notes_combined,
        }},
    )
    await log_activity(
        action_code="APPOINTMENT_COMPLETED",
        module="APPOINTMENTS",
        entity_type="APPOINTMENT",
        entity_id=appointment_id,
        title="Atención finalizada",
        description=f"Hora fin real: {now_t[:5]}",
        actor=user,
        patient_id=a.get("patientId"),
    )
    return await db.appointments.find_one({"id": appointment_id}, {"_id": 0})


# ---------------- GET endpoints (lectura) ----------------

def _serialize_appt_full(a: dict, patient: dict | None) -> dict:
    start = (a.get("startTime") or "")[:8]
    end = (a.get("endTime") or "")[:8]
    dur = 0
    try:
        dur = max(0, _to_minutes(end) - _to_minutes(start))
    except Exception:
        pass
    eff_id, eff_name = _effective_doctor(a)
    return {
        "appointmentId": a["id"],
        "id": a["id"],
        "date": a.get("appointmentDate"),
        "appointmentDate": a.get("appointmentDate"),
        "startTime": a.get("startTime"),
        "endTime": a.get("endTime"),
        "durationMinutes": dur,
        "patientId": a.get("patientId"),
        "patientName": f"{(patient or {}).get('name','')} {(patient or {}).get('lastName','')}".strip(),
        "patientExpedient": (patient or {}).get("expedientNumber"),
        "patientPhone": (patient or {}).get("phone"),
        "reason": a.get("reason"),
        "dentistId": eff_id,
        "dentistName": eff_name,
        "doctorId": eff_id,
        "doctorName": eff_name,
        "doctorSolicitado": a.get("doctorSolicitado"),
        "doctorSolicitadoName": a.get("doctorSolicitadoName"),
        "doctorAsignado": a.get("doctorAsignado"),
        "doctorAsignadoName": a.get("doctorAsignadoName"),
        "branchId": a.get("branchId"),
        "branchName": a.get("branchName"),
        "statusCode": a.get("statusCode"),
        "statusName": a.get("statusName"),
        "statusColor": a.get("statusColor"),
        "notes": a.get("notes"),
        "horaProgramada": a.get("horaProgramada") or a.get("startTime"),
        "horaLlegada": a.get("horaLlegada"),
        "horaInicioReal": a.get("horaInicioReal"),
        "horaFinReal": a.get("horaFinReal"),
        "walkIn": bool(a.get("walkIn", False)),
        "rescheduledAt": a.get("rescheduledAt"),
        "cancelReason": a.get("cancelReason"),
        "cancelledAt": a.get("cancelledAt"),
    }


@router.get("/{appointment_id}/history")
async def appointment_history(appointment_id: int, user = Depends(current_user)):
    """Bitácora específica de una cita."""
    cursor = db.activity_logs.find(
        {"entityType": "APPOINTMENT", "entityId": appointment_id},
        {"_id": 0},
    ).sort("createdAt", -1)
    events = [doc async for doc in cursor]
    return {"appointmentId": appointment_id, "events": events}


@router.get("/{appointment_id}")
async def get_appointment(appointment_id: int, user = Depends(current_user)):
    a = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Cita no existe")
    patient = await db.patients.find_one({"id": a.get("patientId")}, {"_id": 0}) or {}
    return _serialize_appt_full(a, patient)


@router.get("/schedule/month")
async def schedule_month(
    year: int,
    month: int,
    branchId: int = 1,
    dentistId: int | None = None,
    user = Depends(current_user),
):
    month_prefix = f"{year:04d}-{month:02d}"
    q = {
        "branchId": branchId,
        "appointmentDate": {"$regex": f"^{month_prefix}"},
        "statusCode": {"$nin": ["LOCKED"]},
    }
    if dentistId is not None:
        q["$or"] = [{"doctorAsignado": dentistId}, {"doctorSolicitado": dentistId}, {"doctorId": dentistId}]
    buckets: dict[str, dict] = {}
    async for a in db.appointments.find(q, {"_id": 0}):
        d = a.get("appointmentDate")
        if not d:
            continue
        b = buckets.setdefault(d, {"date": d, "totalAppointments": 0, "confirmedCount": 0, "completedCount": 0, "cancelledCount": 0})
        b["totalAppointments"] += 1
        sc = a.get("statusCode")
        if sc == "CONFIRMED": b["confirmedCount"] += 1
        elif sc in COMPLETED_STATUSES: b["completedCount"] += 1
        elif sc == "CANCELLED": b["cancelledCount"] += 1
    out = []
    for d in sorted(buckets.keys()):
        b = buckets[d]
        total = b["totalAppointments"]
        if total == 0: lvl = "VACIO"
        elif total <= 3: lvl = "BAJA"
        elif total <= 6: lvl = "MEDIA"
        elif total <= 9: lvl = "ALTA"
        else: lvl = "SATURADA"
        b["loadLevel"] = lvl
        out.append(b)
    return out


@router.get("/schedule/day")
async def schedule_day(
    date: str,
    branchId: int = 1,
    dentistId: int | None = None,
    user = Depends(current_user),
):
    q = {"branchId": branchId, "appointmentDate": date, "statusCode": {"$nin": ["LOCKED", "CANCELLED"]}}
    if dentistId is not None:
        q["$or"] = [{"doctorAsignado": dentistId}, {"doctorSolicitado": dentistId}, {"doctorId": dentistId}]
    items = []
    async for a in db.appointments.find(q, {"_id": 0}).sort([("startTime", 1)]):
        patient = await db.patients.find_one({"id": a.get("patientId")}, {"_id": 0}) or {}
        items.append(_serialize_appt_full(a, patient))
    return items
