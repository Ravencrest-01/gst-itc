import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import verify_password, get_password_hash, create_access_token
from app.core.email import send_otp_email
from app.core.dependencies import get_current_tenant_context, TenantContext
from app.models.domain import User, Workspace, OTPVerification
from app.models.enums import RoleEnum
from app.schemas.auth import OTPRequest, RegisterRequest, LoginRequest, TokenData, UserOut

router = APIRouter()

import random
def generate_otp() -> str:
    return str(random.randint(100000, 999999))

@router.post("/request-otp")
def request_otp(payload: OTPRequest, db: Session = Depends(get_db)):
    otp = generate_otp()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    
    # Store OTP
    db.add(OTPVerification(email=payload.email, otp_code=otp, expires_at=expires_at))
    db.commit()
    
    # Send email (or console fallback)
    send_otp_email(payload.email, otp)
    return {"message": "OTP sent successfully"}

@router.post("/register", response_model=TokenData)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    # 1. Verify OTP
    otp_record = db.execute(
        select(OTPVerification)
        .where(OTPVerification.email == payload.email)
        .where(OTPVerification.otp_code == payload.otp)
        .where(OTPVerification.is_used == False)
        .where(OTPVerification.expires_at > datetime.now(timezone.utc))
    ).scalar_one_or_none()
    
    if not otp_record:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")
    
    otp_record.is_used = True
    
    # 2. Check existing user
    if db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User already exists")
        
    # 3. Create Workspace
    workspace = Workspace(name=payload.workspace_name, type=payload.workspace_type)
    db.add(workspace)
    db.flush()
    
    # 4. Create Admin User
    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=get_password_hash(payload.password),
        workspace_id=workspace.id,
        role=RoleEnum.admin
    )
    db.add(user)
    db.commit()
    
    token = create_access_token(user.id, user.email, workspace.id, user.role)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": UserOut(id=user.id, name=user.full_name, email=user.email, workspace_id=workspace.id, role=user.role)
    }

@router.post("/login", response_model=TokenData)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
        
    if payload.otp:
        otp_record = db.execute(
            select(OTPVerification)
            .where(OTPVerification.email == payload.email)
            .where(OTPVerification.otp_code == payload.otp)
            .where(OTPVerification.is_used == False)
            .where(OTPVerification.expires_at > datetime.now(timezone.utc))
        ).scalar_one_or_none()
        if not otp_record:
            raise HTTPException(status_code=400, detail="Invalid or expired OTP")
        otp_record.is_used = True
        db.commit()
        
    token = create_access_token(user.id, user.email, user.workspace_id, user.role)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": UserOut(id=user.id, name=user.full_name, email=user.email, workspace_id=user.workspace_id, role=user.role)
    }

@router.get("/me", response_model=UserOut)
def get_me(ctx: TenantContext = Depends(get_current_tenant_context)):
    return UserOut(
        id=ctx.user.id,
        name=ctx.user.full_name,
        email=ctx.user.email,
        workspace_id=ctx.workspace.id,
        role=ctx.user.role
    )
