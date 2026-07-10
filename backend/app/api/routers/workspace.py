from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.dependencies.auth import get_current_user
from app.models.models import User, Client, ReconciliationRun, RunStatus
from pydantic import BaseModel

router = APIRouter()

class DashboardKpisResponse(BaseModel):
    companies: int
    open_runs: int
    itc_at_risk: float
    match_rate: float

@router.get("/workspace/dashboard-kpis", response_model=DashboardKpisResponse)
def get_dashboard_kpis(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Mock aggregation for the dashboard
    companies_count = db.query(Client).filter(Client.workspace_id == current_user.workspace_id).count()
    open_runs_count = db.query(ReconciliationRun).filter(
        ReconciliationRun.workspace_id == current_user.workspace_id,
        ReconciliationRun.status != RunStatus.completed
    ).count()
    
    return DashboardKpisResponse(
        companies=companies_count,
        open_runs=open_runs_count,
        itc_at_risk=0.0,
        match_rate=0.0
    )
