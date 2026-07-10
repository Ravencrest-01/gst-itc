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

@router.post("/register", response_model=TokenData)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    
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
