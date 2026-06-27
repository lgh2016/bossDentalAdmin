"""Helper para secuencias atómicas (reemplazo de auto-increment en Mongo)."""
from core.db import db


async def next_seq(name: str) -> int:
    doc = await db.counters.find_one_and_update(
        {"_id": name},
        {"$inc": {"value": 1}},
        upsert=True,
        return_document=True,
    )
    return doc["value"] if doc else 1
