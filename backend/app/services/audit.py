from uuid import UUID
from typing import Any, Dict
from sqlalchemy.orm import Session
from app.models.models import AuditLog

def log_audit(
    db: Session,
    org_id: UUID,
    action: str,
    entity_type: str,
    run_id: UUID | None = None,
    user_id: UUID | None = None,
    entity_id: UUID | None = None,
    details: Dict[str, Any] | None = None
) -> AuditLog:
    db_log = AuditLog(
        org_id=org_id,
        run_id=run_id,
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details
    )
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return db_log
