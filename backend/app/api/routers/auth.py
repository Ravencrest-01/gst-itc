from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.auth import (
    RequestOtp, RequestOtpResponse, RegisterRequest, AuthResponse, LoginRequest, UserInfo
)
from app.schemas.user import (
    UserMeResponse, UserUpdateNameRequest, UserUpdateNameResponse,
    UserUpdateEmailRequest, UserUpdateEmailResponse, UpdateAvatarResponse
)
from app.models.models import User, Workspace, OtpVerification, OtpPurpose, Subscription, SubscriptionPlan, SubscriptionStatus, UserRole
from app.core.security import get_password_hash, verify_password, create_access_token
from app.api.dependencies.auth import get_current_user
import uuid
import random
import string
from datetime import datetime, timezone, timedelta
from app.core.email import send_otp_email

router = APIRouter()

import json
import os

def load_mock_config():
    config_path = os.path.join("mock_data", "config.json")
    if os.path.exists(config_path):
        with open(config_path, "r") as f:
            return json.load(f)
    return {}

@router.post("/auth/request-otp", response_model=RequestOtpResponse)
def request_otp(data: RequestOtp, db: Session = Depends(get_db)):
    # OTP logic
    otp_code = "".join(random.choices(string.digits, k=6))
    
    otp_record = OtpVerification(
        email=data.email,
        otp_code=otp_code,
        purpose=OtpPurpose.register,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10)
    )
    db.add(otp_record)
    db.commit()
    
    # Send email
    send_otp_email(data.email, otp_code, "registration")
    
    return RequestOtpResponse(status="success", message="OTP sent successfully")

@router.post("/auth/register", response_model=AuthResponse)
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    # Verify OTP
    otp_record = db.query(OtpVerification).filter(
        OtpVerification.email == data.email,
        OtpVerification.otp_code == data.otp,
        OtpVerification.purpose == OtpPurpose.register,
        OtpVerification.used == False,
        OtpVerification.expires_at > datetime.now(timezone.utc)
    ).first()
    
    if not otp_record:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")
        
    otp_record.used = True
    
    existing_user = db.query(User).filter(User.email == data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
        
    workspace = Workspace(type=data.workspace_type, name=data.workspace_name)
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    
    subscription = Subscription(
        workspace_id=workspace.id,
        plan=SubscriptionPlan.free,
        status=SubscriptionStatus.active,
        seats=1 if data.workspace_type == "solo" else 5
    )
    db.add(subscription)
    
    user = User(
        workspace_id=workspace.id,
        role=UserRole.admin,
        full_name=data.full_name,
        email=data.email,
        hashed_password=get_password_hash(data.password)
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    access_token = create_access_token(subject=str(user.id))
    
    return AuthResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserInfo(name=user.full_name, email=user.email)
    )

@router.post("/auth/login", response_model=AuthResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
        
    if user.status != "active":
        raise HTTPException(status_code=401, detail="Account disabled")
        
    access_token = create_access_token(subject=str(user.id))
    return AuthResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserInfo(name=user.full_name, email=user.email)
    )

@router.get("/auth/me", response_model=UserMeResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return UserMeResponse(
        id=current_user.id,
        name=current_user.full_name,
        email=current_user.email,
        workspace_id=current_user.workspace_id,
        role=current_user.role
    )

@router.patch("/me", response_model=UserUpdateNameResponse)
def update_me(data: UserUpdateNameRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not data.full_name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    current_user.full_name = data.full_name
    db.commit()
    return UserUpdateNameResponse(
        id=current_user.id,
        full_name=current_user.full_name,
        email=current_user.email
    )

@router.post("/me/email/request-otp", response_model=RequestOtpResponse)
def request_email_update_otp(data: RequestOtp, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already taken")
        
    otp_code = "".join(random.choices(string.digits, k=6))
    
    otp_record = OtpVerification(
        email=data.email,
        otp_code=otp_code,
        purpose=OtpPurpose.email_change,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10)
    )
    db.add(otp_record)
    db.commit()
    
    send_otp_email(data.email, otp_code, "email_change")
    
    return RequestOtpResponse(status="success", message="OTP sent successfully")

@router.patch("/me/email", response_model=UserUpdateEmailResponse)
def update_email(data: UserUpdateEmailRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    otp_record = db.query(OtpVerification).filter(
        OtpVerification.email == data.new_email,
        OtpVerification.otp_code == data.otp,
        OtpVerification.purpose == OtpPurpose.email_change,
        OtpVerification.used == False,
        OtpVerification.expires_at > datetime.now(timezone.utc)
    ).first()
    
    if not otp_record:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")
        
    otp_record.used = True
    current_user.email = data.new_email
    db.commit()
    
    return UserUpdateEmailResponse(id=current_user.id, email=current_user.email)

# In a real app this would handle multipart form data for file upload
@router.put("/me/avatar", response_model=UpdateAvatarResponse)
def update_avatar(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Mocking avatar update
    avatar_url = "https://example.com/avatar.jpg"
    current_user.avatar_url = avatar_url
    db.commit()
    return UpdateAvatarResponse(avatar_url=avatar_url)
