import io
import csv
import uuid
from datetime import datetime
from typing import Optional, List
import random
from datetime import timedelta
from pydantic import BaseModel, EmailStr

from fastapi import FastAPI, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

# Core Engine and Dependency Imports
from app.core.database import engine, get_db, SessionLocal
from app.core.dependencies import get_current_tenant_context
from app.core.security import hash_password, verify_password, create_access_token

# Schema Imports
from app.modules.m0_schema.models import Base, ReconciliationRun, MatchResult, Workspace, Client, User, OTPVerification
from app.modules.m6_orchestrator.service import run_reconciliation

# ---------------------------------------------------------
# 1. DATABASE SYSTEM INITIALIZATION & SEEDING
# ---------------------------------------------------------
# Automatically construct all tables inside PostgreSQL on application launch
Base.metadata.create_all(bind=engine)

# Proactive Seeding: Ensure the default tenant context exists to satisfy constraints
db_seed = SessionLocal()
try:
    mock_ws_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
    mock_cl_id = uuid.UUID("22222222-2222-2222-2222-222222222222")
    
    # Verify or seed global tenant Workspace
    if not db_seed.query(Workspace).filter(Workspace.id == mock_ws_id).first():
        db_seed.add(Workspace(id=mock_ws_id, name="Alpha CA Firm Practice", type="ca_firm"))
        print(" Seeded: Workspace row added to database.")
        
    # Verify or seed specific corporate operational Client
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

# ---------------------------------------------------------
# 2. PYDANTIC DATA VALIDATION SCHEMAS
# ---------------------------------------------------------
class OTPRequest(BaseModel):
    email: EmailStr

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    workspace_name: str
    workspace_type: str = "ca_firm"
    otp: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str
    otp: Optional[str] = None

# ---------------------------------------------------------
# 3. FASTAPI CORE CONTAINER INSTANTIATION
# ---------------------------------------------------------
app = FastAPI(
    title="ITC Reconciliation Engine API",
    description="MVP Backend API powered by persistent PostgreSQL storage.",
    version="2.0.0"
)

@app.get("/")
def read_root():
    return {"status": "healthy", "database": "connected_postgres_on_5433"}

# ---------------------------------------------------------
# 4. IDENTITY & ACCESS MANAGEMENT (IAM) ENDPOINTS
# ---------------------------------------------------------
@app.post("/api/v1/auth/request-otp")
def request_otp(payload: OTPRequest, db: Session = Depends(get_db)):
    otp_code = str(random.randint(100000, 999999))
    expires = datetime.utcnow() + timedelta(minutes=10)
    
    otp_entry = OTPVerification(
        email=payload.email,
        otp_code=otp_code,
        expires_at=expires
    )
    db.add(otp_entry)
    db.commit()
    
    print(f"\n{'='*40}\nMock OTP for {payload.email}: {otp_code}\n{'='*40}\n")
    return {"status": "success", "message": "OTP sent to email"}

@app.post("/api/v1/auth/register")
def register_user(user_data: UserRegister, db: Session = Depends(get_db)):
    # Verify OTP
    otp_entry = db.query(OTPVerification).filter(
        OTPVerification.email == user_data.email,
        OTPVerification.otp_code == user_data.otp,
        OTPVerification.used == "false",
        OTPVerification.expires_at > datetime.utcnow()
    ).first()
    
    if not otp_entry:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")
        
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")
    
    try:
        # Create Workspace
        new_ws = Workspace(name=user_data.workspace_name, type=user_data.workspace_type)
        db.add(new_ws)
        db.flush()
        
        # Create User
        new_user = User(
            email=user_data.email,
            hashed_password=hash_password(user_data.password[:72]),
            full_name=user_data.full_name,
            workspace_id=new_ws.id
        )
        db.add(new_user)
        
        otp_entry.used = "true"
        db.commit()
        
        # Auto-login
        token_payload = {
            "sub": str(new_user.id),
            "email": new_user.email,
            "workspace_id": str(new_ws.id),
        }
        access_token = create_access_token(data=token_payload)
        return {"access_token": access_token, "token_type": "bearer", "user": {"name": new_user.full_name, "email": new_user.email}}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Registration failure: {str(e)}")

