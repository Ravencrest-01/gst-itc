import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base

Base = declarative_base()

class Workspace(Base):
    __tablename__ = "workspace"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    type = Column(String(50), default="in_house")
    created_at = Column(DateTime, default=datetime.utcnow)

class Client(Base):
    __tablename__ = "client"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False)
    gstin = Column(String(15), nullable=False)
    legal_name = Column(String(255), nullable=False)
    state_code = Column(String(2), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class User(Base):
    __tablename__ = "user_account"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class ReconciliationRun(Base):
    __tablename__ = "reconciliation_run"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspace.id"), nullable=False)
    client_id = Column(UUID(as_uuid=True), ForeignKey("client.id"), nullable=False)
    tax_period = Column(String(7), nullable=False)
    status = Column(String(50), default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)

class MatchResult(Base):
    __tablename__ = "match_result"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(UUID(as_uuid=True), ForeignKey("reconciliation_run.id", ondelete="CASCADE"), nullable=False)
    client_id = Column(UUID(as_uuid=True), ForeignKey("client.id"), nullable=False)
    purchase_invoice_id = Column(UUID(as_uuid=True), nullable=True)
    portal_invoice_id = Column(UUID(as_uuid=True), nullable=True)
    bucket = Column(String(50), nullable=False)
    match_pass = Column(String(50), nullable=True)
    confidence = Column(Float, nullable=False)
    tax_diff = Column(Float, default=0.0)
    status = Column(String(50), default="unreviewed")

class OTPVerification(Base):
    __tablename__ = "otp_verification"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), index=True, nullable=False)
    otp_code = Column(String(6), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used = Column(String(5), default="false")
    created_at = Column(DateTime, default=datetime.utcnow)

class UserClientRole(Base):
    __tablename__ = "user_client_role"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("user_account.id", ondelete="CASCADE"), nullable=False)
    client_id = Column(UUID(as_uuid=True), ForeignKey("client.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(50), nullable=False) # admin, reviewer, analyst
    created_at = Column(DateTime, default=datetime.utcnow)

class PurchaseInvoice(Base):
    __tablename__ = "purchase_invoice"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(UUID(as_uuid=True), ForeignKey("reconciliation_run.id", ondelete="CASCADE"), nullable=False)
    client_id = Column(UUID(as_uuid=True), ForeignKey("client.id"), nullable=False)
    invoice_number = Column(String(100), nullable=False)
    invoice_date = Column(String(50), nullable=True)
    supplier_gstin = Column(String(15), nullable=True)
    supplier_name = Column(String(255), nullable=True)
    taxable_value = Column(Float, default=0.0)
    total_tax = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

class PortalInvoice(Base):
    __tablename__ = "portal_invoice"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(UUID(as_uuid=True), ForeignKey("reconciliation_run.id", ondelete="CASCADE"), nullable=False)
    client_id = Column(UUID(as_uuid=True), ForeignKey("client.id"), nullable=False)
    invoice_number = Column(String(100), nullable=False)
    invoice_date = Column(String(50), nullable=True)
    supplier_gstin = Column(String(15), nullable=True)
    supplier_name = Column(String(255), nullable=True)
    taxable_value = Column(Float, default=0.0)
    total_tax = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

class Vendor(Base):
    __tablename__ = "vendor"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id = Column(UUID(as_uuid=True), ForeignKey("client.id", ondelete="CASCADE"), nullable=False)
    gstin = Column(String(15), nullable=False)
    legal_name = Column(String(255), nullable=False)
    contact_email = Column(String(255), nullable=True)
    contact_phone = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class WorkspaceSettings(Base):
    __tablename__ = "workspace_settings"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False)
    tax_tolerance = Column(Float, default=1.0)
    date_window_days = Column(Float, default=2.0)
    fuzzy_threshold = Column(Float, default=80.0)
    created_at = Column(DateTime, default=datetime.utcnow)