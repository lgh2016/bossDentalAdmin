"""Admin — gestión de doctores. Sólo accesible para rol ADMIN.

Reglas:
- Crear doctor (opcional: crear también user DENTIST ligado vía `doctorId`).
- Editar nombre, apellido, correo, especialidad.
- Activar / desactivar (active=false → no cuenta para capacidad).
- Cambiar disponibilidad para citas (availableForAppointments=false → no cuenta para capacidad).
- Cambiar contraseña del user ligado.
- NO se permite borrar doctores con historial — sólo desactivar.
"""
import re
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr

from core.db import db
from core.deps import require_roles
from core.security import hash_password
from utils.ids import next_seq

router = APIRouter(prefix="/admin/doctors", tags=["admin-doctors"])

EMAIL_RX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ---------- modelos ----------

class DoctorCreateIn(BaseModel):
    name: str
    lastName: str
    specialty: Optional[str] = ""
    email: Optional[EmailStr] = None        # si se pasa, crea usuario DENTIST
    password: Optional[str] = None          # contraseña inicial del usuario (si email)
    branches: Optional[list[int]] = None
    active: Optional[bool] = True
    availableForAppointments: Optional[bool] = True


class DoctorUpdateIn(BaseModel):
    name: Optional[str] = None
    lastName: Optional[str] = None
    specialty: Optional[str] = None
    email: Optional[EmailStr] = None
    branches: Optional[list[int]] = None
    active: Optional[bool] = None
    availableForAppointments: Optional[bool] = None


class PasswordIn(BaseModel):
    newPassword: str


def _serialize_doctor(d: dict, user: dict | None) -> dict:
    full = d.get("fullName") or f"{d.get('name','')} {d.get('lastName','')}".strip()
    return {
        "id": d["id"],
        "name": d.get("name"),
        "lastName": d.get("lastName"),
        "fullName": full,
        "specialty": d.get("specialty"),
        "branches": d.get("branches", []),
        "active": bool(d.get("active", True)),
        "availableForAppointments": bool(d.get("availableForAppointments", True)),
        "user": ({
            "id": user.get("id"),
            "email": user.get("email"),
            "active": bool(user.get("active", True)),
        } if user else None),
    }


async def _find_user_for_doctor(doctor_id: int) -> dict | None:
    return await db.users.find_one({"doctorId": doctor_id}, {"_id": 0, "passwordHash": 0})


# ---------- endpoints ----------

@router.get("")
async def list_doctors(includeInactive: bool = Query(True), _admin = Depends(require_roles("ADMIN"))):
    q = {}
    if not includeInactive:
        q["active"] = True
    out = []
    async for d in db.doctors.find(q, {"_id": 0}).sort([("active", -1), ("fullName", 1)]):
        u = await _find_user_for_doctor(d["id"])
        out.append(_serialize_doctor(d, u))
    return out


@router.get("/{doctor_id}")
async def get_doctor(doctor_id: int, _admin = Depends(require_roles("ADMIN"))):
    d = await db.doctors.find_one({"id": doctor_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Doctor no existe")
    return _serialize_doctor(d, await _find_user_for_doctor(doctor_id))


@router.post("")
async def create_doctor(body: DoctorCreateIn, admin = Depends(require_roles("ADMIN"))):
    full = f"{body.name.strip()} {body.lastName.strip()}".strip()
    if not full:
        raise HTTPException(status_code=400, detail="Nombre y apellido son obligatorios")
    seq = await next_seq("doctor")
    doc = {
        "id": seq,
        "name": body.name.strip(),
        "lastName": body.lastName.strip(),
        "fullName": full,
        "specialty": (body.specialty or "").strip(),
        "active": bool(body.active if body.active is not None else True),
        "availableForAppointments": bool(body.availableForAppointments if body.availableForAppointments is not None else True),
        "branches": body.branches or [1],
    }
    await db.doctors.insert_one(doc)
    created_user = None
    if body.email:
        email_l = str(body.email).lower()
        if await db.users.find_one({"email": email_l}):
            # Rollback doctor para no dejar huérfano
            await db.doctors.delete_one({"id": seq})
            raise HTTPException(status_code=409, detail="Ya existe un usuario con ese correo")
        if not body.password or len(body.password) < 6:
            await db.doctors.delete_one({"id": seq})
            raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 6 caracteres")
        user_seq = await next_seq("user")
        user_doc = {
            "id": str(user_seq),
            "email": email_l,
            "name": body.name.strip(),
            "lastName": body.lastName.strip(),
            "passwordHash": hash_password(body.password),
            "role": {"id": 3, "name": "DENTIST", "description": "Dentista"},
            "branch": {"id": (body.branches or [1])[0], "name": "Boss Dental"},
            "doctorId": seq,
            "active": True,
        }
        await db.users.insert_one(user_doc)
        created_user = user_doc
    return _serialize_doctor(doc, created_user)


@router.put("/{doctor_id}")
async def update_doctor(doctor_id: int, body: DoctorUpdateIn, admin = Depends(require_roles("ADMIN"))):
    d = await db.doctors.find_one({"id": doctor_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Doctor no existe")
    patch: dict = {}
    if body.name is not None and body.name.strip(): patch["name"] = body.name.strip()
    if body.lastName is not None and body.lastName.strip(): patch["lastName"] = body.lastName.strip()
    if body.specialty is not None: patch["specialty"] = body.specialty.strip()
    if body.branches is not None: patch["branches"] = body.branches
    if body.active is not None: patch["active"] = bool(body.active)
    if body.availableForAppointments is not None: patch["availableForAppointments"] = bool(body.availableForAppointments)
    if "name" in patch or "lastName" in patch:
        patch["fullName"] = f"{patch.get('name', d.get('name',''))} {patch.get('lastName', d.get('lastName',''))}".strip()
    if patch:
        await db.doctors.update_one({"id": doctor_id}, {"$set": patch})

    # Sincronizar user ligado (correo, nombre, activo)
    user = await db.users.find_one({"doctorId": doctor_id})
    if user:
        upatch: dict = {}
        if body.email and str(body.email).lower() != user["email"]:
            email_l = str(body.email).lower()
            if await db.users.find_one({"email": email_l, "_id": {"$ne": user["_id"]}}):
                raise HTTPException(status_code=409, detail="Ya existe otro usuario con ese correo")
            upatch["email"] = email_l
        if "name" in patch: upatch["name"] = patch["name"]
        if "lastName" in patch: upatch["lastName"] = patch["lastName"]
        if body.active is not None: upatch["active"] = bool(body.active)
        if upatch:
            await db.users.update_one({"_id": user["_id"]}, {"$set": upatch})

    # Devolver fresco
    d = await db.doctors.find_one({"id": doctor_id}, {"_id": 0})
    return _serialize_doctor(d, await _find_user_for_doctor(doctor_id))


@router.put("/{doctor_id}/password")
async def change_password(doctor_id: int, body: PasswordIn, admin = Depends(require_roles("ADMIN"))):
    if not body.newPassword or len(body.newPassword) < 6:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 6 caracteres")
    user = await db.users.find_one({"doctorId": doctor_id})
    if not user:
        raise HTTPException(status_code=404, detail="El doctor no tiene usuario ligado")
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"passwordHash": hash_password(body.newPassword)}})
    return {"ok": True, "doctorId": doctor_id, "userEmail": user["email"]}
