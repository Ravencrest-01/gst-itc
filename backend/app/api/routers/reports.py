from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.models import User, ReconciliationRun, ExportJob, ExportJobType
from app.api.dependencies.auth import get_current_user
import uuid
import os

router = APIRouter()

# Mock directory for generated reports
REPORTS_DIR = "mock_data/reports"
os.makedirs(REPORTS_DIR, exist_ok=True)

@router.get("/runs/{id}/reports/{type}")
def generate_report(
    id: uuid.UUID,
    type: str, # type parameter in path is actually just a string like "reconciliation"
    format: str = "xlsx",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if format not in ["xlsx", "csv", "pdf"]:
        raise HTTPException(status_code=400, detail="Unsupported format")
        
    run = db.query(ReconciliationRun).filter(ReconciliationRun.id == id, ReconciliationRun.workspace_id == current_user.workspace_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
        
    # Mocking report generation
    filename = f"report_{id}.{format}"
    filepath = os.path.join(REPORTS_DIR, filename)
    with open(filepath, "w") as f:
        f.write("mock report content")
        
    export_job = ExportJob(
        run_id=run.id,
        created_by=current_user.id,
        type=ExportJobType.report,
        format=format,
        status="completed",
        file_url=filepath
    )
    db.add(export_job)
    db.commit()
    
    return FileResponse(path=filepath, filename=filename)

@router.get("/runs/{id}/exports/tally")
def export_tally(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    run = db.query(ReconciliationRun).filter(ReconciliationRun.id == id, ReconciliationRun.workspace_id == current_user.workspace_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
        
    # Mocking Tally XML export
    filename = f"tally_{id}.xml"
    filepath = os.path.join(REPORTS_DIR, filename)
    with open(filepath, "w") as f:
        f.write("<ENVELOPE>mock tally export</ENVELOPE>")
        
    export_job = ExportJob(
        run_id=run.id,
        created_by=current_user.id,
        type=ExportJobType.tally,
        format="xml",
        status="completed",
        file_url=filepath
    )
    db.add(export_job)
    db.commit()
    
    return FileResponse(path=filepath, filename=filename)
