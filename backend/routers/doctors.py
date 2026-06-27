"""Doctors."""
from fastapi import APIRouter, Depends, Query
from core.db import db
from core.deps import current_user

router = APIRouter(prefix="/doctors", tags=["doctors"])


@router.get("/active")
async def list_active(branchId: int = Query(1), user = Depends(current_user)):
    q = {"active": True, "availableForAppointments": True}
    if branchId:
        q["branches"] = {"$elemMatch": {"$eq": branchId}}
    items = []
    async for d in db.doctors.find(q, {"_id": 0}).sort("name", 1):
        full_name = d.get("fullName") or f"{d.get('name','')} {d.get('lastName','')}".strip()
        items.append({
            "id": d["id"],
            "name": d.get("name", ""),
            "lastName": d.get("lastName", ""),
            "fullName": full_name,
            "specialty": d.get("specialty"),
            "active": True,
            "availableForAppointments": True,
        })
    return items
