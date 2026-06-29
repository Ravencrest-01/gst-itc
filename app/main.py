import io
import csv
import uuid
from datetime import datetime
from typing import Optional
from fastapi import FastAPI, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

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

# =====================================================================
# MOCK ENDPOINTS (Migrated from frontend hardcoded data)
# =====================================================================

MOCK_WORKSPACE = { "name": "Sharma & Associates", "type": "ca_firm" }
MOCK_CLIENTS = [
  { "id": "c1", "name": "Acme Corp Pvt Ltd", "gstin": "27AAAAA0000A1Z5", "state": "Maharashtra", "status": "In progress", "invoices": 192, "matched": 88, "risk": 1065400, "deadline": "20 May 2026", "assignee": "Amit Jain" },
  { "id": "c2", "name": "Beta Textiles Ltd", "gstin": "24BBBBB1111B1Z3", "state": "Gujarat", "status": "Review", "invoices": 452, "matched": 88, "risk": 210400, "deadline": "20 May 2026", "assignee": "Priya Nair" },
  { "id": "c3", "name": "Gamma Logistics LLP", "gstin": "29GGGGG2222C1Z1", "state": "Karnataka", "status": "Closed", "invoices": 389, "matched": 98, "risk": 12500, "deadline": "—", "assignee": "Rahul Mehta" },
  { "id": "c4", "name": "Delta Foods Pvt Ltd", "gstin": "07DDDDD3333D1Z9", "state": "Delhi", "status": "Pending", "invoices": 310, "matched": 85, "risk": 117900, "deadline": "20 May 2026", "assignee": "Priya Nair" },
  { "id": "c5", "name": "Epsilon Pharma Ltd", "gstin": "33EEEEE4444E1Z7", "state": "Tamil Nadu", "status": "Not started", "invoices": 0, "matched": 0, "risk": 0, "deadline": "20 May 2026", "assignee": "Amit Jain" },
  { "id": "c6", "name": "Zeta Motors Pvt Ltd", "gstin": "06ZZZZZ5555Z1Z2", "state": "Haryana", "status": "Closed", "invoices": 485, "matched": 96, "risk": 0, "deadline": "—", "assignee": "Rahul Mehta" },
]
MOCK_INVOICES = [
  { "id": 1, "gstin": "27AAACR1234F1Z5", "name": "Reliance Industries Ltd.", "inv": "INV/26/00123", "date": "12 Apr 2026", "taxable": 150000, "tax": 27000, "src": "PR", "diff": 0, "bucket": "matched" },
  { "id": 2, "gstin": "29AAACT1234F1Z5", "name": "Tata Motors Limited", "inv": "TM/26/4452", "date": "15 Apr 2026", "taxable": 820000, "tax": 231000, "src": "2B", "diff": 1500, "bucket": "mismatched" },
  { "id": 3, "gstin": "29AAACI1234F1Z5", "name": "Infosys Limited", "inv": "INF/04/9921", "date": "05 Apr 2026", "taxable": 450000, "tax": 81000, "src": "PR", "diff": -81000, "bucket": "missing_in_portal" },
  { "id": 4, "gstin": "27AAACL1234F1Z5", "name": "Larsen & Toubro Ltd.", "inv": "LT/26/8834", "date": "20 Apr 2026", "taxable": 1200000, "tax": 216000, "src": "PR", "diff": 0, "bucket": "matched" },
  { "id": 5, "gstin": "07AAACW1234F1Z5", "name": "Wipro Enterprises", "inv": "WP-0012/26", "date": "22 Apr 2026", "taxable": 55000, "tax": 9900, "src": "2B", "diff": 0, "bucket": "missing_in_books" },
  { "id": 6, "gstin": "33AAACB1234F1Z5", "name": "Bharti Airtel Ltd.", "inv": "AB/44/001", "date": "02 Apr 2026", "taxable": 25000, "tax": 4500, "src": "PR", "diff": 1, "bucket": "probable" },
  { "id": 7, "gstin": "08AAACH1234F1Z5", "name": "HDFC Bank Ltd.", "inv": "HDFC/CHG/99", "date": "30 Apr 2026", "taxable": 12500, "tax": 2250, "src": "2B", "diff": 0, "bucket": "matched" },
  { "id": 8, "gstin": "27AAACM1234F1Z5", "name": "Mahindra & Mahindra", "inv": "MM/SP/261", "date": "18 Apr 2026", "taxable": 400000, "tax": 112000, "src": "PR", "diff": -112000, "bucket": "missing_in_portal" },
  { "id": 9, "gstin": "06AAACS1234F1Z5", "name": "Maruti Suzuki India", "inv": "MSI-8812", "date": "10 Apr 2026", "taxable": 180000, "tax": 50400, "src": "PR", "diff": -2000, "bucket": "mismatched" },
  { "id": 10, "gstin": "27AAACT1234F1Z5", "name": "TCS Limited", "inv": "TCS/IT/26-1", "date": "28 Apr 2026", "taxable": 500000, "tax": 90000, "src": "PR", "diff": 0, "bucket": "matched" },
  { "id": 11, "gstin": "24AAACD1234F1Z5", "name": "Adani Power Ltd.", "inv": "AP/26/552", "date": "08 Apr 2026", "taxable": 96000, "tax": 17280, "src": "2B", "diff": 0, "bucket": "missing_in_books" },
  { "id": 12, "gstin": "27AAACZ1234F1Z5", "name": "Zomato Hyperpure", "inv": "ZHP/2627/77", "date": "25 Apr 2026", "taxable": 64000, "tax": 11520, "src": "PR", "diff": 0, "bucket": "probable" },
]
MOCK_SUMMARY = [
  { "key": "matched", "label": "Matched", "value": 4520500, "count": 142 },
  { "key": "mismatched", "label": "Mismatched", "value": 215400, "count": 18 },
  { "key": "missing_in_portal", "label": "Missing in Portal", "value": 850000, "count": 24 },
  { "key": "missing_in_books", "label": "Missing in Books", "value": 112000, "count": 5 },
  { "key": "probable", "label": "Probable", "value": 45000, "count": 3 },
]
MOCK_ITC_AT_RISK = 1065400
MOCK_CLIENT_RUNS = [
  { "period": "Apr 2026", "status": "In progress", "invoices": 192, "matched": 88, "risk": 1065400, "created": "Today, 09:45" },
  { "period": "Mar 2026", "status": "Closed", "invoices": 388, "matched": 98, "risk": 12500, "created": "05 Apr, 14:15" },
  { "period": "Feb 2026", "status": "Closed", "invoices": 401, "matched": 99, "risk": 4200, "created": "02 Mar, 09:45" },
  { "period": "Jan 2026", "status": "Closed", "invoices": 377, "matched": 100, "risk": 0, "created": "04 Feb, 10:10" },
]
MOCK_PROBABLE = [
  { "id": "p1", "name": "Acme Corp India Pvt Ltd", "gstin": "27AAACP1234A1Z5", "date": "15-Apr-2026", "taxable": 125000, "tax": 22500, "conf": 86, "prInv": "INV/26-27/042", "twoInv": "26-27-42" },
  { "id": "p2", "name": "Global Tech Solutions", "gstin": "29AAGTS5678B1Z2", "date": "11-Apr-2026", "taxable": 45000, "tax": 8100, "conf": 82, "prInv": "GT-2026-009", "twoInv": "GT/2026/009" },
  { "id": "p3", "name": "Zenith Logistics", "gstin": "24ZENLO9012C1Z9", "date": "19-Apr-2026", "taxable": 12500, "tax": 2250, "conf": 79, "prInv": "ZL/992/26", "twoInv": "ZL-992-26" },
  { "id": "p4", "name": "Apex Manufacturing", "gstin": "07APEXM3456D1Z4", "date": "03-Apr-2026", "taxable": 890000, "tax": 160200, "conf": 75, "prInv": "APX-04-12", "twoInv": "APX/04/12" },
  { "id": "p5", "name": "Nova Services LLP", "gstin": "33NOVAS7890E1Z1", "date": "27-Apr-2026", "taxable": 5000, "tax": 900, "conf": 71, "prInv": "INV-991", "twoInv": "991" },
]

