from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.file import UploadedFileResponse, UploadedFileListResponse
from app.models.models import UploadedFile as UploadedFileModel, Client, User, FileKind
from app.api.dependencies.client import get_current_client
from app.api.dependencies.auth import get_current_user
import uuid
from typing import Optional
import os
import shutil

router = APIRouter()

UPLOAD_DIR = "mock_data/uploads" # Storing files here locally for MVP
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/clients/{id}/files", response_model=UploadedFileResponse)
def upload_file(
    id: uuid.UUID,
    file: UploadFile = File(...),
    kind: FileKind = Form(...),
    financial_year: str = Form(...),
    tax_period: str = Form(...),
    client: Client = Depends(get_current_client),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if kind not in [FileKind.purchase_register, FileKind.gstr_2b]:
        raise HTTPException(status_code=400, detail="Invalid kind")
        
    file_path = os.path.join(UPLOAD_DIR, f"{uuid.uuid4()}_{file.filename}")
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    byte_size = os.path.getsize(file_path)
    if byte_size > 10 * 1024 * 1024: # 10MB limit for example
        raise HTTPException(status_code=400, detail="File too large")
        
    uploaded_file = UploadedFileModel(
        client_id=client.id,
        uploaded_by=current_user.id,
        kind=kind,
        filename=file.filename,
        storage_url=file_path,
        byte_size=byte_size,
        financial_year=financial_year,
        tax_period=tax_period
    )
    db.add(uploaded_file)
    db.commit()
    db.refresh(uploaded_file)
    
    return UploadedFileResponse(
        id=uploaded_file.id,
        client_id=uploaded_file.client_id,
        run_id=uploaded_file.run_id,
        uploaded_by=uploaded_file.uploaded_by,
        kind=uploaded_file.kind,
        filename=uploaded_file.filename,
        storage_url=uploaded_file.storage_url,
        byte_size=uploaded_file.byte_size,
        financial_year=uploaded_file.financial_year,
        tax_period=uploaded_file.tax_period,
        uploaded_at=uploaded_file.created_at
    )

@router.get("/clients/{id}/files", response_model=UploadedFileListResponse)
def list_files(
    id: uuid.UUID,
    kind: Optional[FileKind] = None,
    fy: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db)
):
    query = db.query(UploadedFileModel).filter(UploadedFileModel.client_id == client.id)
    if kind:
        query = query.filter(UploadedFileModel.kind == kind)
    if fy:
        query = query.filter(UploadedFileModel.financial_year == fy)
        
    total = query.count()
    files = query.order_by(UploadedFileModel.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    
    items = [
        UploadedFileResponse(
            id=f.id,
            client_id=f.client_id,
            run_id=f.run_id,
            uploaded_by=f.uploaded_by,
            kind=f.kind,
            filename=f.filename,
            storage_url=f.storage_url,
            byte_size=f.byte_size,
            financial_year=f.financial_year,
            tax_period=f.tax_period,
            uploaded_at=f.created_at
        ) for f in files
    ]
    return UploadedFileListResponse(items=items, total=total, page=page, page_size=page_size)

@router.get("/files/{fileId}/download")
def download_file(fileId: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    uploaded_file = db.query(UploadedFileModel).filter(UploadedFileModel.id == fileId).first()
    if not uploaded_file:
        raise HTTPException(status_code=404, detail="File not found")
        
    # Access check (user must have access to the file's client)
    # Reusing client access logic manually or relying on middleware in real app
    # For MVP we can assume allowed if in workspace
    
    if not os.path.exists(uploaded_file.storage_url):
        raise HTTPException(status_code=404, detail="File missing on disk")
        
    return FileResponse(path=uploaded_file.storage_url, filename=uploaded_file.filename)

@router.delete("/files/{fileId}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(fileId: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    uploaded_file = db.query(UploadedFileModel).filter(UploadedFileModel.id == fileId).first()
    if not uploaded_file:
        raise HTTPException(status_code=404, detail="File not found")
        
    if uploaded_file.run_id:
        raise HTTPException(status_code=400, detail="Cannot delete file used in a run")
        
    db.delete(uploaded_file)
    db.commit()
    # Optionally delete from disk
    if os.path.exists(uploaded_file.storage_url):
        os.remove(uploaded_file.storage_url)
    return None
