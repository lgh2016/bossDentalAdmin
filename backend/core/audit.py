"""Helpers compartidos para registrar logs de auditoría."""
import uuid
from datetime import datetime, timezone
from core.db import db


async def log_activity(
    *,
    action_code: str,
    module: str,
    entity_type: str,
    entity_id,
    title: str,
    description: str = "",
    actor: dict | None = None,
    patient_id: int | None = None,
    metadata: dict | None = None,
):
    """Inserta un evento de bitácora.
    actor: documento de usuario (con id, name, lastName, role.name).
    """
    actor_role = (actor or {}).get("role", {}).get("name") if actor else None
    actor_name = None
    if actor:
        actor_name = f"{actor.get('name','')} {actor.get('lastName','')}".strip() or actor.get("email")
    doc = {
        "id": str(uuid.uuid4()),
        "actionCode": action_code,
        "module": module,
        "entityType": entity_type,
        "entityId": entity_id,
        "title": title,
        "description": description,
        "actorType": "USER" if actor else "SYSTEM",
        "actorUserId": (actor or {}).get("id"),
        "actorName": actor_name,
        "actorRole": actor_role,
        "patientId": patient_id,
        "metadata": metadata,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    await db.activity_logs.insert_one(doc)
