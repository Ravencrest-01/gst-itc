from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.models import ReconciliationRun
from app.services.audit import log_audit
from app.core.logging import get_logger

logger = get_logger(__name__)

def run_reconciliation(run_id: UUID, db: Session = None) -> None:
    if db is None:
        db = SessionLocal()
        close_db = True
    else:
        close_db = False
    try:
        run = db.query(ReconciliationRun).filter(ReconciliationRun.id == run_id).first()
        if not run:
            logger.error(f"ReconciliationRun {run_id} not found")
            return
        
        # Step 1: transition status to "matching"
        run.status = "matching"
        db.commit()
        log_audit(
            db=db,
            org_id=run.org_id,
            run_id=run.id,
            action="start_matching",
            entity_type="reconciliation_run",
            entity_id=run.id,
            details={"status": run.status}
        )
        
        # In M0, we do no real matching logic. Just shift to "completed" immediately.
        # Step 2: transition status to "completed"
        run.status = "completed"
        run.completed_at = datetime.now(timezone.utc)
        db.commit()
        
        log_audit(
            db=db,
            org_id=run.org_id,
            run_id=run.id,
            action="complete_matching",
            entity_type="reconciliation_run",
            entity_id=run.id,
            details={"status": run.status}
        )
        logger.info(f"ReconciliationRun {run_id} completed successfully.")
        
    except Exception as e:
        logger.exception(f"Error during reconciliation run {run_id}")
        db.rollback()
    finally:
        if close_db:
            db.close()
