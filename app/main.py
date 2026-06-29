import io
import csv
import uuid
from datetime import datetime
from typing import Optional
from fastapi import FastAPI, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session

from app.core.database import engine, get_db, SessionLocal
from app.core.dependencies import get_current_tenant_context
from app.modules.m0_schema.models import Base, ReconciliationRun, MatchResult, Workspace, Client
from app.modules.m6_orchestrator.service import run_reconciliation

# 1. Automatically construct all tables inside PostgreSQL on application launch
Base.metadata.create_all(bind=engine)

# 2. Proactive Seeding: Insert the Mock Tenant rows to satisfy Foreign Key constraints
db_seed = SessionLocal()
try:
    mock_ws_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
    mock_cl_id = uuid.UUID("22222222-2222-2222-2222-222222222222")
    
    # If the mock workspace doesn't exist yet, insert it
    if not db_seed.query(Workspace).filter(Workspace.id == mock_ws_id).first():
        db_seed.add(Workspace(id=mock_ws_id, name="Alpha CA Firm Practice", type="ca_firm"))
        print(" Seeded: Workspace row added to database.")
        
    # If the mock client doesn't exist yet, insert it
    if not db_seed.query(Client).filter(Client.id == mock_cl_id).first():
        db_seed.add(Client(
            id=mock_cl_id, 
            workspace_id=mock_ws_id, 
            gstin="27AAAAA1111A1Z1", 
            legal_name="Acme Trading Corp", 
            state_code="27"
        ))
        print(" Seeded: Client company row added to database.")
        
    db_seed.commit()
except Exception as e:
    db_seed.rollback()
    print(f"Seeding notification check: {e}")
finally:
    db_seed.close()

# 3. Initialize the FastAPI container
app = FastAPI(
    title="ITC Reconciliation Engine API",
    description="MVP Backend API powered by persistent PostgreSQL storage.",
    version="2.0.0"
)

@app.get("/")
def read_root():
    return {"status": "healthy", "database": "connected_postgres_on_5433"}

@app.post("/api/v1/reconcile")
async def reconcile_documents(
    purchase_register: UploadFile = File(...),
    gstr_2b: UploadFile = File(...),
    tenant: dict = Depends(get_current_tenant_context),
    db: Session = Depends(get_db)
):
    """
    Persistent M6 Route: Run multi-pass reconciliation and permanently commit 
    the resulting metrics to PostgreSQL.
    """
    if not purchase_register.filename.endswith('.csv') or not gstr_2b.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Both uploaded files must be standard CSV format.")

    try:
        pr_contents = await purchase_register.read()
        twob_contents = await gstr_2b.read()
        
        # Execute our core multi-pass library matching core
        results = run_reconciliation(pr_contents, twob_contents, tenant)
        run_id = results[0]["run_id"] if results else uuid.uuid4()
        
        # Persist the high-level Job Run context record
        db_run = ReconciliationRun(
            id=run_id,
            workspace_id=tenant["workspace_id"],
            client_id=tenant["client_id"],
            tax_period="2026-06",
            status="completed"
        )
        db.add(db_run)
        db.flush()
        
        # Loop and bulk-commit individual MatchResult rows directly to SQL
        for record in results:
            db_result = MatchResult(
                run_id=run_id,
                client_id=tenant["client_id"],
                purchase_invoice_id=record["purchase_invoice_id"],
                portal_invoice_id=record["portal_invoice_id"],
                bucket=record["bucket"],
                match_pass=record["match_pass"],
                confidence=record["confidence"],
                tax_diff=record["tax_diff"]
            )
            db.add(db_result)
            
        db.commit()
        
        return {
            "status": "completed_and_saved_to_postgres",
            "run_id": run_id,
            "total_records_committed": len(results)
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database pipeline failure: {str(e)}")

@app.get("/api/v1/runs/{run_id}/results")
def get_persisted_results(run_id: str, db: Session = Depends(get_db)):
    """ Direct Verification Route: Pulls saved records straight back out of PostgreSQL. """
    records = db.query(MatchResult).filter(MatchResult.run_id == run_id).all()
    if not records:
        raise HTTPException(status_code=404, detail="No database records found matching this run ID.")
    return {"run_id": run_id, "count": len(records), "database_rows": records}