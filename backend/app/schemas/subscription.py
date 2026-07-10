from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.models.models import SubscriptionPlan, SubscriptionStatus

class SubscriptionUpdateRequest(BaseModel):
    plan: Optional[SubscriptionPlan] = None
    seats: Optional[int] = None
    status: Optional[SubscriptionStatus] = None

class SubscriptionResponse(BaseModel):
    plan: SubscriptionPlan
    status: SubscriptionStatus
    seats: int
    renews_at: Optional[datetime] = None
