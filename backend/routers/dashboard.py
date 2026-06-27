"""Dashboard — métricas y agenda del día.

GET /dashboard/appointments/today/count → { total }
GET /dashboard/appointments/today?page=&size= → { content, page, size, totalElements, totalPages }
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query

from core.db import db
from core.deps import current_user

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _today_iso() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _today_query(user) -> dict:
    branch_id = (user.get("branch") or {}).get("id") or 1
    return {
        "branchId": branch_id,
        "appointmentDate": _today_iso(),
        "statusCode": {"$nin": ["LOCKED", "CANCELLED"]},
    }


@router.get("/appointments/today/count")
async def today_count(user = Depends(current_user)):
    total = await db.appointments.count_documents(_today_query(user))
    return {"total": total}


@router.get("/appointments/today")
async def today_paged(
    page: int = Query(0, ge=0),
    size: int = Query(10, ge=1, le=100),
    user = Depends(current_user),
):
    q = _today_query(user)
    total = await db.appointments.count_documents(q)
    cursor = (
        db.appointments.find(q, {"_id": 0})
        .sort([("startTime", 1)])
        .skip(page * size)
        .limit(size)
    )
    items = []
    async for a in cursor:
        patient = await db.patients.find_one({"id": a.get("patientId")}, {"_id": 0}) or {}
        patient_name = f"{patient.get('name', '')} {patient.get('lastName', '')}".strip() or "—"
        start = (a.get("startTime") or "")[:5]
        items.append({
            "appointmentId": a["id"],
            "time": start,
            "patientName": patient_name,
            "patientId": a.get("patientId"),
            "reason": a.get("reason") or "—",
            "doctorName": a.get("doctorName") or "—",
            "branchName": a.get("branchName") or "—",
            "statusCode": a.get("statusCode"),
            "statusName": a.get("statusName") or "Programada",
            "statusColor": a.get("statusColor") or "BLUE",
        })
    total_pages = (total + size - 1) // size if total else 0
    return {
        "content": items,
        "page": page,
        "size": size,
        "totalElements": total,
        "totalPages": total_pages,
    }
