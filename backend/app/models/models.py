import enum
from sqlalchemy import Column, String, Integer, Boolean, ForeignKey, DateTime, Float, Enum, UniqueConstraint
from sqlalchemy.orm import relationship
from app.models.base import BaseModel

class WorkspaceType(str, enum.Enum):
    solo = "solo"
    firm = "firm"

class SubscriptionPlan(str, enum.Enum):
    free = "free"
    pro = "pro"
    firm = "firm"

class SubscriptionStatus(str, enum.Enum):
    active = "active"
    past_due = "past_due"
    cancelled = "cancelled"

class UserRole(str, enum.Enum):
    admin = "admin"
    member = "member"

class UserStatus(str, enum.Enum):
    active = "active"
    disabled = "disabled"

class ClientStatus(str, enum.Enum):
    active = "active"
    archived = "archived"

class VendorSource(str, enum.Enum):
    auto = "auto"
    manual = "manual"

class FileKind(str, enum.Enum):
    purchase_register = "purchase_register"
    gstr_2b = "gstr_2b"

class RunStatus(str, enum.Enum):
    pending = "pending"
    completed = "completed"
    failed = "failed"

class Bucket(str, enum.Enum):
    matched = "matched"
    mismatched = "mismatched"
    missing_in_portal = "missing_in_portal"
    missing_in_books = "missing_in_books"
    probable = "probable"

class MatchPass(str, enum.Enum):
    exact = "exact"
    normalized = "normalized"
    tolerance = "tolerance"
    fuzzy = "fuzzy"

class ReviewStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    rejected = "rejected"
    skipped = "skipped"

class ExportJobType(str, enum.Enum):
    report = "report"
    tally = "tally"

class OtpPurpose(str, enum.Enum):
    register = "register"
    email_change = "email_change"

class OtpVerification(BaseModel):
    __tablename__ = "otp_verification"
    email = Column(String, index=True, nullable=False)
    otp_code = Column(String, nullable=False)
    purpose = Column(Enum(OtpPurpose), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used = Column(Boolean, default=False)

class Workspace(BaseModel):
    __tablename__ = "workspace"
    type = Column(Enum(WorkspaceType), nullable=False)
    name = Column(String, nullable=False)

class Subscription(BaseModel):
    __tablename__ = "subscription"
    workspace_id = Column(ForeignKey("workspace.id"), nullable=False, unique=True)
    plan = Column(Enum(SubscriptionPlan), nullable=False)
    status = Column(Enum(SubscriptionStatus), nullable=False)
    seats = Column(Integer, default=1)
    renews_at = Column(DateTime(timezone=True))

class User(BaseModel):
    __tablename__ = "user"
    workspace_id = Column(ForeignKey("workspace.id"), nullable=False)
    role = Column(Enum(UserRole), nullable=False)
    full_name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    avatar_url = Column(String)
    status = Column(Enum(UserStatus), nullable=False, default=UserStatus.active)

class Client(BaseModel):
    __tablename__ = "client"
    workspace_id = Column(ForeignKey("workspace.id"), nullable=False)
    legal_name = Column(String, nullable=False)
    gstin = Column(String(15), nullable=False)
    state_code = Column(String(2), nullable=False)
    status = Column(Enum(ClientStatus), nullable=False, default=ClientStatus.active)
    default_financial_year = Column(String)

class ClientAllocation(BaseModel):
    __tablename__ = "client_allocation"
    client_id = Column(ForeignKey("client.id"), nullable=False)
    user_id = Column(ForeignKey("user.id"), nullable=False)
    allocated_at = Column(DateTime(timezone=True))

class Vendor(BaseModel):
    __tablename__ = "vendor"
    client_id = Column(ForeignKey("client.id"), nullable=False)
    gstin = Column(String(15), nullable=False)
    legal_name = Column(String, nullable=False)
    contact_email = Column(String)
    is_frequent = Column(Boolean, default=False)
    source = Column(Enum(VendorSource), nullable=False, default=VendorSource.manual)

class GstnCredential(BaseModel):
    __tablename__ = "gstn_credential"
    client_id = Column(ForeignKey("client.id"), nullable=False, unique=True)
    gstin = Column(String(15), nullable=False)
    username = Column(String, nullable=False)
    secret_ref = Column(String, nullable=False)
    last_synced_at = Column(DateTime(timezone=True))

class UploadedFile(BaseModel):
    __tablename__ = "uploaded_file"
    client_id = Column(ForeignKey("client.id"), nullable=False)
    run_id = Column(ForeignKey("reconciliation_run.id"))
    uploaded_by = Column(ForeignKey("user.id"), nullable=False)
    kind = Column(Enum(FileKind), nullable=False)
    filename = Column(String, nullable=False)
    storage_url = Column(String, nullable=False)
    byte_size = Column(Integer, nullable=False)
    financial_year = Column(String, nullable=False)
    tax_period = Column(String, nullable=False)

class ReconciliationRun(BaseModel):
    __tablename__ = "reconciliation_run"
    workspace_id = Column(ForeignKey("workspace.id"), nullable=False)
    client_id = Column(ForeignKey("client.id"), nullable=False)
    created_by = Column(ForeignKey("user.id"), nullable=False)
    financial_year = Column(String, nullable=False)
    tax_period = Column(String, nullable=False)
    status = Column(Enum(RunStatus), nullable=False, default=RunStatus.pending)

class PurchaseInvoice(BaseModel):
    __tablename__ = "purchase_invoice"
    run_id = Column(ForeignKey("reconciliation_run.id"), nullable=False)
    client_id = Column(ForeignKey("client.id"), nullable=False)
    source_file_id = Column(ForeignKey("uploaded_file.id"))
    supplier_gstin = Column(String, nullable=False)
    supplier_name = Column(String, nullable=False)
    invoice_number = Column(String, nullable=False)
    invoice_date = Column(String, nullable=False)
    taxable_value = Column(Float, nullable=False)
    total_tax = Column(Float, nullable=False)

class PortalInvoice(BaseModel):
    __tablename__ = "portal_invoice"
    run_id = Column(ForeignKey("reconciliation_run.id"), nullable=False)
    client_id = Column(ForeignKey("client.id"), nullable=False)
    source_file_id = Column(ForeignKey("uploaded_file.id"))
    supplier_gstin = Column(String, nullable=False)
    supplier_name = Column(String, nullable=False)
    invoice_number = Column(String, nullable=False)
    invoice_date = Column(String, nullable=False)
    taxable_value = Column(Float, nullable=False)
    total_tax = Column(Float, nullable=False)

class MatchResult(BaseModel):
    __tablename__ = "match_result"
    run_id = Column(ForeignKey("reconciliation_run.id"), nullable=False)
    client_id = Column(ForeignKey("client.id"), nullable=False)
    purchase_invoice_id = Column(ForeignKey("purchase_invoice.id"))
    portal_invoice_id = Column(ForeignKey("portal_invoice.id"))
    bucket = Column(Enum(Bucket), nullable=False)
    match_pass = Column(Enum(MatchPass))
    confidence = Column(Float)
    tax_diff = Column(Float)
    review_status = Column(Enum(ReviewStatus), nullable=False, default=ReviewStatus.pending)
    reviewed_by = Column(ForeignKey("user.id"))

class ExportJob(BaseModel):
    __tablename__ = "export_job"
    run_id = Column(ForeignKey("reconciliation_run.id"), nullable=False)
    created_by = Column(ForeignKey("user.id"), nullable=False)
    type = Column(Enum(ExportJobType), nullable=False)
    format = Column(String)
    status = Column(String)
    file_url = Column(String)
