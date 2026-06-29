from uuid import UUID
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.db.session import get_db
from app.api.deps import get_current_user
from app.models.models import AppUser, AuditLog
from app.schemas.audit import AuditLogResponse

router = APIRouter()

@router.get("", response_model=List[AuditLogResponse])
def get_audit_logs(
    run_id: Optional[UUID] = Query(None, description="Filter by run ID"),
    action: Optional[str] = Query(None, description="Filter by action name"),
    entity_type: Optional[str] = Query(None, description="Filter by entity type"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_user: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(AuditLog).filter(AuditLog.org_id == current_user.org_id)
    
    if run_id:
        query = query.filter(AuditLog.run_id == run_id)
    if action:
        query = query.filter(AuditLog.action == action)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
        
    logs = query.order_by(desc(AuditLog.created_at)).offset(skip).limit(limit).all()
    return logs
