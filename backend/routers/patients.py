"""Patients endpoints (FastAPI + Mongo)."""
import re
from datetime import datetime, timezone
from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field

from core.db import db
from core.deps import current_user
from core.audit import log_activity
from utils.ids import next_seq
from utils.format import fmt_date_long_es

router = APIRouter(prefix="/patients", tags=["patients"])


class PatientCreateIn(BaseModel):
    name: str
    lastName: str
    email: EmailStr | str = ""
    phone: int | str
    gender: str
    birthDate: str
    address: str
    emergencyContactName: Optional[str] = ""
    emergencyContactPhone: Optional[str] = ""
    photoUrl: Optional[str] = None


class PatientUpdateIn(BaseModel):
    """Campos editables del paciente. Todos opcionales — sólo se actualizan los enviados."""
    name: Optional[str] = None
    lastName: Optional[str] = None
    email: Optional[EmailStr | str] = None
    phone: Optional[int | str] = None
    gender: Optional[str] = None
    birthDate: Optional[str] = None
    address: Optional[str] = None
    emergencyContactName: Optional[str] = None
    emergencyContactPhone: Optional[str] = None
    branchId: Optional[int] = None
    photoUrl: Optional[str] = None


def _initials(name: str, last_name: str) -> str:
    n = (name or "").strip()
    l = (last_name or "").strip()
    parts = [n[:1], l[:1]] if (n or l) else ["?"]
    return "".join(parts).upper() or "?"


def _calc_age(birth_date: str) -> int:
    try:
        d = datetime.fromisoformat(birth_date)
    except Exception:
        return 0
    today = datetime.now(timezone.utc)
    age = today.year - d.year - ((today.month, today.day) < (d.month, d.day))
    return max(0, age)


def _expedient_number(seq: int) -> str:
    year = datetime.now(timezone.utc).year
    return f"EXP-{year}-{seq:06d}"


@router.post("")
async def create_patient(body: PatientCreateIn, user = Depends(current_user)):
    seq = await next_seq("patient")
    expedient = _expedient_number(seq)
    doc = {
        "id": seq,
        "expedientNumber": expedient,
        "name": body.name.strip(),
        "lastName": body.lastName.strip(),
        "email": (body.email or "").lower() if body.email else "",
        "phone": str(body.phone),
        "gender": body.gender,
        "birthDate": body.birthDate,
        "address": body.address,
        "emergencyContactName": (body.emergencyContactName or "").strip(),
        "emergencyContactPhone": (body.emergencyContactPhone or "").strip(),
        "photoUrl": body.photoUrl,
        "doctorId": None,
        "doctorName": None,
        "branchId": 1,
        "active": True,
        "balance": 0,
        "paidAmount": 0,
        "totalBudgeted": 0,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "createdBy": user["id"],
    }
    await db.patients.insert_one(doc)
    await log_activity(
        action_code="PATIENT_CREATED",
        module="PATIENTS",
        entity_type="PATIENT",
        entity_id=seq,
        title="Paciente creado",
        description=f"Se registró al paciente {doc['name']} {doc['lastName']}",
        actor=user,
        patient_id=seq,
    )
    return {
        "id": seq,
        "patientNumber": expedient,
        "name": doc["name"],
        "lastName": doc["lastName"],
        "email": doc["email"],
        "phone": doc["phone"],
        "gender": doc["gender"],
        "birthDate": doc["birthDate"],
        "address": doc["address"],
        "emergencyContactName": doc["emergencyContactName"],
        "emergencyContactPhone": doc["emergencyContactPhone"],
        "photoUrl": doc["photoUrl"],
    }


@router.get("")
async def list_patients(
    page: int = Query(0, ge=0),
    size: int = Query(10, ge=1, le=100),
    query: str = "",
    user = Depends(current_user),
):
    q: dict[str, Any] = {}
    if query and query.strip():
        rx = {"$regex": re.escape(query.strip()), "$options": "i"}
        q["$or"] = [
            {"name": rx}, {"lastName": rx},
            {"expedientNumber": rx}, {"phone": rx}, {"email": rx},
            {"fullName": rx},
        ]
    total = await db.patients.count_documents(q)
    cursor = db.patients.find(q, {"_id": 0}).sort("createdAt", -1).skip(page * size).limit(size)
    items = []
    async for p in cursor:
        full_name = f"{p.get('name','')} {p.get('lastName','')}".strip()
        items.append({
            "id": p["id"],
            "expedientNumber": p.get("expedientNumber"),
            "fullName": full_name,
            "phone": p.get("phone"),
            "email": p.get("email"),
            "photoUrl": p.get("photoUrl"),
            "active": p.get("active", True),
        })
    total_pages = (total + size - 1) // size if total else 0
    return {"content": items, "page": page, "size": size, "totalElements": total, "totalPages": total_pages}


