"""Seed idempotente de Boss Dental.

Reglas:
- NO sobrescribe correos, contraseñas ni nombres existentes.
- Sólo agrega campos faltantes necesarios para funcionamiento.
- NO crea pacientes demo.

Ejecutar: `python -m seed` desde /app/backend
"""
import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from core.db import db  # noqa: E402
from core.security import hash_password  # noqa: E402
from utils.ids import next_seq  # noqa: E402


ROLES = [
    {"id": 1, "name": "ADMIN", "description": "Administrador"},
    {"id": 2, "name": "RECEPTION", "description": "Recepción"},
    {"id": 3, "name": "DENTIST", "description": "Dentista"},
]

BRANCHES = [
    {"id": 1, "name": "Boss Dental", "address": "Sucursal principal", "active": True, "capacity": 4},
]

USERS = [
    {
        "email": "admin@bossdental.com",
        "name": "Admin",
        "lastName": "Boss",
        "password": "admin123",
        "role": {"id": 1, "name": "ADMIN", "description": "Administrador"},
        "branch": {"id": 1, "name": "Boss Dental"},
        "active": True,
    },
    {
        "email": "reception@bossdental.com",
        "name": "Recepción",
        "lastName": "Boss",
        "password": "admin1234",
        "role": {"id": 2, "name": "RECEPTION", "description": "Recepción"},
        "branch": {"id": 1, "name": "Boss Dental"},
        "active": True,
    },
    {
        "email": "dentist@bossdental.com",
        "name": "Carlos",
        "lastName": "Hernández",
        "password": "dentist123",
        "role": {"id": 3, "name": "DENTIST", "description": "Dentista"},
        "branch": {"id": 1, "name": "Boss Dental"},
        "doctorId": 1,  # Link a Doctor.id=1 (Carlos Hernández)
        "active": True,
    },
]

DOCTORS = [
    {"name": "Carlos", "lastName": "Hernández", "specialty": "Ortodoncia"},
    {"name": "María", "lastName": "González", "specialty": "Endodoncia"},
    {"name": "Luis", "lastName": "Martínez", "specialty": "Odontopediatría"},
    {"name": "Ana", "lastName": "Ramírez", "specialty": "Periodoncia"},
]


async def _ensure_role(role: dict) -> None:
    existing = await db.roles.find_one({"name": role["name"]})
    if not existing:
        await db.roles.insert_one(role)
        print(f"  ✓ Role created: {role['name']}")
        return
    # idempotente: sólo agregar campos faltantes
    patch = {k: v for k, v in role.items() if k not in existing or existing.get(k) is None}
    if patch:
        await db.roles.update_one({"_id": existing["_id"]}, {"$set": patch})
        print(f"  · Role patched (missing fields): {role['name']} → {list(patch.keys())}")


async def _ensure_branch(branch: dict) -> None:
    existing = await db.branches.find_one({"id": branch["id"]})
    if not existing:
        await db.branches.insert_one(branch)
        print(f"  ✓ Branch created: {branch['name']}")
        return
    patch = {k: v for k, v in branch.items() if k not in existing or existing.get(k) is None}
    if patch:
        await db.branches.update_one({"_id": existing["_id"]}, {"$set": patch})
        print(f"  · Branch patched (missing fields): {branch['name']} → {list(patch.keys())}")


async def _ensure_user(u: dict) -> None:
    email = u["email"].lower()
    existing = await db.users.find_one({"email": email})
    if not existing:
        seq = await next_seq("user")
        doc = {
            "id": str(seq),
            "email": email,
            "name": u["name"],
            "lastName": u["lastName"],
            "passwordHash": hash_password(u["password"]),
            "role": u["role"],
            "branch": u["branch"],
            "active": u.get("active", True),
        }
        if u.get("doctorId") is not None:
            doc["doctorId"] = u["doctorId"]
        await db.users.insert_one(doc)
        print(f"  ✓ User created: {email}")
        return
    # idempotente: NO sobrescribir email/password/name. Sólo agregar campos faltantes para funcionamiento.
    patch = {}
    required_fields = {
        "id": existing.get("id") or str(await next_seq("user")),
        "role": u["role"],
        "branch": u["branch"],
        "active": True,
    }
    # Sólo añade doctorId si el seed lo trae (caso DENTIST)
    if u.get("doctorId") is not None:
        required_fields["doctorId"] = u["doctorId"]
    for k, default in required_fields.items():
        if k not in existing or existing.get(k) is None:
            patch[k] = default
    # Si no tiene passwordHash, ponemos uno (no podemos respetar lo que ya tenía si no existe)
    if "passwordHash" not in existing or not existing.get("passwordHash"):
        patch["passwordHash"] = hash_password(u["password"])
    if patch:
        await db.users.update_one({"_id": existing["_id"]}, {"$set": patch})
        print(f"  · User patched (missing fields): {email} → {list(patch.keys())}")
    else:
        print(f"  = User already complete: {email}")


async def _ensure_doctor(d: dict) -> None:
    existing = await db.doctors.find_one({
        "name": d["name"],
        "lastName": d["lastName"],
    })
    if not existing:
        seq = await next_seq("doctor")
        doc = {
            "id": seq,
            "name": d["name"],
            "lastName": d["lastName"],
            "fullName": f"{d['name']} {d['lastName']}",
            "specialty": d["specialty"],
            "active": True,
            "availableForAppointments": True,
            "branches": [1],
        }
        await db.doctors.insert_one(doc)
        print(f"  ✓ Doctor created: {doc['fullName']}")
        return
    patch = {}
    defaults = {
        "fullName": f"{existing.get('name', d['name'])} {existing.get('lastName', d['lastName'])}",
        "specialty": d["specialty"],
        "active": True,
        "availableForAppointments": True,
        "branches": [1],
    }
    for k, v in defaults.items():
        if k not in existing or existing.get(k) is None:
            patch[k] = v
    if patch:
        await db.doctors.update_one({"_id": existing["_id"]}, {"$set": patch})
        print(f"  · Doctor patched (missing fields): {existing.get('name')} {existing.get('lastName')} → {list(patch.keys())}")


async def main():
    print("→ Seeding Boss Dental (idempotent)...")
    print("• Roles")
    for r in ROLES:
        await _ensure_role(r)
    print("• Branches")
    for b in BRANCHES:
        await _ensure_branch(b)
    print("• Users")
    for u in USERS:
        await _ensure_user(u)
    print("• Doctors")
    for d in DOCTORS:
        await _ensure_doctor(d)
    print("✓ Seed completed.")


if __name__ == "__main__":
    asyncio.run(main())
