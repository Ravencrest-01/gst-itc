from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.api.deps import get_current_user
from app.models.models import AppUser, ReconciliationRun
from app.schemas.runs import ReconciliationRunCreate, ReconciliationRunResponse
from app.services.audit import log_audit
from app.services.reconciliation import run_reconciliation

router = APIRouter()

@router.post("", response_model=ReconciliationRunResponse, status_code=status.HTTP_201_CREATED)
def create_run(
    payload: ReconciliationRunCreate,
    current_user: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    run = ReconciliationRun(
        org_id=current_user.org_id,
        created_by=current_user.id,
        tax_period=payload.tax_period,
        status="created"
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    log_audit(
        db=db,
        org_id=current_user.org_id,
        run_id=run.id,
        user_id=current_user.id,
        action="create_run",
        entity_type="reconciliation_run",
        entity_id=run.id,
        details={"tax_period": payload.tax_period}
    )

    return run

@router.get("/{id}", response_model=ReconciliationRunResponse)
def get_run(
    id: UUID,
    current_user: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    run = db.query(ReconciliationRun).filter(
        ReconciliationRun.id == id,
        ReconciliationRun.org_id == current_user.org_id
    ).first()
    
    if not run:
        raise HTTPException(status_code=404, detail="Reconciliation run not found")
    
    return run

@router.post("/{id}/reconcile", status_code=status.HTTP_202_ACCEPTED)
def reconcile_run(
    id: UUID,
    background_tasks: BackgroundTasks,
    current_user: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    run = db.query(ReconciliationRun).filter(
        ReconciliationRun.id == id,
        ReconciliationRun.org_id == current_user.org_id
    ).first()
    
    if not run:
        raise HTTPException(status_code=404, detail="Reconciliation run not found")

    background_tasks.add_task(run_reconciliation, run.id, db)
    
    return {"message": "Reconciliation job started successfully"}
