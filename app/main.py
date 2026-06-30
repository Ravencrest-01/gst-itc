import io
import csv
import uuid
import os
import random
import csv, io
from datetime import datetime
from typing import Optional, List
from app.core.email_otp import send_otp_email 
from fastapi.responses import StreamingResponse
from datetime import timedelta
from pydantic import BaseModel, EmailStr
from fastapi import FastAPI, Depends, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

# Core Engine and Dependency Imports
from app.core.database import engine, get_db, SessionLocal
from app.core.dependencies import get_current_tenant_context
from app.core.security import hash_password, verify_password, create_access_token

# Schema Imports
from app.modules.m0_schema.models import Base, ReconciliationRun, MatchResult, Workspace, Client, User, OTPVerification, PurchaseInvoice, PortalInvoice, Vendor, WorkspaceSettings
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
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")],
    allow_credentials=False,        # we use bearer tokens, not cookies
    allow_methods=["*"],
    allow_headers=["*"],            # covers Authorization + X-Client-Id
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

    send_otp_email(payload.email, otp_code)
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
        
        results, pr_list, twob_list = run_reconciliation(pr_contents, twob_contents, tenant)
        
        run_id = uuid.uuid4()
        if pr_list:
            run_id = pr_list[0]["run_id"]
        elif twob_list:
            run_id = twob_list[0]["run_id"]
            
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
        
        # Persist Purchase Invoices
        for pr in pr_list:
            db_pr = PurchaseInvoice(
                id=pr["id"],
                run_id=run_id,
                client_id=tenant["client_id"],
                invoice_number=pr["invoice_no"],
                invoice_date=str(pr["invoice_date"] or ""),
                supplier_gstin=pr["supplier_gstin"],
                supplier_name=pr["supplier_name"],
                taxable_value=pr["taxable_value"],
                total_tax=pr["total_tax"]
            )
            db.add(db_pr)
            
        # Persist Portal Invoices
        for twob in twob_list:
            db_twob = PortalInvoice(
                id=twob["id"],
                run_id=run_id,
                client_id=tenant["client_id"],
                invoice_number=twob["invoice_no"],
                invoice_date=str(twob["invoice_date"] or ""),
                supplier_gstin=twob["supplier_gstin"],
                supplier_name=twob["supplier_name"],
                taxable_value=twob["taxable_value"],
                total_tax=twob["total_tax"]
            )
            db.add(db_twob)
            
        db.flush()
        
        # Persist Vendors (if they don't exist yet)
        known_gstins = {v.gstin: v for v in db.query(Vendor).filter(Vendor.client_id == tenant["client_id"]).all()}
        for pr in pr_list:
            gst = pr["supplier_gstin"]
            if gst and gst not in known_gstins:
                new_v = Vendor(
                    client_id=tenant["client_id"],
                    gstin=gst,
                    legal_name=pr["supplier_name"] or "Vendor " + gst[:5],
                    contact_email="finance@" + (pr["supplier_name"].lower().replace(" ", "").replace(".", "") if pr["supplier_name"] else "vendor") + ".in"
                )
                db.add(new_v)
                known_gstins[gst] = new_v
                
        db.flush()
        
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
    clients = db.query(Client).filter(Client.workspace_id == tenant["workspace_id"]).all()
    
    res_list = []
    for c in clients:
        latest_run = db.query(ReconciliationRun).filter(ReconciliationRun.client_id == c.id).order_by(desc(ReconciliationRun.created_at)).first()
        
        invoices = 0
        matched = 0
        risk = 0.0
        status = "Not started"
        
        if latest_run:
            status = latest_run.status
            invoices = db.query(MatchResult).filter(MatchResult.run_id == latest_run.id).count()
            
            matched_count = db.query(MatchResult).filter(
                MatchResult.run_id == latest_run.id,
                MatchResult.bucket.ilike("matched")
            ).count()
            
            matched = int((matched_count / invoices) * 100) if invoices > 0 else 0
            
            risk = db.query(func.sum(MatchResult.tax_diff)).filter(
                MatchResult.run_id == latest_run.id,
                MatchResult.bucket.in_(["Missing-in-Portal", "Mismatched", "Probable"])
            ).scalar() or 0.0
            
        res_list.append({
            "id": str(c.id),
            "name": c.legal_name,
            "gstin": c.gstin,
            "state": c.state_code,
            "status": status,
            "invoices": invoices,
            "matched": matched,
            "risk": float(risk),
            "deadline": "20 May 2026",
            "assignee": "Amit Jain"
        })
        
    return res_list

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
def delete_client(client_id: str, tenant: dict = Depends(get_current_tenant_context), db: Session = Depends(get_db)):
    c = db.query(Client).filter(
        Client.id == client_id,
        Client.workspace_id == tenant["workspace_id"]
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    try:
        # Cascade: remove all child data before deleting the client
        runs = db.query(ReconciliationRun).filter(ReconciliationRun.client_id == c.id).all()
        for run in runs:
            db.query(MatchResult).filter(MatchResult.run_id == run.id).delete()
            db.query(PurchaseInvoice).filter(PurchaseInvoice.run_id == run.id).delete()
            db.query(PortalInvoice).filter(PortalInvoice.run_id == run.id).delete()
        db.query(ReconciliationRun).filter(ReconciliationRun.client_id == c.id).delete()
        db.query(Vendor).filter(Vendor.client_id == c.id).delete()
        db.delete(c)
        db.commit()
        return {"status": "deleted", "id": client_id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete client: {str(e)}")

# ---------------------------------------------------------
# 9. RECONCILIATION FLOW ENDPOINTS (MISSING PIECES)
# ---------------------------------------------------------
@app.get("/api/v1/clients/{client_id}/runs")
def list_client_runs(client_id: str, db: Session = Depends(get_db)):
    runs = db.query(ReconciliationRun).filter(ReconciliationRun.client_id == client_id).order_by(desc(ReconciliationRun.created_at)).all()
    formatted = []
    for r in runs:
        total_invoices = db.query(MatchResult).filter(MatchResult.run_id == r.id).count()
        matched_invoices = db.query(MatchResult).filter(
            MatchResult.run_id == r.id, 
            MatchResult.bucket == "Matched"
        ).count()
        match_percentage = int((matched_invoices / total_invoices * 100)) if total_invoices > 0 else 0
        run_risk = db.query(func.sum(MatchResult.tax_diff)).filter(
            MatchResult.run_id == r.id,
            MatchResult.bucket.in_(["Missing-in-Portal", "Mismatched"])
        ).scalar() or 0.0
        
        formatted.append({
            "id": str(r.id),
            "period": r.tax_period,
            "status": r.status,
            "invoices": total_invoices,
            "matched": match_percentage,
            "risk": float(run_risk),
            "created": r.created_at.strftime("%d %b, %H:%M")
        })
    return formatted

@app.get("/api/v1/runs/{run_id}/summary")
def get_run_summary(run_id: str, db: Session = Depends(get_db)):
    try:
        run_uuid = uuid.UUID(run_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid run ID format")
        
    results = db.query(MatchResult).filter(MatchResult.run_id == run_uuid).all()
    
    buckets = ["matched", "mismatched", "missing_in_portal", "missing_in_books", "probable"]
    counts = {b: 0 for b in buckets}
    values = {b: 0.0 for b in buckets}
    
    pr_dict = {pr.id: pr for pr in db.query(PurchaseInvoice).filter(PurchaseInvoice.run_id == run_uuid).all()}
    twob_dict = {twob.id: twob for twob in db.query(PortalInvoice).filter(PortalInvoice.run_id == run_uuid).all()}
    
    for r in results:
        b = r.bucket.lower().replace("-", "_").replace(" ", "_")
        if b not in counts:
            b = "probable"
            
        counts[b] += 1
        
        tax_val = 0.0
        if r.purchase_invoice_id and r.purchase_invoice_id in pr_dict:
            tax_val = pr_dict[r.purchase_invoice_id].total_tax
        elif r.portal_invoice_id and r.portal_invoice_id in twob_dict:
            tax_val = twob_dict[r.portal_invoice_id].total_tax
            
        values[b] += tax_val
        
    summary_list = [
        { "key": "matched", "label": "Matched", "value": float(values["matched"]), "count": counts["matched"] },
        { "key": "mismatched", "label": "Mismatched", "value": float(values["mismatched"]), "count": counts["mismatched"] },
        { "key": "missing_in_portal", "label": "Missing in Portal", "value": float(values["missing_in_portal"]), "count": counts["missing_in_portal"] },
        { "key": "missing_in_books", "label": "Missing in Books", "value": float(values["missing_in_books"]), "count": counts["missing_in_books"] },
        { "key": "probable", "label": "Probable", "value": float(values["probable"]), "count": counts["probable"] },
    ]
    
    itc_at_risk = values["missing_in_portal"] + values["mismatched"] + values["probable"]
    
    return {
        "summary": summary_list,
        "itc_at_risk": float(itc_at_risk),
    }

@app.get("/api/v1/runs/{run_id}/invoices")
def get_run_invoices(run_id: str, db: Session = Depends(get_db)):
    try:
        run_uuid = uuid.UUID(run_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid run ID format")
        
    results = db.query(MatchResult).filter(MatchResult.run_id == run_uuid).all()
    pr_dict = {pr.id: pr for pr in db.query(PurchaseInvoice).filter(PurchaseInvoice.run_id == run_uuid).all()}
    twob_dict = {twob.id: twob for twob in db.query(PortalInvoice).filter(PortalInvoice.run_id == run_uuid).all()}
    
    invoices_list = []
    for r in results:
        pr = pr_dict.get(r.purchase_invoice_id) if r.purchase_invoice_id else None
        twob = twob_dict.get(r.portal_invoice_id) if r.portal_invoice_id else None
        
        gstin = (pr.supplier_gstin if pr else twob.supplier_gstin) or "—"
        name = (pr.supplier_name if pr else twob.supplier_name) or "—"
        inv = (pr.invoice_number if pr else twob.invoice_number) or "—"
        date = (pr.invoice_date if pr else twob.invoice_date) or "—"
        taxable = (pr.taxable_value if pr else twob.taxable_value) or 0.0
        tax = (pr.total_tax if pr else twob.total_tax) or 0.0
        src = "PR" if pr and not twob else "2B" if twob and not pr else "PR+2B"
        
        invoices_list.append({
            "id": str(r.id),
            "gstin": gstin,
            "name": name,
            "inv": inv,
            "date": date,
            "taxable": float(taxable),
            "tax": float(tax),
            "src": src,
            "diff": float(r.tax_diff),
            "bucket": r.bucket.lower().replace("-", "_").replace(" ", "_")
        })
        
    return invoices_list

@app.get("/api/v1/runs/{run_id}/probable")
def get_run_probable(run_id: str, db: Session = Depends(get_db)):
    try:
        run_uuid = uuid.UUID(run_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid run ID format")
        
    results = db.query(MatchResult).filter(
        MatchResult.run_id == run_uuid,
        MatchResult.bucket.ilike("probable")
    ).all()
    
    pr_dict = {pr.id: pr for pr in db.query(PurchaseInvoice).filter(PurchaseInvoice.run_id == run_uuid).all()}
    twob_dict = {twob.id: twob for twob in db.query(PortalInvoice).filter(PortalInvoice.run_id == run_uuid).all()}
    
    probable_list = []
    for r in results:
        pr = pr_dict.get(r.purchase_invoice_id)
        twob = twob_dict.get(r.portal_invoice_id)
        
        if not pr or not twob:
            continue
            
        probable_list.append({
            "id": str(r.id),
            "name": pr.supplier_name or twob.supplier_name or "—",
            "gstin": pr.supplier_gstin or twob.supplier_gstin or "—",
            "date": pr.invoice_date or twob.invoice_date or "—",
            "taxable": float(pr.taxable_value),
            "tax": float(pr.total_tax),
            "conf": int(r.confidence),
            "prInv": pr.invoice_number,
            "twoInv": twob.invoice_number
        })
        
    return probable_list

# ---------------------------------------------------------
# 10. SETTINGS, VENDORS, & REPORTS ENDPOINTS
# ---------------------------------------------------------
class WorkspaceUpdate(BaseModel):
    name: str
    type: str

class UserInvite(BaseModel):
    fullName: str
    email: str
    role: str

class SettingsUpdate(BaseModel):
    tax_tolerance: float
    date_window_days: float
    fuzzy_threshold: float

@app.get("/api/v1/workspace")
def get_workspace_profile(tenant: dict = Depends(get_current_tenant_context), db: Session = Depends(get_db)):
    ws = db.query(Workspace).filter(Workspace.id == tenant["workspace_id"]).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return {"id": str(ws.id), "name": ws.name, "type": ws.type}

@app.patch("/api/v1/workspace")
def update_workspace_profile(payload: WorkspaceUpdate, tenant: dict = Depends(get_current_tenant_context), db: Session = Depends(get_db)):
    ws = db.query(Workspace).filter(Workspace.id == tenant["workspace_id"]).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    ws.name = payload.name
    ws.type = payload.type
    db.commit()
    return {"status": "success", "workspace": {"id": str(ws.id), "name": ws.name, "type": ws.type}}

@app.get("/api/v1/users")
def get_workspace_users(tenant: dict = Depends(get_current_tenant_context), db: Session = Depends(get_db)):
    users = db.query(User).filter(User.workspace_id == tenant["workspace_id"]).all()
    return [{"id": str(u.id), "name": u.full_name, "email": u.email, "role": "admin"} for u in users]

@app.post("/api/v1/users")
def invite_workspace_user(payload: UserInvite, tenant: dict = Depends(get_current_tenant_context), db: Session = Depends(get_db)):
    dummy_pass = hash_password("Password123")
    new_user = User(
        workspace_id=tenant["workspace_id"],
        email=payload.email,
        hashed_password=dummy_pass,
        full_name=payload.fullName
    )
    db.add(new_user)
    db.commit()
    return {"status": "success", "user": {"id": str(new_user.id), "name": new_user.full_name, "email": new_user.email, "role": payload.role}}

@app.get("/api/v1/workspace/settings")
def get_workspace_settings(tenant: dict = Depends(get_current_tenant_context), db: Session = Depends(get_db)):
    settings = db.query(WorkspaceSettings).filter(WorkspaceSettings.workspace_id == tenant["workspace_id"]).first()
    if not settings:
        settings = WorkspaceSettings(workspace_id=tenant["workspace_id"])
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return {
        "tax_tolerance": settings.tax_tolerance,
        "date_window_days": settings.date_window_days,
        "fuzzy_threshold": settings.fuzzy_threshold
    }

@app.patch("/api/v1/workspace/settings")
def update_workspace_settings(payload: SettingsUpdate, tenant: dict = Depends(get_current_tenant_context), db: Session = Depends(get_db)):
    settings = db.query(WorkspaceSettings).filter(WorkspaceSettings.workspace_id == tenant["workspace_id"]).first()
    if not settings:
        settings = WorkspaceSettings(workspace_id=tenant["workspace_id"])
        db.add(settings)
    settings.tax_tolerance = payload.tax_tolerance
    settings.date_window_days = payload.date_window_days
    settings.fuzzy_threshold = payload.fuzzy_threshold
    db.commit()
    return {"status": "success"}

@app.get("/api/v1/clients/{client_id}/settings")
def get_client_settings(client_id: str, db: Session = Depends(get_db)):
    # Fallback to general workspace settings for individual clients in this MVP
    return {
        "tax_tolerance": 1.0,
        "date_window_days": 2.0,
        "fuzzy_threshold": 80.0
    }

@app.patch("/api/v1/clients/{client_id}/settings")
def update_client_settings(client_id: str, payload: SettingsUpdate):
    return {"status": "success"}

@app.get("/api/v1/clients/{client_id}/vendors")
def get_client_vendors(client_id: str, db: Session = Depends(get_db)):
    try:
        c_uuid = uuid.UUID(client_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid client ID format")
    vendors = db.query(Vendor).filter(Vendor.client_id == c_uuid).all()
    
    # Calculate some dynamic status metrics for each vendor if runs exist
    res = []
    for v in vendors:
        # Check mismatch count
        mismatched_count = db.query(MatchResult).filter(
            MatchResult.client_id == c_uuid,
            MatchResult.bucket.in_(["Missing-in-Portal", "Mismatched"])
        ).join(PurchaseInvoice, MatchResult.purchase_invoice_id == PurchaseInvoice.id).filter(
            PurchaseInvoice.supplier_gstin == v.gstin
        ).count()
        
        status = "Reliable"
        color = "green"
        if mismatched_count > 5:
            status = "Frequent defaults"
            color = "amber"
        elif mismatched_count > 0:
            status = "Discrepancy flagged"
            color = "amber"
            
        res.append({
            "name": v.legal_name,
            "gstin": v.gstin,
            "status": status,
            "color": color
        })
    return res

# ============================================================
#  REAL EXPORT ROUTE  — replace the stubbed download_report in app/main.py
#  with the version below.
#
#  Add these imports near the top of app/main.py (if not already present):
#      import csv, io
#      from fastapi.responses import StreamingResponse
#  (uuid, HTTPException, Depends, Session, get_db, get_current_tenant_context,
#   ReconciliationRun, MatchResult, PurchaseInvoice, PortalInvoice are already imported.)
#
#  CSV always works (stdlib). XLSX works if `openpyxl` is installed
#  (pip install openpyxl); otherwise it transparently falls back to CSV.
# ============================================================

@app.get("/api/v1/runs/{run_id}/reports/{report_type}")
def download_report(
    run_id: str,
    report_type: str,
    format: str = "csv",
    tenant: dict = Depends(get_current_tenant_context),
    db: Session = Depends(get_db),
):
    """ Builds a downloadable reconciliation export (CSV / XLSX) from saved rows. """
    run_uuid = uuid.UUID(run_id)

    # Auth: the run must belong to the caller's workspace.
    run = db.query(ReconciliationRun).filter(ReconciliationRun.id == run_uuid).first()
    if not run or run.workspace_id != tenant["workspace_id"]:
        raise HTTPException(status_code=404, detail="Run not found")

    results = db.query(MatchResult).filter(MatchResult.run_id == run_uuid).all()

    # Optional filtering by report type.
    risk_buckets = {"Missing-in-Portal", "Mismatched", "Probable"}
    if report_type == "safe-to-claim":
        results = [r for r in results if (r.bucket or "").lower() == "matched"]
    elif report_type == "at-risk":
        results = [r for r in results if r.bucket in risk_buckets]
    # other types (reconciliation, notices, vendor-scorecard, annual-ledger) export all rows

    # Invoice detail lookups (so the export has supplier + amounts, not just ids).
    pr = {p.id: p for p in db.query(PurchaseInvoice).filter(PurchaseInvoice.run_id == run_uuid).all()}
    pb = {p.id: p for p in db.query(PortalInvoice).filter(PortalInvoice.run_id == run_uuid).all()}

    headers = [
        "bucket", "match_pass", "confidence", "tax_diff",
        "supplier_gstin", "supplier_name",
        "pr_invoice_no", "pr_taxable_value", "pr_total_tax",
        "portal_invoice_no", "portal_taxable_value", "portal_total_tax",
    ]

    def row_values(r):
        p = pr.get(r.purchase_invoice_id)
        b = pb.get(r.portal_invoice_id)
        src = p or b  # supplier info from whichever side exists
        return [
            r.bucket, r.match_pass, r.confidence, float(r.tax_diff or 0),
            getattr(src, "supplier_gstin", "") or "",
            getattr(src, "supplier_name", "") or "",
            getattr(p, "invoice_number", "") or "",
            float(getattr(p, "taxable_value", 0) or 0),
            float(getattr(p, "total_tax", 0) or 0),
            getattr(b, "invoice_number", "") or "",
            float(getattr(b, "taxable_value", 0) or 0),
            float(getattr(b, "total_tax", 0) or 0),
        ]

    filename = f"{report_type}_{run_id[:8]}"

    # ---- XLSX (if openpyxl is available) ----
    if format == "xlsx":
        try:
            import openpyxl
            from openpyxl.styles import Font

            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "Reconciliation"
            ws.append(headers)
            for cell in ws[1]:
                cell.font = Font(bold=True)
            for r in results:
                ws.append(row_values(r))

            buf = io.BytesIO()
            wb.save(buf)
            buf.seek(0)
            return StreamingResponse(
                buf,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f'attachment; filename="{filename}.xlsx"'},
            )
        except ImportError:
            pass  # no openpyxl -> fall through to CSV

    # ---- CSV (always available) ----
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    for r in results:
        writer.writerow(row_values(r))
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}.csv"'},
    )