@app.get("/api/v1/workspace")
def get_workspace():
    return MOCK_WORKSPACE

@app.get("/api/v1/clients")
def get_clients():
    return MOCK_CLIENTS

@app.get("/api/v1/clients/{client_id}/runs")
def get_client_runs(client_id: str):
    return MOCK_CLIENT_RUNS

@app.get("/api/v1/runs/mock/summary")
def get_run_summary():
    return {
        "summary": MOCK_SUMMARY,
        "itc_at_risk": MOCK_ITC_AT_RISK,
        "invoices": MOCK_INVOICES,
        "probable": MOCK_PROBABLE
    }




@app.get("/api/v1/dashboard/kpis")
def get_dashboard_kpis(
    tenant: dict = Depends(get_current_tenant_context),
    db: Session = Depends(get_db)
):
    """
    Calculates the high-level metrics for the Precision Ledger Dashboard.
    """
    client_id = tenant["client_id"]

    # 1. Open Runs (Status is not 'closed' or 'completed')
    open_runs_count = db.query(ReconciliationRun).filter(
        ReconciliationRun.client_id == client_id,
        ReconciliationRun.status.in_(["pending", "review", "unreviewed"])
    ).count()

    # 2. ITC Recovered (Sum of tax on 'Matched' invoices)
    itc_recovered = db.query(func.sum(MatchResult.tax_diff)).filter(
        MatchResult.client_id == client_id,
        MatchResult.bucket == "Matched"
    ).scalar() or 0.0

    # 3. ITC at Risk (Sum of tax on 'Missing-in-Portal' or 'Mismatched' invoices)
    itc_at_risk = db.query(func.sum(MatchResult.tax_diff)).filter(
        MatchResult.client_id == client_id,
        MatchResult.bucket.in_(["Missing-in-Portal", "Mismatched", "Probable"])
    ).scalar() or 0.0

    # 4. Vendors Flagged (Distinct suppliers with discrepancies)
    # Note: In a full schema, you'd join with the Supplier table. Here we count mismatched rows.
    vendors_flagged = db.query(MatchResult).filter(
        MatchResult.client_id == client_id,
        MatchResult.bucket.in_(["Missing-in-Portal", "Mismatched"])
    ).count()

    return {
        "open_runs": open_runs_count,
        "itc_recovered": float(itc_recovered),
        "itc_at_risk": float(itc_at_risk),
        "vendors_flagged": vendors_flagged
    }

