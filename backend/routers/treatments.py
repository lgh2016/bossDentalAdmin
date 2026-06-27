"""Tratamientos del paciente.

Reglas de negocio:
- Un tratamiento sólo puede crearse desde un presupuesto en estado ACCEPTED.
- Al crear el tratamiento, el presupuesto pasa a IN_EXECUTION (cascade).
- Sólo puede existir un tratamiento abierto (ACTIVE/PAUSED) por paciente.
- Las actividades del tratamiento se copian de los conceptos del presupuesto y
  se congelan al momento de creación. Cada actividad guarda `budgetItemId` para
  permitir sincronizar cambios posteriores (manejado en `routers/patients.py`
  dentro del PATCH del presupuesto).
- Finalizar el tratamiento requiere que TODAS las actividades estén COMPLETED
  (o CANCELLED por sincronización); al finalizar, el presupuesto asociado pasa
  automáticamente a FINALIZED.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.db import db
from core.deps import current_user
from core.audit import log_activity

router = APIRouter(prefix="/patients", tags=["treatments"])

_INTERNAL_ROLES = {"ADMIN", "RECEPTION", "RECEPCIONISTA", "DENTIST", "DENTISTA"}

_ACTIVITY_STATUSES = {"PENDING", "IN_PROGRESS", "COMPLETED", "POSTPONED", "CANCELLED"}
_TREATMENT_STATUSES = {"ACTIVE", "PAUSED", "FINALIZED", "CANCELLED"}
_TREATMENT_OPEN = {"ACTIVE", "PAUSED"}
_TREATMENT_TERMINAL = {"FINALIZED", "CANCELLED"}


def _ensure_internal_role(user: dict):
    role = ((user or {}).get("role") or {}).get("name", "")
    if role.upper() not in _INTERNAL_ROLES:
        raise HTTPException(status_code=403, detail="Tu rol no puede gestionar tratamientos")


def _compute_progress(activities: list[dict]) -> dict:
    """Calcula avance del tratamiento. Las CANCELLED no cuentan al total."""
    eligible = [a for a in (activities or []) if a.get("status") != "CANCELLED"]
    total = len(eligible)
    done = sum(1 for a in eligible if a.get("status") == "COMPLETED")
    percent = round((done / total) * 100) if total else 0
    return {"completed": done, "total": total, "percent": percent}


def _serialize_treatment(t: dict) -> dict:
    out = {k: v for k, v in t.items() if k != "_id"}
    out["progress"] = _compute_progress(out.get("activities") or [])
    return out


# ---------- Crear tratamiento ----------

class TreatmentCreateIn(BaseModel):
    budgetId: str
    dentistId: Optional[int] = None  # opcional al crear


@router.post("/{patient_id}/treatments")
async def create_treatment(patient_id: int, body: TreatmentCreateIn, user = Depends(current_user)):
    _ensure_internal_role(user)
    patient = await db.patients.find_one({"id": patient_id}, {"_id": 0})
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    budget = await db.budgets.find_one({"id": body.budgetId, "patientId": patient_id}, {"_id": 0})
    if not budget:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")
    if budget.get("status") != "ACCEPTED":
        raise HTTPException(
            status_code=409,
            detail="Sólo se puede iniciar tratamiento desde un presupuesto ACEPTADO",
        )
    # Sólo un tratamiento abierto por paciente.
    open_t = await db.treatments.find_one(
        {"patientId": patient_id, "status": {"$in": list(_TREATMENT_OPEN)}},
        {"_id": 0, "id": 1},
    )
    if open_t:
        raise HTTPException(
            status_code=409,
            detail="Ya existe un tratamiento abierto. Finaliza o cancela el actual antes de iniciar otro.",
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    author = f"{user.get('name','')} {user.get('lastName','')}".strip() or user.get("email")
    role = ((user.get("role") or {}).get("name") or "").upper()

    # Congelar actividades desde los items del presupuesto.
    activities = []
    for it in (budget.get("items") or []):
        activities.append({
            "id": str(uuid.uuid4()),
            "budgetItemId": it.get("id"),
            "name": it.get("name") or "Concepto",
            "qty": float(it.get("qty") or 1),
            "unitPrice": float(it.get("unitPrice") or 0),
            "observations": it.get("observations") or "",
            "dentistId": body.dentistId,
            "dentistName": None,
            "status": "PENDING",
            "createdAt": now_iso,
        })
    if body.dentistId:
        d = await db.doctors.find_one({"id": body.dentistId}, {"_id": 0, "name": 1})
        if d:
            for a in activities:
                a["dentistName"] = d.get("name")

    doc = {
        "id": str(uuid.uuid4()),
        "patientId": patient_id,
        "budgetId": body.budgetId,
        "budgetName": budget.get("name") or "Presupuesto",
        "status": "ACTIVE",
        "activities": activities,
        "createdAt": now_iso, "createdBy": user["id"], "createdByName": author, "createdByRole": role,
        "updatedAt": now_iso, "updatedBy": user["id"],
    }
    await db.treatments.insert_one(doc)
    doc.pop("_id", None)

    # Cascade: presupuesto → IN_EXECUTION.
    await db.budgets.update_one(
        {"id": body.budgetId},
        {"$set": {"status": "IN_EXECUTION", "inExecutionAt": now_iso, "updatedAt": now_iso, "updatedBy": user["id"]}},
    )

    full_name = f"{patient.get('name','')} {patient.get('lastName','')}".strip() or "Paciente"
    await log_activity(
        action_code="TREATMENT_STARTED", module="TREATMENT", entity_type="TREATMENT",
        entity_id=doc["id"], title="Tratamiento iniciado",
        description=f"Tratamiento iniciado desde el presupuesto «{budget.get('name')}» del paciente {full_name} con {len(activities)} actividad(es).",
        actor=user, patient_id=patient_id,
        metadata={
            "treatmentId": doc["id"], "budgetId": body.budgetId,
            "patientName": full_name, "expedientNumber": patient.get("expedientNumber"),
            "activityCount": len(activities),
        },
    )
    return {"data": _serialize_treatment(doc), "success": True, "message": "Tratamiento iniciado"}


# ---------- Lista / detalle ----------

@router.get("/{patient_id}/treatments")
async def list_treatments(patient_id: int, user = Depends(current_user)):
    if not await db.patients.find_one({"id": patient_id}):
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    cursor = db.treatments.find({"patientId": patient_id}, {"_id": 0}).sort("createdAt", -1)
    items = [_serialize_treatment(d) async for d in cursor]
    return {"data": items, "total": len(items), "success": True}


@router.get("/{patient_id}/treatments/{treatment_id}")
async def get_treatment(patient_id: int, treatment_id: str, user = Depends(current_user)):
    t = await db.treatments.find_one({"id": treatment_id, "patientId": patient_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Tratamiento no encontrado")
    return {"data": _serialize_treatment(t), "success": True}


# ---------- Actualizar actividad ----------

class ActivityUpdateIn(BaseModel):
    status: Optional[str] = None              # PENDING/IN_PROGRESS/COMPLETED/POSTPONED/CANCELLED
    dentistId: Optional[int] = None
    note: Optional[str] = Field(default=None, max_length=500)
    # Resultado de la consulta (atajos UI):
    # "completed" → COMPLETED, "continues" → IN_PROGRESS, "not_done" → POSTPONED
    outcome: Optional[str] = None


_OUTCOME_MAP = {"completed": "COMPLETED", "continues": "IN_PROGRESS", "not_done": "POSTPONED"}


async def _patient_brief(patient_id: int) -> dict:
    p = await db.patients.find_one({"id": patient_id}, {"_id": 0, "name": 1, "lastName": 1, "expedientNumber": 1})
    full = f"{(p or {}).get('name','')} {(p or {}).get('lastName','')}".strip()
    return {"name": full or "Paciente", "expedient": (p or {}).get("expedientNumber") or ""}


@router.patch("/{patient_id}/treatments/{treatment_id}/activities/{activity_id}")
async def update_activity(
    patient_id: int, treatment_id: str, activity_id: str,
    body: ActivityUpdateIn, user = Depends(current_user),
):
    _ensure_internal_role(user)
    t = await db.treatments.find_one({"id": treatment_id, "patientId": patient_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Tratamiento no encontrado")
    if t.get("status") in _TREATMENT_TERMINAL:
        raise HTTPException(status_code=409, detail=f"Tratamiento {t.get('status')}: solo lectura")

    activities = list(t.get("activities") or [])
    idx = next((i for i, a in enumerate(activities) if a.get("id") == activity_id), -1)
    if idx == -1:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    act = activities[idx]
    if act.get("status") == "CANCELLED":
        raise HTTPException(status_code=409, detail="Actividad cancelada: solo lectura")

    # Resolver nuevo estado.
    new_status = None
    if body.outcome:
        mapped = _OUTCOME_MAP.get(body.outcome)
        if not mapped:
            raise HTTPException(status_code=400, detail=f"Outcome inválido: {body.outcome}")
        new_status = mapped
    elif body.status:
        if body.status not in _ACTIVITY_STATUSES:
            raise HTTPException(status_code=400, detail=f"Estado inválido: {body.status}")
        new_status = body.status

    now_iso = datetime.now(timezone.utc).isoformat()
    changed = False
    action_code = None
    action_title = None
    if new_status and new_status != act.get("status"):
        old_status = act.get("status")
        act["status"] = new_status
        if new_status == "IN_PROGRESS":
            act["startedAt"] = act.get("startedAt") or now_iso
            action_code, action_title = "TREATMENT_ACTIVITY_STARTED", "Actividad iniciada"
        elif new_status == "COMPLETED":
            act["completedAt"] = now_iso
            action_code, action_title = "TREATMENT_ACTIVITY_COMPLETED", "Actividad completada"
        elif new_status == "POSTPONED":
            act["postponedAt"] = now_iso
            action_code, action_title = "TREATMENT_ACTIVITY_POSTPONED", "Actividad pospuesta"
        elif new_status == "CANCELLED":
            act["cancelledAt"] = now_iso
            action_code, action_title = "TREATMENT_ACTIVITY_CANCELLED", "Actividad cancelada"
        elif new_status == "PENDING":
            action_code, action_title = "TREATMENT_ACTIVITY_RESET", "Actividad marcada pendiente"
        act["lastTransitionFrom"] = old_status
        changed = True

    if body.dentistId is not None and body.dentistId != act.get("dentistId"):
        act["dentistId"] = body.dentistId
        d = await db.doctors.find_one({"id": body.dentistId}, {"_id": 0, "name": 1}) if body.dentistId else None
        act["dentistName"] = (d or {}).get("name")
        changed = True
        if not action_code:
            action_code, action_title = "TREATMENT_ACTIVITY_DOCTOR_ASSIGNED", "Doctor asignado a actividad"

    if body.note:
        act.setdefault("notes", []).append({
            "id": str(uuid.uuid4()), "text": body.note.strip(),
            "by": user["id"], "at": now_iso,
        })
        changed = True
        if not action_code:
            action_code, action_title = "TREATMENT_ACTIVITY_NOTE", "Nota agregada a actividad"

    if not changed:
        return {"data": _serialize_treatment(t), "success": True, "message": "Sin cambios"}

    await db.treatments.update_one(
        {"id": treatment_id},
        {"$set": {"activities": activities, "updatedAt": now_iso, "updatedBy": user["id"]}},
    )
    refreshed = await db.treatments.find_one({"id": treatment_id}, {"_id": 0})

    brief = await _patient_brief(patient_id)
    await log_activity(
        action_code=action_code, module="TREATMENT", entity_type="TREATMENT_ACTIVITY",
        entity_id=activity_id, title=action_title,
        description=f"{action_title}: «{act.get('name')}» en el tratamiento del paciente {brief['name']}.",
        actor=user, patient_id=patient_id,
        metadata={
            "treatmentId": treatment_id, "activityId": activity_id,
            "activityName": act.get("name"), "newStatus": act.get("status"),
            "patientName": brief["name"], "expedientNumber": brief["expedient"],
        },
    )
    return {"data": _serialize_treatment(refreshed), "success": True, "message": action_title}


# ---------- Finalizar / Cancelar / Pausar / Reanudar ----------

@router.put("/{patient_id}/treatments/{treatment_id}/finalize")
async def finalize_treatment(patient_id: int, treatment_id: str, user = Depends(current_user)):
    _ensure_internal_role(user)
    t = await db.treatments.find_one({"id": treatment_id, "patientId": patient_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Tratamiento no encontrado")
    if t.get("status") in _TREATMENT_TERMINAL:
        raise HTTPException(status_code=409, detail=f"Tratamiento ya está {t.get('status')}")
    activities = t.get("activities") or []
    eligible = [a for a in activities if a.get("status") != "CANCELLED"]
    pending = [a for a in eligible if a.get("status") != "COMPLETED"]
    if pending:
        raise HTTPException(
            status_code=409,
            detail=f"Hay {len(pending)} actividad(es) sin completar. Completa todas antes de finalizar.",
        )
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.treatments.update_one(
        {"id": treatment_id},
        {"$set": {"status": "FINALIZED", "finalizedAt": now_iso, "finalizedBy": user["id"], "updatedAt": now_iso}},
    )
    # Cascade al presupuesto.
    await db.budgets.update_one(
        {"id": t.get("budgetId")},
        {"$set": {"status": "FINALIZED", "finalizedAt": now_iso, "finalizedBy": user["id"], "updatedAt": now_iso}},
    )
    brief = await _patient_brief(patient_id)
    await log_activity(
        action_code="TREATMENT_FINALIZED", module="TREATMENT", entity_type="TREATMENT",
        entity_id=treatment_id, title="Tratamiento finalizado",
        description=f"Tratamiento del paciente {brief['name']} finalizado con {len(eligible)} actividad(es) completadas.",
        actor=user, patient_id=patient_id,
        metadata={"treatmentId": treatment_id, "budgetId": t.get("budgetId"),
                  "patientName": brief["name"], "expedientNumber": brief["expedient"]},
    )
    refreshed = await db.treatments.find_one({"id": treatment_id}, {"_id": 0})
    return {"data": _serialize_treatment(refreshed), "success": True, "message": "Tratamiento finalizado"}


@router.put("/{patient_id}/treatments/{treatment_id}/cancel")
async def cancel_treatment(patient_id: int, treatment_id: str, user = Depends(current_user)):
    _ensure_internal_role(user)
    t = await db.treatments.find_one({"id": treatment_id, "patientId": patient_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Tratamiento no encontrado")
    if t.get("status") in _TREATMENT_TERMINAL:
        raise HTTPException(status_code=409, detail=f"Tratamiento ya está {t.get('status')}")
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.treatments.update_one(
        {"id": treatment_id},
        {"$set": {"status": "CANCELLED", "cancelledAt": now_iso, "cancelledBy": user["id"], "updatedAt": now_iso}},
    )
    brief = await _patient_brief(patient_id)
    await log_activity(
        action_code="TREATMENT_CANCELLED", module="TREATMENT", entity_type="TREATMENT",
        entity_id=treatment_id, title="Tratamiento cancelado",
        description=f"Tratamiento del paciente {brief['name']} cancelado.",
        actor=user, patient_id=patient_id,
        metadata={"treatmentId": treatment_id, "patientName": brief["name"], "expedientNumber": brief["expedient"]},
    )
    refreshed = await db.treatments.find_one({"id": treatment_id}, {"_id": 0})
    return {"data": _serialize_treatment(refreshed), "success": True, "message": "Tratamiento cancelado"}


@router.put("/{patient_id}/treatments/{treatment_id}/pause")
async def pause_treatment(patient_id: int, treatment_id: str, user = Depends(current_user)):
    _ensure_internal_role(user)
    t = await db.treatments.find_one({"id": treatment_id, "patientId": patient_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Tratamiento no encontrado")
    if t.get("status") != "ACTIVE":
        raise HTTPException(status_code=409, detail=f"Sólo tratamientos ACTIVE pueden pausarse (actual: {t.get('status')})")
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.treatments.update_one(
        {"id": treatment_id},
        {"$set": {"status": "PAUSED", "pausedAt": now_iso, "updatedAt": now_iso}},
    )
    brief = await _patient_brief(patient_id)
    await log_activity(
        action_code="TREATMENT_PAUSED", module="TREATMENT", entity_type="TREATMENT",
        entity_id=treatment_id, title="Tratamiento pausado",
        description=f"Tratamiento del paciente {brief['name']} pausado.",
        actor=user, patient_id=patient_id,
        metadata={"treatmentId": treatment_id},
    )
    refreshed = await db.treatments.find_one({"id": treatment_id}, {"_id": 0})
    return {"data": _serialize_treatment(refreshed), "success": True, "message": "Tratamiento pausado"}


@router.put("/{patient_id}/treatments/{treatment_id}/resume")
async def resume_treatment(patient_id: int, treatment_id: str, user = Depends(current_user)):
    _ensure_internal_role(user)
    t = await db.treatments.find_one({"id": treatment_id, "patientId": patient_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Tratamiento no encontrado")
    if t.get("status") != "PAUSED":
        raise HTTPException(status_code=409, detail=f"Sólo tratamientos PAUSED pueden reanudarse (actual: {t.get('status')})")
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.treatments.update_one(
        {"id": treatment_id},
        {"$set": {"status": "ACTIVE", "resumedAt": now_iso, "updatedAt": now_iso}},
    )
    brief = await _patient_brief(patient_id)
    await log_activity(
        action_code="TREATMENT_RESUMED", module="TREATMENT", entity_type="TREATMENT",
        entity_id=treatment_id, title="Tratamiento reanudado",
        description=f"Tratamiento del paciente {brief['name']} reanudado.",
        actor=user, patient_id=patient_id,
        metadata={"treatmentId": treatment_id},
    )
    refreshed = await db.treatments.find_one({"id": treatment_id}, {"_id": 0})
    return {"data": _serialize_treatment(refreshed), "success": True, "message": "Tratamiento reanudado"}
