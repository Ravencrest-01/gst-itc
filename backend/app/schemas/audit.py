from uuid import UUID
from datetime import datetime
from typing import Dict, Any, Optional
from pydantic import BaseModel, ConfigDict

class AuditLogResponse(BaseModel):
    id: UUID
    org_id: UUID
    run_id: Optional[UUID] = None
    user_id: Optional[UUID] = None
    action: str
    entity_type: str
    entity_id: Optional[UUID] = None
    details: Optional[Dict[str, Any]] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