@app.post("/api/v1/auth/login")
def login_user(credentials: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == credentials.email).first()
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
        
    if credentials.otp:
        otp_entry = db.query(OTPVerification).filter(
            OTPVerification.email == credentials.email,
            OTPVerification.otp_code == credentials.otp,
            OTPVerification.used == "false",
            OTPVerification.expires_at > datetime.utcnow()
        ).first()
        if not otp_entry:
            raise HTTPException(status_code=400, detail="Invalid or expired OTP")
        otp_entry.used = "true"
        db.commit()
    
    token_payload = {
        "sub": str(user.id),
        "email": user.email,
        "workspace_id": str(user.workspace_id),
    }
    access_token = create_access_token(data=token_payload)
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {"name": user.full_name, "email": user.email}
    }

@app.get("/api/v1/auth/me")
def get_current_user_profile(tenant: dict = Depends(get_current_tenant_context), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == tenant["user_id"]).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return {"id": str(user.id), "name": user.full_name, "email": user.email, "workspace_id": str(user.workspace_id)}

# ---------------------------------------------------------
# 5. BUSINESS INTELLIGENCE & DASHBOARD AGGREGATORS
# ---------------------------------------------------------
@app.get("/api/v1/dashboard/kpis")
def get_dashboard_kpis(
    tenant: dict = Depends(get_current_tenant_context),
    db: Session = Depends(get_db)
):
    """ Computes prioritized analytics blocks for the Precision Ledger overview dashboard. """
    client_id = tenant["client_id"]

    # Open Active Tasks
    open_runs_count = db.query(ReconciliationRun).filter(
        ReconciliationRun.client_id == client_id,
        ReconciliationRun.status.in_(["pending", "review", "unreviewed"])
    ).count()

    # Financial Gains Realized
    itc_recovered = db.query(func.sum(MatchResult.tax_diff)).filter(
        MatchResult.client_id == client_id,
        MatchResult.bucket == "Matched"
    ).scalar() or 0.0

    # Risk Factor Exposure
    itc_at_risk = db.query(func.sum(MatchResult.tax_diff)).filter(
        MatchResult.client_id == client_id,
        MatchResult.bucket.in_(["Missing-in-Portal", "Mismatched", "Probable"])
    ).scalar() or 0.0

    # Defaulter Tracking Count
    vendors_flagged = db.query(MatchResult.purchase_invoice_id).filter(
        MatchResult.client_id == client_id,
        MatchResult.bucket.in_(["Missing-in-Portal", "Mismatched"])
    ).distinct().count()

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
    """ Extracts structural batch metrics summarizing recent auditing executions. """
    client_id = tenant["client_id"]
    
    recent_runs = db.query(ReconciliationRun).filter(
        ReconciliationRun.client_id == client_id
    ).order_by(desc(ReconciliationRun.created_at)).limit(limit).all()

    formatted_runs = []
    for run in recent_runs:
        total_invoices = db.query(MatchResult).filter(MatchResult.run_id == run.id).count()
        matched_invoices = db.query(MatchResult).filter(
            MatchResult.run_id == run.id, 
            MatchResult.bucket == "Matched"
        ).count()
        
        match_percentage = int((matched_invoices / total_invoices * 100)) if total_invoices > 0 else 0
        
        run_risk = db.query(func.sum(MatchResult.tax_diff)).filter(
            run.id == MatchResult.run_id,
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

# ---------------------------------------------------------
# 6. TRANSACTION PROCESSING & DATA MANIPULATION PIPELINES
# ---------------------------------------------------------
@app.post("/api/v1/reconcile")
async def reconcile_documents(
    purchase_register: UploadFile = File(...),
    gstr_2b: UploadFile = File(...),
    tenant: dict = Depends(get_current_tenant_context),
    db: Session = Depends(get_db)
):
    """ Ingests binary document streams, calculates matrix variances, and logs transactional runs. """
    if not purchase_register.filename.endswith('.csv') or not gstr_2b.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Both uploaded files must be standard CSV format.")

    try:
        pr_contents = await purchase_register.read()
        twob_contents = await gstr_2b.read()
        
        results = run_reconciliation(pr_contents, twob_contents, tenant)
        run_id = results[0]["run_id"] if results else uuid.uuid4()
        
        # Instantiate structural orchestration parent record
        db_run = ReconciliationRun(
            id=run_id,
            workspace_id=tenant["workspace_id"],
            client_id=tenant["client_id"],
            tax_period="2026-06",
            status="completed"
        )
        db.add(db_run)
        db.flush()  # Prevents foreign key parent-child race condition drops
        
        # Append corresponding internal mapping array items
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
    """ Direct Validation Route: Pulls matched items straight out of PostgreSQL. """
    records = db.query(MatchResult).filter(MatchResult.run_id == uuid.UUID(run_id)).all()
    if not records:
        raise HTTPException(status_code=404, detail="No database records found matching this run ID.")
    return {"run_id": run_id, "count": len(records), "database_rows": records}

    # ---------------------------------------------------------
# 7. AUDITOR DECISION & STATE MANIPULATION CONTROLLERS
# ---------------------------------------------------------
class MatchStatusUpdate(BaseModel):
    status: str  # Expected: 'confirmed', 'rejected', or 'unreviewed'
    override_bucket: Optional[str] = None  # e.g., Manually shifting to 'Matched'

@app.patch("/api/v1/reconcile/matches/{match_id}")
def update_match_decision(
    match_id: str, 
    payload: MatchStatusUpdate, 
    db: Session = Depends(get_db)
):
    """
    Auditor Action Path: Allows manual override of 'Probable' or 'Mismatched' 
    invoices, saving the human-in-the-loop audit status directly to PostgreSQL.
    """
    match_record = db.query(MatchResult).filter(MatchResult.id == uuid.UUID(match_id)).first()
    if not match_record:
        raise HTTPException(status_code=404, detail="Target match result record not found.")
    
    try:
        match_record.status = payload.status
        if payload.override_bucket:
            match_record.bucket = payload.override_bucket
            
        db.commit()
        return {
            "status": "updated", 
            "match_id": match_id, 
            "new_review_status": match_record.status,
            "current_bucket": match_record.bucket
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to log auditor decision: {str(e)}")

@app.patch("/api/v1/runs/{run_id}/status")
def update_run_lifecycle(
    run_id: str, 
    status: str, 
    db: Session = Depends(get_db)
):
    """ Lifecycle Controller: Moves a run status between 'Pending', 'Review', and 'Closed'. """
    run_record = db.query(ReconciliationRun).filter(ReconciliationRun.id == uuid.UUID(run_id)).first()
    if not run_record:
        raise HTTPException(status_code=404, detail="Target reconciliation run not found.")
    
    try:
        run_record.status = status
        db.commit()
        return {"run_id": run_id, "lifecycle_status": run_record.status}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to transition run state: {str(e)}")

# ---------------------------------------------------------
# 8. CLIENTS MANAGEMENT (COMPANIES)
# ---------------------------------------------------------
class ClientCreate(BaseModel):
    legal_name: str
    gstin: str
    state_code: str

@app.get("/api/v1/clients")
def list_clients(tenant: dict = Depends(get_current_tenant_context), db: Session = Depends(get_db)):
    # Simple MVP: return all clients in workspace
    clients = db.query(Client).filter(Client.workspace_id == tenant["workspace_id"]).all()
    return [{"id": str(c.id), "name": c.legal_name, "gstin": c.gstin, "state": c.state_code, "status": "In progress"} for c in clients]

@app.post("/api/v1/clients")
def add_client(payload: ClientCreate, tenant: dict = Depends(get_current_tenant_context), db: Session = Depends(get_db)):
    new_client = Client(
        workspace_id=tenant["workspace_id"],
        gstin=payload.gstin,
        legal_name=payload.legal_name,
        state_code=payload.state_code
    )
    db.add(new_client)
    db.commit()
    return {"status": "success", "id": str(new_client.id)}

@app.get("/api/v1/clients/{client_id}")
def get_client(client_id: str, db: Session = Depends(get_db)):
    c = db.query(Client).filter(Client.id == client_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"id": str(c.id), "name": c.legal_name, "gstin": c.gstin, "state": c.state_code}

@app.patch("/api/v1/clients/{client_id}")
def update_client(client_id: str, payload: dict, db: Session = Depends(get_db)):
    c = db.query(Client).filter(Client.id == client_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    if "legal_name" in payload: c.legal_name = payload["legal_name"]
    if "gstin" in payload: c.gstin = payload["gstin"]
    if "state_code" in payload: c.state_code = payload["state_code"]
    db.commit()
    return {"status": "success"}

@app.delete("/api/v1/clients/{client_id}")
def delete_client(client_id: str, db: Session = Depends(get_db)):
    c = db.query(Client).filter(Client.id == client_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    db.delete(c)
    db.commit()
    return {"status": "deleted"}

# ---------------------------------------------------------
# 9. RECONCILIATION FLOW ENDPOINTS (MISSING PIECES)
# ---------------------------------------------------------
@app.get("/api/v1/clients/{client_id}/runs")
def list_client_runs(client_id: str, db: Session = Depends(get_db)):
    runs = db.query(ReconciliationRun).filter(ReconciliationRun.client_id == client_id).order_by(desc(ReconciliationRun.created_at)).all()
    return [{"id": str(r.id), "period": r.tax_period, "status": r.status, "created": r.created_at.strftime("%d %b, %H:%M")} for r in runs]

@app.get("/api/v1/runs/{run_id}/summary")
def get_run_summary(run_id: str, db: Session = Depends(get_db)):
    # Mocking for MVP response since engine doesn't currently bucket accurately without PR/2B tables
    return {
        "summary": [
            { "key": "matched", "label": "Matched", "value": 4520500, "count": 142 },
            { "key": "mismatched", "label": "Mismatched", "value": 215400, "count": 18 },
            { "key": "missing_in_portal", "label": "Missing in Portal", "value": 850000, "count": 24 },
            { "key": "missing_in_books", "label": "Missing in Books", "value": 112000, "count": 5 },
            { "key": "probable", "label": "Probable", "value": 45000, "count": 3 },
        ],
        "itc_at_risk": 1065400,
    }

@app.get("/api/v1/runs/{run_id}/invoices")
def get_run_invoices(run_id: str, db: Session = Depends(get_db)):
    # Requires PurchaseInvoice / PortalInvoice tables to be populated by the engine
    # Since engine doesn't persist them yet, we return the mock list for MVP front-end compatibility
    return [
        { "id": 1, "gstin": "27AAACR1234F1Z5", "name": "Reliance Industries Ltd.", "inv": "INV/26/00123", "date": "12 Apr 2026", "taxable": 150000, "tax": 27000, "src": "PR", "diff": 0, "bucket": "matched" },
        { "id": 2, "gstin": "29AAACT1234F1Z5", "name": "Tata Motors Limited", "inv": "TM/26/4452", "date": "15 Apr 2026", "taxable": 820000, "tax": 231000, "src": "2B", "diff": 1500, "bucket": "mismatched" }
    ]

@app.get("/api/v1/runs/{run_id}/probable")
def get_run_probable(run_id: str, db: Session = Depends(get_db)):
    return [
        { "id": "p1", "name": "Acme Corp India Pvt Ltd", "gstin": "27AAACP1234A1Z5", "date": "15-Apr-2026", "taxable": 125000, "tax": 22500, "conf": 86, "prInv": "INV/26-27/042", "twoInv": "26-27-42" },
    ]

# ---------------------------------------------------------
# 10. SETTINGS & REPORTS (STUBS)
# ---------------------------------------------------------
@app.get("/api/v1/workspace")
def get_workspace_profile(tenant: dict = Depends(get_current_tenant_context), db: Session = Depends(get_db)):
    ws = db.query(Workspace).filter(Workspace.id == tenant["workspace_id"]).first()
    return {"id": str(ws.id), "name": ws.name, "type": ws.type}

@app.get("/api/v1/users")
def get_workspace_users(tenant: dict = Depends(get_current_tenant_context), db: Session = Depends(get_db)):
    users = db.query(User).filter(User.workspace_id == tenant["workspace_id"]).all()
    return [{"id": str(u.id), "name": u.full_name, "email": u.email, "role": "admin"} for u in users]

@app.get("/api/v1/runs/{run_id}/reports/{report_type}")
def download_report(run_id: str, report_type: str):
    return {"status": "generated", "url": f"https://s3.mock.url/reports/{run_id}_{report_type}.xlsx"}
