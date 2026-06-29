from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.api.deps import get_current_user
from app.models.models import AppUser, ReconciliationRun, UploadedFile, PurchaseInvoice, PortalInvoice
from app.schemas.runs import ReconciliationRunCreate, ReconciliationRunResponse
from app.services.audit import log_audit
from app.services.reconciliation import run_reconciliation
from app.services.parser import parse_pr, parse_2b
import os
import shutil

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

@router.post("/{id}/upload", status_code=status.HTTP_201_CREATED)
def upload_file(
    id: UUID,
    file_type: str = Form(...),
    file: UploadFile = File(...),
    current_user: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if file_type not in ["PR", "2B"]:
        raise HTTPException(status_code=400, detail="Invalid file_type. Must be 'PR' or '2B'")
        
    run = db.query(ReconciliationRun).filter(
        ReconciliationRun.id == id,
        ReconciliationRun.org_id == current_user.org_id
    ).first()
    
    if not run:
        raise HTTPException(status_code=404, detail="Reconciliation run not found")
        
    # Read content
    try:
        content = file.file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {str(e)}")
        
    # Parse file
    filename = file.filename or "unknown"
    is_json = filename.endswith(".json")
    
    try:
        if file_type == "PR":
            parsed_rows = parse_pr(content)
        else:
            parsed_rows = parse_2b(content, is_json=is_json)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to parse file: {str(e)}")
        
    # Save file locally
    uploads_dir = "/home/raven/projects/gst-itc/backend/uploads"
    os.makedirs(uploads_dir, exist_ok=True)
    storage_path = os.path.join(uploads_dir, f"{run.id}_{file_type}_{filename}")
    try:
        with open(storage_path, "wb") as f:
            f.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save file: {str(e)}")
        
    # Save invoices in bulk
    row_count = len(parsed_rows)
    db_records = []
    
    if file_type == "PR":
        for r in parsed_rows:
            db_records.append(PurchaseInvoice(
                org_id=run.org_id,
                run_id=run.id,
                supplier_gstin=r["supplier_gstin"],
                invoice_no=r["invoice_no"],
                invoice_no_norm=r["invoice_no_norm"],
                invoice_date=r["invoice_date"],
                taxable_value=r["taxable_value"],
                cgst=r["cgst"],
                sgst=r["sgst"],
                igst=r["igst"],
                cess=r["cess"],
                total_tax=r["total_tax"]
            ))
    else:
        for r in parsed_rows:
            db_records.append(PortalInvoice(
                org_id=run.org_id,
                run_id=run.id,
                supplier_gstin=r["supplier_gstin"],
                invoice_no=r["invoice_no"],
                invoice_no_norm=r["invoice_no_norm"],
                invoice_date=r["invoice_date"],
                taxable_value=r["taxable_value"],
                cgst=r["cgst"],
                sgst=r["sgst"],
                igst=r["igst"],
                cess=r["cess"],
                total_tax=r["total_tax"],
                filing_period=r["filing_period"]
            ))
            
    try:
        db.bulk_save_objects(db_records)
        
        # Save UploadedFile record
        uploaded_file = UploadedFile(
            org_id=run.org_id,
            run_id=run.id,
            file_type=file_type,
            filename=filename,
            storage_path=storage_path,
            row_count=row_count
        )
        db.add(uploaded_file)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error during save: {str(e)}")
        
    # Log Audit Log
    log_audit(
        db=db,
        org_id=run.org_id,
        run_id=run.id,
        user_id=current_user.id,
        action="upload_file",
        entity_type="uploaded_file",
        entity_id=uploaded_file.id,
        details={
            "file_type": file_type,
            "filename": filename,
            "row_count": row_count
        }
    )
    
    return {
        "message": f"Successfully parsed and uploaded {row_count} rows",
        "file_id": str(uploaded_file.id),
        "row_count": row_count
    }
