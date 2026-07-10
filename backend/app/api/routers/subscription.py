from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.subscription import SubscriptionResponse, SubscriptionUpdateRequest
from app.models.models import User, Subscription
from app.api.dependencies.auth import get_current_user

router = APIRouter()

@router.get("/workspace/subscription", response_model=SubscriptionResponse)
def get_subscription(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Solo/admin logic could be applied here if needed, but pdf says solo/admin
    if current_user.role != "admin" and current_user.workspace.type != "solo":
        # For simplicity, assuming members cannot view billing as per PDF
        raise HTTPException(status_code=403, detail="Not authorized to view subscription")
        
    subscription = db.query(Subscription).filter(Subscription.workspace_id == current_user.workspace_id).first()
    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription not found")
        
    return SubscriptionResponse(
        plan=subscription.plan,
        status=subscription.status,
        seats=subscription.seats,
        renews_at=subscription.renews_at
    )

@router.post("/workspace/subscription", response_model=SubscriptionResponse)
def create_subscription(data: SubscriptionUpdateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can modify subscription")
        
    subscription = db.query(Subscription).filter(Subscription.workspace_id == current_user.workspace_id).first()
    if subscription:
        # Update existing
        if data.plan: subscription.plan = data.plan
        if data.seats is not None: subscription.seats = data.seats
        if data.status: subscription.status = data.status
    else:
        subscription = Subscription(
            workspace_id=current_user.workspace_id,
            plan=data.plan,
            status=data.status,
            seats=data.seats or 1
        )
        db.add(subscription)
        
    db.commit()
    db.refresh(subscription)
    
    return SubscriptionResponse(
        plan=subscription.plan,
        status=subscription.status,
        seats=subscription.seats,
        renews_at=subscription.renews_at
    )

@router.patch("/workspace/subscription", response_model=SubscriptionResponse)
def update_subscription(data: SubscriptionUpdateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can modify subscription")
        
    subscription = db.query(Subscription).filter(Subscription.workspace_id == current_user.workspace_id).first()
    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription not found")
        
    if data.plan: subscription.plan = data.plan
    if data.seats is not None: subscription.seats = data.seats
    if data.status: subscription.status = data.status
        
    db.commit()
    db.refresh(subscription)
    
    return SubscriptionResponse(
        plan=subscription.plan,
        status=subscription.status,
        seats=subscription.seats,
        renews_at=subscription.renews_at
    )