@app.get("/api/v1/runs/recent")
def get_recent_runs(
    limit: int = 5,
    tenant: dict = Depends(get_current_tenant_context),
    db: Session = Depends(get_db)
):
    """
    Fetches the latest reconciliation runs to populate the dashboard data table.
    """
    client_id = tenant["client_id"]
    
    # Fetch the runs ordered by newest first
    recent_runs = db.query(ReconciliationRun).filter(
        ReconciliationRun.client_id == client_id
    ).order_by(desc(ReconciliationRun.created_at)).limit(limit).all()

    formatted_runs = []
    for run in recent_runs:
        # Calculate row-level stats for each run
        total_invoices = db.query(MatchResult).filter(MatchResult.run_id == run.id).count()
        matched_invoices = db.query(MatchResult).filter(
            MatchResult.run_id == run.id, 
            MatchResult.bucket == "Matched"
        ).count()
        
        match_percentage = int((matched_invoices / total_invoices * 100)) if total_invoices > 0 else 0
        
        run_risk = db.query(func.sum(MatchResult.tax_diff)).filter(
            MatchResult.run_id == run.id,
            MatchResult.bucket.in_(["Missing-in-Portal", "Mismatched"])
        ).scalar() or 0.0

        formatted_runs.append({
            "id": str(run.id),
            "tax_period": run.tax_period,
            "status": run.status,
            "invoices": total_invoices,
            "matched_percentage": f"{match_percentage}%",
            "itc_at_risk": float(run_risk),
            "created_on": run.created_at.strftime("%d %b, %H:%M")
        })

    return {"runs": formatted_runs}