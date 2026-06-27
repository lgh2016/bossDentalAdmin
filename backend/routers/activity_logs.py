"""Activity logs — bitácora global del sistema.

GET /activity-logs?page=&size= → { data: { content, page, size, totalElements, totalPages }, message, success }
"""
from fastapi import APIRouter, Depends, Query

from core.db import db
from core.deps import current_user

router = APIRouter(prefix="/activity-logs", tags=["activity-logs"])


@router.get("")
async def list_logs(
    page: int = Query(0, ge=0),
    size: int = Query(20, ge=1, le=100),
    user = Depends(current_user),
):
    q = {}
    total = await db.activity_logs.count_documents(q)
    cursor = (
        db.activity_logs.find(q, {"_id": 0})
        .sort("createdAt", -1)
        .skip(page * size)
        .limit(size)
    )
    content = [doc async for doc in cursor]
    total_pages = (total + size - 1) // size if total else 0
    return {
        "data": {
            "content": content,
            "page": page,
            "size": size,
            "totalElements": total,
            "totalPages": total_pages,
        },
        "message": "Actividad obtenida correctamente",
        "success": True,
    }
