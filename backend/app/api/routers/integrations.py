from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.integration import (
    TallyImportRequest, TallyImportResponse, GstnCredentialRequest, GstnCredentialResponse,
    Fetch2bRequest, Fetch2bResponse, JobStatusResponse
)
from app.models.models import Client, User, GstnCredential, UploadedFile, FileKind
from app.api.dependencies.client import get_current_client
from app.api.dependencies.auth import get_current_user
import uuid
import json
import os
from datetime import datetime, timezone

router = APIRouter()

def load_mock_config():
    config_path = os.path.join("mock_data", "config.json")
    if os.path.exists(config_path):
        with open(config_path, "r") as f:
            return json.load(f)
    return {}

@router.post("/clients/{id}/tally/import", response_model=TallyImportResponse)
def import_tally(
    id: uuid.UUID,
    connection: str = Form(None),
    tally_file: UploadFile = File(None),
    client: Client = Depends(get_current_client),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not connection and not tally_file:
        raise HTTPException(status_code=400, detail="Must provide connection or tally_file")
        
    mock_config = load_mock_config()
    rows_imported = mock_config.get("tally_rows_imported", 150)
    
    # Mocking Tally Import
    uploaded_file = UploadedFile(
        client_id=client.id,
        uploaded_by=current_user.id,
        kind=FileKind.purchase_register,
        filename=tally_file.filename if tally_file else "tally_import.xml",
        storage_url="mock_data/uploads/tally_import_mock.xml",
        byte_size=1024,
        financial_year="2026-27",
        tax_period="2026-07"
    )
    db.add(uploaded_file)
    db.commit()
    db.refresh(uploaded_file)
    
    return TallyImportResponse(
        file_id=uploaded_file.id,
        kind="purchase_register",
        rows_imported=rows_imported
    )

@router.post("/clients/{id}/gstn/credentials", response_model=GstnCredentialResponse)
def save_gstn_credentials(
    id: uuid.UUID,
    data: GstnCredentialRequest,
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db)
):
    credential = db.query(GstnCredential).filter(GstnCredential.client_id == client.id).first()
    
    # Mocking encryption
    secret_ref = f"encrypted_{data.secret}"
    
    if credential:
        credential.gstin = data.gstin
        credential.username = data.username
        credential.secret_ref = secret_ref
    else:
        credential = GstnCredential(
            client_id=client.id,
            gstin=data.gstin,
            username=data.username,
            secret_ref=secret_ref
        )
        db.add(credential)
        
    db.commit()
    return GstnCredentialResponse(status="success")

@router.post("/clients/{id}/gstn/fetch-2b", response_model=Fetch2bResponse)
def fetch_gstr_2b(
    id: uuid.UUID,
    data: Fetch2bRequest,
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db)
):
    credential = db.query(GstnCredential).filter(GstnCredential.client_id == client.id).first()
    if not credential:
        raise HTTPException(status_code=400, detail="GSTN credentials not found")
        
    job_id = str(uuid.uuid4())
    # In a real system, queue a background task here
    print(f"Mock queuing GSTN fetch job: {job_id}")
    
    return Fetch2bResponse(job_id=job_id, status="queued")

@router.get("/gstn/jobs/{jobId}", response_model=JobStatusResponse)
def check_job_status(
    jobId: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Mocking job completion
    # Real logic would check redis/celery/database
    
    return JobStatusResponse(
        job_id=jobId,
        status="done",
        file_id=None # Mocking no file attached for this simple check
    )
