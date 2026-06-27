"""Branches — sucursales y excepciones de horario."""
from fastapi import APIRouter, Depends
from core.db import db
from core.deps import current_user

router = APIRouter(prefix="/branches", tags=["branches"])


@router.get("")
async def list_branches(user = Depends(current_user)):
    items = []
    async for b in db.branches.find({}, {"_id": 0}).sort("id", 1):
        items.append(b)
    return items


@router.get("/{branch_id}")
async def branch_detail(branch_id: int, user = Depends(current_user)):
    b = await db.branches.find_one({"id": branch_id}, {"_id": 0})
    if not b:
        return {"data": None, "message": "Sucursal no encontrada", "success": False}
    return {"data": b, "success": True}