@router.get("/{patient_id}/detail")
async def patient_detail(patient_id: int, user = Depends(current_user)):
    p = await db.patients.find_one({"id": patient_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")

    # Próxima y previa cita (sólo confirmadas o atendidas)
    now_iso = datetime.now(timezone.utc).isoformat()
    nxt_doc = await db.appointments.find_one(
        {"patientId": patient_id, "statusCode": "CONFIRMED", "appointmentDate": {"$gte": now_iso[:10]}},
        {"_id": 0}, sort=[("appointmentDate", 1), ("startTime", 1)],
    )
    prev_doc = await db.appointments.find_one(
        {"patientId": patient_id, "statusCode": {"$in": ["COMPLETED", "ATTENDED"]}},
        {"_id": 0}, sort=[("appointmentDate", -1), ("startTime", -1)],
    )

    def _appt_brief(a):
        if not a: return None
        return {
            "date": a.get("appointmentDate"),
            "startTime": a.get("startTime"),
            "reason": a.get("reason"),
        }

    full_name = f"{p.get('name','')} {p.get('lastName','')}".strip()

    # Totales calculados (pagos reales + presupuesto vigente; ignora CANCELLED).
    totals = await _patient_totals(patient_id)

    data = {
        "id": p["id"],
        "expedientNumber": p.get("expedientNumber"),
        "fullName": full_name,
        "gender": p.get("gender", "—"),
        "age": _calc_age(p.get("birthDate", "")),
        "email": p.get("email") or None,
        "phone": p.get("phone") or None,
        "location": p.get("address") or None,
        "createdAt": (p.get("createdAt") or "")[:10],
        "doctorName": p.get("doctorName"),
        "avatarUrl": p.get("photoUrl"),
        "initials": _initials(p.get("name", ""), p.get("lastName", "")),
        "balance": totals["balance"],
        "paidAmount": totals["paidAmount"],
        "totalBudgeted": totals["totalBudgeted"],
        "previousAppointment": _appt_brief(prev_doc),
        "nextAppointment": _appt_brief(nxt_doc),
    }
    return {"data": data, "message": "Detalle del paciente obtenido correctamente", "success": True}


@router.get("/{patient_id}")
async def get_patient_raw(patient_id: int, user = Depends(current_user)):
    """Devuelve el registro completo del paciente para precargar el formulario de edición."""
    p = await db.patients.find_one({"id": patient_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    return {
        "id": p["id"],
        "expedientNumber": p.get("expedientNumber"),
        "name": p.get("name", ""),
        "lastName": p.get("lastName", ""),
        "email": p.get("email", "") or "",
        "phone": str(p.get("phone", "") or ""),
        "gender": p.get("gender", ""),
        "birthDate": p.get("birthDate", "") or "",
        "address": p.get("address", "") or "",
        "emergencyContactName": p.get("emergencyContactName", "") or "",
        "emergencyContactPhone": p.get("emergencyContactPhone", "") or "",
        "branchId": p.get("branchId", 1),
        "photoUrl": p.get("photoUrl"),
        "active": p.get("active", True),
    }


@router.patch("/{patient_id}")
async def update_patient(patient_id: int, body: PatientUpdateIn, user = Depends(current_user)):
    """Actualiza un paciente existente con los campos enviados (sólo los presentes)."""
    existing = await db.patients.find_one({"id": patient_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")

    # exclude_unset → sólo lo que vino en el body. Permite PATCH parcial real.
    incoming = body.model_dump(exclude_unset=True)
    if not incoming:
        raise HTTPException(status_code=400, detail="No se recibieron cambios para actualizar")

    # Validaciones mínimas (consistentes con creación)
    if "name" in incoming:
        n = (incoming["name"] or "").strip()
        if not n:
            raise HTTPException(status_code=400, detail="Nombre obligatorio")
        incoming["name"] = n
    if "lastName" in incoming:
        ln = (incoming["lastName"] or "").strip()
        if not ln:
            raise HTTPException(status_code=400, detail="Apellido obligatorio")
        incoming["lastName"] = ln
    if "phone" in incoming:
        ph = str(incoming["phone"] or "").strip()
        if not ph:
            raise HTTPException(status_code=400, detail="Teléfono obligatorio")
        incoming["phone"] = ph
    if "email" in incoming:
        em = (incoming["email"] or "").strip().lower()
        # email opcional: si llega vacío lo blanqueamos; si llega con valor pydantic ya validó
        incoming["email"] = em
    if "address" in incoming and incoming["address"] is not None:
        incoming["address"] = incoming["address"].strip()
    if "emergencyContactName" in incoming and incoming["emergencyContactName"] is not None:
        incoming["emergencyContactName"] = incoming["emergencyContactName"].strip()
    if "emergencyContactPhone" in incoming and incoming["emergencyContactPhone"] is not None:
        incoming["emergencyContactPhone"] = str(incoming["emergencyContactPhone"]).strip()
    if "branchId" in incoming and incoming["branchId"] is not None:
        # opcional: verificar que la sucursal exista
        if not await db.branches.find_one({"id": incoming["branchId"]}, {"_id": 0}):
            raise HTTPException(status_code=400, detail="Sucursal no encontrada")

    # Idempotencia: si no hay cambios reales contra lo que ya está, no escribimos.
    real_changes = {k: v for k, v in incoming.items() if existing.get(k) != v}
    if not real_changes:
        return {"data": existing | {"id": patient_id}, "message": "Sin cambios", "success": True, "changed": False}

    real_changes["updatedAt"] = datetime.now(timezone.utc).isoformat()
    real_changes["updatedBy"] = user["id"]
    await db.patients.update_one({"id": patient_id}, {"$set": real_changes})

    updated = await db.patients.find_one({"id": patient_id}, {"_id": 0})
    full_name = f"{updated.get('name','')} {updated.get('lastName','')}".strip()
    await log_activity(
        action_code="PATIENT_UPDATED",
        module="PATIENTS",
        entity_type="PATIENT",
        entity_id=patient_id,
        title="Paciente actualizado",
        description=f"Se actualizó la información del paciente {full_name} ({', '.join(sorted(real_changes.keys() - {'updatedAt','updatedBy'}))})",
        actor=user,
        patient_id=patient_id,
    )
    # Respuesta compatible con el shape de get_patient_raw
    return {
        "data": {
            "id": updated["id"],
            "expedientNumber": updated.get("expedientNumber"),
            "name": updated.get("name", ""),
            "lastName": updated.get("lastName", ""),
            "email": updated.get("email", "") or "",
            "phone": str(updated.get("phone", "") or ""),
            "gender": updated.get("gender", ""),
            "birthDate": updated.get("birthDate", "") or "",
            "address": updated.get("address", "") or "",
            "emergencyContactName": updated.get("emergencyContactName", "") or "",
            "emergencyContactPhone": updated.get("emergencyContactPhone", "") or "",
            "branchId": updated.get("branchId", 1),
            "photoUrl": updated.get("photoUrl"),
        },
        "message": "Paciente actualizado correctamente",
        "success": True,
        "changed": True,
    }


@router.get("/{patient_id}/appointments")
async def patient_appointments(patient_id: int, user = Depends(current_user)):
    cursor = db.appointments.find(
        {"patientId": patient_id, "statusCode": {"$ne": "LOCKED"}},
        {"_id": 0},
    ).sort([("appointmentDate", -1), ("startTime", -1)])
    items = []
    async for a in cursor:
        status_code = a.get("statusCode", "PENDING")
        items.append({
            "id": a["id"],
            "appointmentDate": a.get("appointmentDate"),
            "startTime": a.get("startTime"),
            "endTime": a.get("endTime"),
            "reason": a.get("reason"),
            "doctorName": a.get("doctorName"),
            "branchName": a.get("branchName"),
            "statusCode": status_code,
            "statusName": a.get("statusName", "Programada"),
            "statusColor": a.get("statusColor", "BLUE"),
            "canCancel": status_code not in ("CANCELLED", "COMPLETED", "ATTENDED", "NO_SHOW"),
            "canReschedule": status_code in ("CONFIRMED", "PENDING"),
        })
    return {"data": items, "message": "Citas del paciente obtenidas correctamente", "success": True}


@router.get("/{patient_id}/activity-logs")
async def patient_activity_logs(
    patient_id: int,
    page: int = Query(0, ge=0),
    size: int = Query(20, ge=1, le=100),
    user = Depends(current_user),
):
    q = {"patientId": patient_id}
    total = await db.activity_logs.count_documents(q)
    cursor = db.activity_logs.find(q, {"_id": 0}).sort("createdAt", -1).skip(page * size).limit(size)
    content = [doc async for doc in cursor]
    total_pages = (total + size - 1) // size if total else 0
    return {
        "data": {"content": content, "page": page, "size": size, "totalElements": total, "totalPages": total_pages},
        "message": "Historial del paciente obtenido correctamente",
        "success": True,
    }


# ============ Notas del expediente ============

# Roles internos que pueden crear notas. PATIENT/PACIENTE queda bloqueado.
_INTERNAL_ROLES = {"ADMIN", "RECEPTION", "RECEPCIONISTA", "DENTIST", "DENTISTA"}


def _ensure_internal_role(user: dict):
    role = ((user or {}).get("role") or {}).get("name", "")
    if role.upper() not in _INTERNAL_ROLES:
        raise HTTPException(status_code=403, detail="Tu rol no puede crear notas en el expediente")


class NoteIn(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


@router.post("/{patient_id}/notes")
async def create_note(patient_id: int, body: NoteIn, user = Depends(current_user)):
    """Crea una nota en el expediente. Solo roles internos."""
    _ensure_internal_role(user)
    text = (body.content or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="La nota no puede estar vacía")
    if not await db.patients.find_one({"id": patient_id}):
        raise HTTPException(status_code=404, detail="Paciente no encontrado")

    import uuid
    role_name = ((user.get("role") or {}).get("name") or "").upper()
    author_name = f"{user.get('name','')} {user.get('lastName','')}".strip() or user.get("email")
    note = {
        "id": str(uuid.uuid4()),
        "patientId": patient_id,
        "content": text,
        "authorId": user["id"],
        "authorName": author_name,
        "authorRole": role_name,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    await db.patient_notes.insert_one(note)
    note.pop("_id", None)  # quita el ObjectId que Mongo agregó al insertar (no serializable)

    # Bitácora del expediente
    await log_activity(
        action_code="NOTE_ADDED",
        module="PATIENTS",
        entity_type="PATIENT_NOTE",
        entity_id=note["id"],
        title="Nota agregada",
        description=text[:200] + ("…" if len(text) > 200 else ""),
        actor=user,
        patient_id=patient_id,
        metadata={"noteId": note["id"]},
    )
    return {"data": note, "message": "Nota guardada correctamente", "success": True}


@router.get("/{patient_id}/notes")
async def list_notes(patient_id: int, user = Depends(current_user)):
    """Listado de notas del expediente, más reciente primero."""
    if not await db.patients.find_one({"id": patient_id}):
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    cursor = db.patient_notes.find({"patientId": patient_id}, {"_id": 0}).sort("createdAt", -1)
    notes = [doc async for doc in cursor]
    return {"data": notes, "total": len(notes), "success": True}


# ============ Pagos del expediente ============

_PAYMENT_METHODS = {"Efectivo", "Transferencia", "Tarjeta", "Otro"}


class PaymentIn(BaseModel):
    amount: float = Field(gt=0)
    method: str
    concept: str = Field(min_length=1, max_length=200)
    paymentDate: Optional[str] = None      # YYYY-MM-DD; default = hoy local
    notes: Optional[str] = ""


async def _patient_totals(patient_id: int) -> dict:
    """Suma de pagos del paciente + presupuesto vigente.

    Reglas para `totalBudgeted`:
      - Prefiere el presupuesto abierto (DRAFT, PRESENTED, ACCEPTED, IN_EXECUTION o ACTIVE legacy).
      - Si no hay, el último FINALIZED más reciente.
      - Ignora REJECTED y CANCELLED.
    """
    paid = 0.0
    async for d in db.payments.find({"patientId": patient_id}, {"_id": 0, "amount": 1}):
        try: paid += float(d.get("amount") or 0)
        except (TypeError, ValueError): pass
    current = await db.budgets.find_one(
        {"patientId": patient_id, "status": {"$in": list(_BUDGET_OPEN)}},
        {"_id": 0, "total": 1},
        sort=[("createdAt", -1)],
    )
    if not current:
        current = await db.budgets.find_one(
            {"patientId": patient_id, "status": "FINALIZED"},
            {"_id": 0, "total": 1},
            sort=[("finalizedAt", -1), ("createdAt", -1)],
        )
    budget = float((current or {}).get("total") or 0)
    return {"paidAmount": paid, "totalBudgeted": budget, "balance": max(0.0, budget - paid)}


@router.post("/{patient_id}/payments")
async def create_payment(patient_id: int, body: PaymentIn, user = Depends(current_user)):
    """Registra un pago para el paciente. Solo roles internos (ADMIN, RECEPTION, DENTIST)."""
    _ensure_internal_role(user)
    if not await db.patients.find_one({"id": patient_id}):
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    if body.method not in _PAYMENT_METHODS:
        raise HTTPException(status_code=400, detail=f"Método inválido. Permitidos: {sorted(_PAYMENT_METHODS)}")
    concept = (body.concept or "").strip()
    if not concept:
        raise HTTPException(status_code=400, detail="Concepto obligatorio")

    import uuid
    today_local = datetime.now(timezone.utc).date().isoformat()
    pdate = (body.paymentDate or today_local).strip()
    role_name = ((user.get("role") or {}).get("name") or "").upper()
    author_name = f"{user.get('name','')} {user.get('lastName','')}".strip() or user.get("email")
    payment = {
        "id": str(uuid.uuid4()),
        "patientId": patient_id,
        "amount": round(float(body.amount), 2),
        "method": body.method,
        "concept": concept,
        "paymentDate": pdate,
        "notes": (body.notes or "").strip(),
        "createdBy": user["id"],
        "createdByName": author_name,
        "createdByRole": role_name,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    await db.payments.insert_one(payment)
    payment.pop("_id", None)

    totals = await _patient_totals(patient_id)
    await log_activity(
        action_code="PAYMENT_REGISTERED",
        module="PAYMENTS",
        entity_type="PAYMENT",
        entity_id=payment["id"],
        title="Pago registrado",
        description=f"${payment['amount']:.2f} MXN · {payment['method']} · {concept}",
        actor=user,
        patient_id=patient_id,
        metadata={"paymentId": payment["id"], "amount": payment["amount"], "method": payment["method"]},
    )
    return {"data": payment, "totals": totals, "success": True, "message": "Pago registrado correctamente"}


@router.get("/{patient_id}/payments")
async def list_payments(patient_id: int, user = Depends(current_user)):
    """Listado de pagos del paciente (más reciente primero) + totales."""
    if not await db.patients.find_one({"id": patient_id}):
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    cursor = db.payments.find({"patientId": patient_id}, {"_id": 0}).sort("createdAt", -1)
    items = [d async for d in cursor]
    totals = await _patient_totals(patient_id)
    return {"data": items, "totals": totals, "total": len(items), "success": True}


# ============ Presupuesto del paciente ============

class BudgetItemIn(BaseModel):
    # Identificador estable de la línea. Si llega vacío, se asigna uno nuevo.
    # Permite hacer match contra items existentes para detectar cambios de precio
    # y conservar el historial sin regenerar UUIDs en cada PATCH.
    id: Optional[str] = None
    name: str = Field(min_length=1, max_length=200)
    tooth: Optional[str] = ""
    description: Optional[str] = ""
    # Observaciones / detalles por línea (texto libre, opcional).
    observations: Optional[str] = ""
    qty: float = Field(gt=0)
    unitPrice: float = Field(ge=0)


class BudgetIn(BaseModel):
    name: Optional[str] = "Presupuesto general"
    items: list[BudgetItemIn]
    observations: Optional[str] = ""


@router.post("/{patient_id}/budget", deprecated=True)
async def save_budget_legacy(patient_id: int, body: BudgetIn, user = Depends(current_user)):
    """Compat. Crea un presupuesto NUEVO (ACTIVE) en lugar de hacer upsert."""
    return await _create_budget(patient_id, body, user)


@router.get("/{patient_id}/budget", deprecated=True)
async def get_budget_current(patient_id: int, user = Depends(current_user)):
    """Compat. Devuelve el presupuesto vigente (ACTIVE/DRAFT) o el último FINALIZED."""
    if not await db.patients.find_one({"id": patient_id}):
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    current = await db.budgets.find_one(
        {"patientId": patient_id, "status": {"$in": ["ACTIVE", "DRAFT"]}},
        {"_id": 0}, sort=[("createdAt", -1)],
    ) or await db.budgets.find_one(
        {"patientId": patient_id, "status": "FINALIZED"},
        {"_id": 0}, sort=[("finalizedAt", -1), ("createdAt", -1)],
    )
    totals = await _patient_totals(patient_id)
    return {"data": current, "totals": totals, "success": True}


# ----- Multi-budget endpoints -----

# Estados oficiales del presupuesto. El alias `ACTIVE` se conserva sólo
# por compatibilidad con presupuestos creados antes del refactor — se
# trata como PRESENTED. Al primer cambio se migra automáticamente.
_BUDGET_STATUSES = {"DRAFT", "PRESENTED", "ACCEPTED", "REJECTED", "IN_EXECUTION", "FINALIZED", "CANCELLED"}
_BUDGET_LEGACY_ALIAS = {"ACTIVE": "PRESENTED"}
# Los presupuestos editables permiten PATCH sobre items. IN_EXECUTION
# permite PATCH con reglas de sincronización contra el tratamiento.
_BUDGET_EDITABLE = {"DRAFT", "PRESENTED", "ACTIVE", "IN_EXECUTION"}
# Estados terminales no permiten ninguna transición de regreso.
_BUDGET_TERMINAL = {"FINALIZED", "REJECTED", "CANCELLED"}
# Estados que ocupan el slot "vigente" de un paciente (no puede haber 2 abiertos).
_BUDGET_OPEN = {"DRAFT", "PRESENTED", "ACCEPTED", "IN_EXECUTION", "ACTIVE"}


def _norm_status(s: str | None) -> str:
    """Normaliza el estado del presupuesto resolviendo aliases legacy."""
    if not s:
        return "DRAFT"
    return _BUDGET_LEGACY_ALIAS.get(s, s)


async def _create_budget(patient_id: int, body: BudgetIn, user) -> dict:
    _ensure_internal_role(user)
    if not await db.patients.find_one({"id": patient_id}):
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    if not body.items:
        raise HTTPException(status_code=400, detail="Agrega al menos un concepto")
    # No permitir crear si ya hay uno abierto (DRAFT/PRESENTED/ACCEPTED/IN_EXECUTION o ACTIVE legacy).
    open_b = await db.budgets.find_one(
        {"patientId": patient_id, "status": {"$in": list(_BUDGET_OPEN)}},
        {"_id": 0, "id": 1},
    )
    if open_b:
        raise HTTPException(
            status_code=409,
            detail="Finaliza, rechaza o cancela el presupuesto actual antes de crear uno nuevo.",
        )
    import uuid
    items = []
    total = 0.0
    for it in body.items:
        sub = round(float(it.qty) * float(it.unitPrice), 2)
        total += sub
        items.append({
            "id": (it.id or "").strip() or str(uuid.uuid4()),
            "name": it.name.strip(),
            "tooth": (it.tooth or "").strip(),
            "description": (it.description or "").strip(),
            "observations": (it.observations or "").strip(),
            "qty": float(it.qty), "unitPrice": round(float(it.unitPrice), 2),
            "subtotal": sub,
        })
    now_iso = datetime.now(timezone.utc).isoformat()
    author = f"{user.get('name','')} {user.get('lastName','')}".strip() or user.get("email")
    role = ((user.get("role") or {}).get("name") or "").upper()
    doc = {
        "id": str(uuid.uuid4()),
        "patientId": patient_id,
        "name": (body.name or "Presupuesto general").strip(),
        "items": items, "observations": (body.observations or "").strip(),
        "total": round(total, 2), "status": "DRAFT",
        "createdAt": now_iso, "createdBy": user["id"], "createdByName": author, "createdByRole": role,
        "updatedAt": now_iso, "updatedBy": user["id"],
    }
    await db.budgets.insert_one(doc)
    doc.pop("_id", None)
    await log_activity(
        action_code="BUDGET_CREATED", module="BUDGET", entity_type="BUDGET",
        entity_id=doc["id"], title="Presupuesto creado",
        description=f"{len(items)} concepto(s) · Total {doc['total']:.2f} MXN",
        actor=user, patient_id=patient_id,
        metadata={"budgetId": doc["id"], "total": doc["total"]},
    )
    totals = await _patient_totals(patient_id)
    return {"data": doc, "totals": totals, "success": True, "message": "Presupuesto creado"}


@router.get("/{patient_id}/budgets")
async def list_budgets(patient_id: int, user = Depends(current_user)):
    """Lista todos los presupuestos del paciente (más reciente primero)."""
    if not await db.patients.find_one({"id": patient_id}):
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    cursor = db.budgets.find({"patientId": patient_id}, {"_id": 0}).sort("createdAt", -1)
    items = [d async for d in cursor]
    totals = await _patient_totals(patient_id)
    return {"data": items, "total": len(items), "totals": totals, "success": True}


@router.post("/{patient_id}/budgets")
async def create_budget(patient_id: int, body: BudgetIn, user = Depends(current_user)):
    """Crea un nuevo presupuesto ACTIVE para el paciente. Falla si ya hay uno editable."""
    return await _create_budget(patient_id, body, user)


@router.patch("/{patient_id}/budgets/{budget_id}")
async def update_budget(patient_id: int, budget_id: str, body: BudgetIn, user = Depends(current_user)):
    """Actualiza el presupuesto si está en estado editable.

    Si el presupuesto está en IN_EXECUTION, también aplica sincronización
    con el tratamiento asociado (agregar/quitar actividades) bajo reglas
    estrictas. Bloquea si hay alguna actividad EN_PROCESO.
    """
    _ensure_internal_role(user)
    existing = await db.budgets.find_one({"id": budget_id, "patientId": patient_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")
    raw_status = existing.get("status")
    norm = _norm_status(raw_status)
    if norm not in _BUDGET_EDITABLE and raw_status not in _BUDGET_EDITABLE:
        raise HTTPException(status_code=409, detail=f"Presupuesto en estado {raw_status}: solo lectura")
    if not body.items:
        raise HTTPException(status_code=400, detail="Agrega al menos un concepto")

    # Tratamiento abierto asociado (sólo aplica si presupuesto está IN_EXECUTION).
    treatment = None
    if norm == "IN_EXECUTION":
        treatment = await db.treatments.find_one(
            {"budgetId": budget_id, "status": {"$in": ["ACTIVE", "PAUSED"]}},
            {"_id": 0},
        )
        if treatment:
            # Regla: si existe alguna actividad EN_PROCESO, no se permite sync.
            if any(a.get("status") == "IN_PROGRESS" for a in (treatment.get("activities") or [])):
                raise HTTPException(
                    status_code=409,
                    detail="No se puede modificar el presupuesto mientras una actividad del tratamiento está EN_PROCESO",
                )

    import uuid
    prev_items = {it.get("id"): it for it in (existing.get("items") or []) if it.get("id")}
    incoming_ids = set()

    items = []
    total = 0.0
    price_changes: list[dict] = []
    for it in body.items:
        line_id = (it.id or "").strip() or str(uuid.uuid4())
        incoming_ids.add(line_id)
        new_price = round(float(it.unitPrice), 2)
        new_qty = float(it.qty)
        sub = round(new_qty * new_price, 2)
        total += sub
        items.append({
            "id": line_id,
            "name": it.name.strip(),
            "tooth": (it.tooth or "").strip(),
            "description": (it.description or "").strip(),
            "observations": (it.observations or "").strip(),
            "qty": new_qty, "unitPrice": new_price, "subtotal": sub,
        })
        prev = prev_items.get(line_id)
        if prev is not None:
            old_price = round(float(prev.get("unitPrice") or 0), 2)
            if old_price != new_price:
                price_changes.append({
                    "itemId": line_id,
                    "itemName": it.name.strip() or (prev.get("name") or "Concepto"),
                    "oldPrice": old_price,
                    "newPrice": new_price,
                })

    # Si IN_EXECUTION: verificar que items eliminados no estén COMPLETED en el tratamiento.
    removed_item_ids = set(prev_items.keys()) - incoming_ids
    sync_added: list[dict] = []
    sync_removed: list[dict] = []
    if treatment:
        protected: list[str] = []
        for rid in removed_item_ids:
            for a in (treatment.get("activities") or []):
                if a.get("budgetItemId") == rid and a.get("status") == "COMPLETED":
                    protected.append(prev_items[rid].get("name") or rid)
        if protected:
            raise HTTPException(
                status_code=409,
                detail=(
                    "No se puede eliminar conceptos cuyas actividades ya están COMPLETADAS: "
                    + ", ".join(protected)
                    + ". Requiere una acción especial de ajuste."
                ),
            )

    # Migración lazy de ACTIVE → PRESENTED.
    new_status = "PRESENTED" if raw_status == "ACTIVE" else raw_status
    patch = {
        "name": (body.name or existing.get("name") or "Presupuesto general").strip(),
        "items": items, "observations": (body.observations or "").strip(),
        "total": round(total, 2),
        "status": new_status,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "updatedBy": user["id"],
    }
    await db.budgets.update_one({"id": budget_id}, {"$set": patch})
    updated = await db.budgets.find_one({"id": budget_id}, {"_id": 0})

    # ----- Sincronización con tratamiento (sólo si presupuesto en IN_EXECUTION) -----
    if treatment:
        now_iso = datetime.now(timezone.utc).isoformat()
        existing_activity_by_budget_item = {
            a.get("budgetItemId"): a for a in (treatment.get("activities") or [])
        }
        new_activities = list(treatment.get("activities") or [])
        # Cancelar/eliminar actividades no completadas cuyo concepto se removió.
        for rid in removed_item_ids:
            act = existing_activity_by_budget_item.get(rid)
            if act and act.get("status") in ("PENDING", "IN_PROGRESS", "POSTPONED"):
                # IN_PROGRESS no debería ocurrir aquí (bloqueamos arriba) pero quedó por simetría.
                act["status"] = "CANCELLED"
                act["cancelledAt"] = now_iso
                act["cancelledReason"] = "Eliminado del presupuesto origen"
                sync_removed.append({"activityId": act.get("id"), "name": act.get("name")})
        # Agregar nuevas actividades para items nuevos.
        existing_budget_item_ids = {a.get("budgetItemId") for a in (treatment.get("activities") or [])}
        for it_doc in items:
            if it_doc["id"] not in existing_budget_item_ids:
                new_act = {
                    "id": str(uuid.uuid4()),
                    "budgetItemId": it_doc["id"],
                    "name": it_doc["name"],
                    "qty": it_doc["qty"],
                    "unitPrice": it_doc["unitPrice"],
                    "observations": it_doc["observations"],
                    "dentistId": None,
                    "dentistName": None,
                    "status": "PENDING",
                    "createdAt": now_iso,
                }
                new_activities.append(new_act)
                sync_added.append({"activityId": new_act["id"], "name": new_act["name"]})
        # Persistir tratamiento sincronizado.
        if sync_added or sync_removed:
            await db.treatments.update_one(
                {"id": treatment["id"]},
                {"$set": {"activities": new_activities, "updatedAt": now_iso, "updatedBy": user["id"]}},
            )

    # ----- Logs de auditoría -----
    await log_activity(
        action_code="BUDGET_UPDATED", module="BUDGET", entity_type="BUDGET",
        entity_id=budget_id, title="Presupuesto actualizado",
        description=f"{len(items)} concepto(s) · Total {patch['total']:.2f} MXN",
        actor=user, patient_id=patient_id,
        metadata={"budgetId": budget_id, "total": patch["total"]},
    )

    # Logs detallados por cada cambio de precio.
    if price_changes or sync_added or sync_removed:
        patient_doc = await db.patients.find_one({"id": patient_id}, {"_id": 0, "name": 1, "lastName": 1, "expedientNumber": 1})
        patient_name = f"{(patient_doc or {}).get('name','')} {(patient_doc or {}).get('lastName','')}".strip() or "Paciente"
        expedient = (patient_doc or {}).get("expedientNumber") or ""
        budget_name = patch["name"]
        actor_name = f"{user.get('name','')} {user.get('lastName','')}".strip() or user.get("email") or "Usuario"
        for ch in price_changes:
            desc = (
                f"{actor_name} modificó el precio de {ch['itemName']} "
                f"de ${ch['oldPrice']:.2f} a ${ch['newPrice']:.2f} "
                f"en el presupuesto «{budget_name}» del paciente {patient_name}"
                f"{f', expediente {expedient}' if expedient else ''}."
            )
            await log_activity(
                action_code="BUDGET_ITEM_PRICE_CHANGED",
                module="BUDGET", entity_type="BUDGET",
                entity_id=budget_id, title="Precio de concepto modificado",
                description=desc, actor=user, patient_id=patient_id,
                metadata={
                    "budgetId": budget_id, "budgetName": budget_name,
                    "patientName": patient_name, "expedientNumber": expedient,
                    "itemId": ch["itemId"], "itemName": ch["itemName"],
                    "oldPrice": ch["oldPrice"], "newPrice": ch["newPrice"],
                },
            )
        for s in sync_added:
            await log_activity(
                action_code="TREATMENT_ACTIVITY_ADDED_FROM_BUDGET",
                module="TREATMENT", entity_type="TREATMENT_ACTIVITY",
                entity_id=s["activityId"], title="Actividad agregada por sincronización",
                description=f"Se agregó la actividad «{s['name']}» al tratamiento desde el presupuesto «{budget_name}» del paciente {patient_name}.",
                actor=user, patient_id=patient_id,
                metadata={"budgetId": budget_id, "activityId": s["activityId"], "activityName": s["name"]},
            )
        for s in sync_removed:
            await log_activity(
                action_code="TREATMENT_ACTIVITY_CANCELLED_FROM_BUDGET",
                module="TREATMENT", entity_type="TREATMENT_ACTIVITY",
                entity_id=s["activityId"], title="Actividad cancelada por sincronización",
                description=f"Se canceló la actividad «{s['name']}» del tratamiento porque se eliminó del presupuesto «{budget_name}» del paciente {patient_name}.",
                actor=user, patient_id=patient_id,
                metadata={"budgetId": budget_id, "activityId": s["activityId"], "activityName": s["name"]},
            )

    return {"data": updated, "totals": await _patient_totals(patient_id), "success": True, "message": "Presupuesto actualizado"}


# ----- Transiciones de estado del presupuesto -----

async def _transition_budget(patient_id: int, budget_id: str, *, from_states: set[str], to_state: str, action_code: str, title: str, user, extra_set: dict | None = None):
    existing = await db.budgets.find_one({"id": budget_id, "patientId": patient_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")
    cur = existing.get("status")
    cur_norm = _norm_status(cur)
    if cur_norm not in from_states and cur not in from_states:
        raise HTTPException(status_code=409, detail=f"Transición no válida desde estado {cur}")
    now_iso = datetime.now(timezone.utc).isoformat()
    set_doc = {"status": to_state, "updatedAt": now_iso, "updatedBy": user["id"], **(extra_set or {})}
    await db.budgets.update_one({"id": budget_id}, {"$set": set_doc})
    await log_activity(
        action_code=action_code, module="BUDGET", entity_type="BUDGET",
        entity_id=budget_id, title=title,
        description=f"Total {existing.get('total', 0):.2f} MXN · {existing.get('name','Presupuesto')}",
        actor=user, patient_id=patient_id,
        metadata={"budgetId": budget_id, "from": cur, "to": to_state},
    )
    return await db.budgets.find_one({"id": budget_id}, {"_id": 0})


@router.put("/{patient_id}/budgets/{budget_id}/present")
async def present_budget(patient_id: int, budget_id: str, user = Depends(current_user)):
    """DRAFT → PRESENTED. Marca el presupuesto como entregado al paciente."""
    _ensure_internal_role(user)
    updated = await _transition_budget(
        patient_id, budget_id,
        from_states={"DRAFT"}, to_state="PRESENTED",
        action_code="BUDGET_PRESENTED", title="Presupuesto presentado", user=user,
        extra_set={"presentedAt": datetime.now(timezone.utc).isoformat(), "presentedBy": user["id"]},
    )
    return {"data": updated, "totals": await _patient_totals(patient_id), "success": True, "message": "Presupuesto presentado"}


@router.put("/{patient_id}/budgets/{budget_id}/accept")
async def accept_budget(patient_id: int, budget_id: str, user = Depends(current_user)):
    """PRESENTED → ACCEPTED. El paciente aceptó el presupuesto."""
    _ensure_internal_role(user)
    updated = await _transition_budget(
        patient_id, budget_id,
        from_states={"PRESENTED", "ACTIVE"}, to_state="ACCEPTED",
        action_code="BUDGET_ACCEPTED", title="Presupuesto aceptado", user=user,
        extra_set={"acceptedAt": datetime.now(timezone.utc).isoformat(), "acceptedBy": user["id"]},
    )
    return {"data": updated, "totals": await _patient_totals(patient_id), "success": True, "message": "Presupuesto aceptado"}


@router.put("/{patient_id}/budgets/{budget_id}/reject")
async def reject_budget(patient_id: int, budget_id: str, user = Depends(current_user)):
    """PRESENTED → REJECTED."""
    _ensure_internal_role(user)
    updated = await _transition_budget(
        patient_id, budget_id,
        from_states={"PRESENTED", "ACTIVE"}, to_state="REJECTED",
        action_code="BUDGET_REJECTED", title="Presupuesto rechazado", user=user,
        extra_set={"rejectedAt": datetime.now(timezone.utc).isoformat(), "rejectedBy": user["id"]},
    )
    return {"data": updated, "totals": await _patient_totals(patient_id), "success": True, "message": "Presupuesto rechazado"}


@router.put("/{patient_id}/budgets/{budget_id}/finalize")
async def finalize_budget(patient_id: int, budget_id: str, user = Depends(current_user)):
    """Finaliza el presupuesto. Para presupuestos IN_EXECUTION el cierre debería
    venir del tratamiento (cascade). Aquí también lo permitimos cuando es DRAFT/PRESENTED
    para cerrar manualmente un presupuesto que ya no continuará."""
    _ensure_internal_role(user)
    existing = await db.budgets.find_one({"id": budget_id, "patientId": patient_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")
    cur = existing.get("status")
    if cur in _BUDGET_TERMINAL:
        raise HTTPException(status_code=409, detail=f"Presupuesto ya está {cur}")
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.budgets.update_one({"id": budget_id}, {"$set": {
        "status": "FINALIZED", "finalizedAt": now_iso, "finalizedBy": user["id"], "updatedAt": now_iso,
    }})
    await log_activity(
        action_code="BUDGET_FINALIZED", module="BUDGET", entity_type="BUDGET",
        entity_id=budget_id, title="Presupuesto finalizado",
        description=f"Total {existing.get('total', 0):.2f} MXN",
        actor=user, patient_id=patient_id, metadata={"budgetId": budget_id},
    )
    updated = await db.budgets.find_one({"id": budget_id}, {"_id": 0})
    return {"data": updated, "totals": await _patient_totals(patient_id), "success": True, "message": "Presupuesto finalizado"}


@router.put("/{patient_id}/budgets/{budget_id}/cancel")
async def cancel_budget(patient_id: int, budget_id: str, user = Depends(current_user)):
    _ensure_internal_role(user)
    existing = await db.budgets.find_one({"id": budget_id, "patientId": patient_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")
    if existing.get("status") in _BUDGET_TERMINAL:
        raise HTTPException(status_code=409, detail=f"Presupuesto ya está {existing.get('status')}")
    # Si está IN_EXECUTION, bloquear si hay un tratamiento ACTIVE/PAUSED asociado.
    if existing.get("status") == "IN_EXECUTION":
        t = await db.treatments.find_one(
            {"budgetId": budget_id, "status": {"$in": ["ACTIVE", "PAUSED"]}},
            {"_id": 0, "id": 1},
        )
        if t:
            raise HTTPException(status_code=409, detail="Cancela primero el tratamiento asociado")
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.budgets.update_one({"id": budget_id}, {"$set": {
        "status": "CANCELLED", "cancelledAt": now_iso, "cancelledBy": user["id"], "updatedAt": now_iso,
    }})
    await log_activity(
        action_code="BUDGET_CANCELLED", module="BUDGET", entity_type="BUDGET",
        entity_id=budget_id, title="Presupuesto cancelado",
        description=f"Total {existing.get('total', 0):.2f} MXN",
        actor=user, patient_id=patient_id, metadata={"budgetId": budget_id},
    )
    updated = await db.budgets.find_one({"id": budget_id}, {"_id": 0})
    return {"data": updated, "totals": await _patient_totals(patient_id), "success": True, "message": "Presupuesto cancelado"}

