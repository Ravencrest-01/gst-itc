import uuid
from typing import List, Optional
from datetime import datetime, date
from sqlalchemy import String, ForeignKey, Boolean, Numeric, Integer, Date, LargeBinary
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import JSONB

from .base import Base, TimestampMixin, UUIDMixin
from .enums import BucketEnum, MatchPassEnum, ReviewStatusEnum, RoleEnum, WorkspaceTypeEnum, FileKindEnum, RunStatusEnum

class Workspace(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "workspace"
    name: Mapped[str] = mapped_column(String(255))
    type: Mapped[WorkspaceTypeEnum]
    
    users: Mapped[List["User"]] = relationship(back_populates="workspace", cascade="all, delete-orphan")
    clients: Mapped[List["Client"]] = relationship(back_populates="workspace", cascade="all, delete-orphan")

class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "app_user"
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspace.id"))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(255))
    role: Mapped[RoleEnum]
    
    workspace: Mapped["Workspace"] = relationship(back_populates="users")
    allocations: Mapped[List["ClientAllocation"]] = relationship(back_populates="user", cascade="all, delete-orphan")

class OTPVerification(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "otp_verification"
    email: Mapped[str] = mapped_column(String(255), index=True)
    otp_code: Mapped[str] = mapped_column(String(10))
    expires_at: Mapped[datetime]
    is_used: Mapped[bool] = mapped_column(default=False)

class Client(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "client"
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspace.id"))
    legal_name: Mapped[str] = mapped_column(String(255))
    gstin: Mapped[str] = mapped_column(String(15), unique=True, index=True)
    state_code: Mapped[str] = mapped_column(String(2))
    
    workspace: Mapped["Workspace"] = relationship(back_populates="clients")
    allocations: Mapped[List["ClientAllocation"]] = relationship(back_populates="client", cascade="all, delete-orphan")
    vendors: Mapped[List["Vendor"]] = relationship(back_populates="client", cascade="all, delete-orphan")
    files: Mapped[List["UploadedFile"]] = relationship(back_populates="client", cascade="all, delete-orphan")
    runs: Mapped[List["ReconciliationRun"]] = relationship(back_populates="client", cascade="all, delete-orphan")

class ClientAllocation(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "client_allocation"
    client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("client.id"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("app_user.id"))
    
    client: Mapped["Client"] = relationship(back_populates="allocations")
    user: Mapped["User"] = relationship(back_populates="allocations")

class Vendor(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "vendor"
    client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("client.id"))
    gstin: Mapped[str] = mapped_column(String(15), index=True)
    legal_name: Mapped[str] = mapped_column(String(255))
    contact_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_frequent: Mapped[bool] = mapped_column(default=False)
    source: Mapped[str] = mapped_column(String(50), default="system")
    
    client: Mapped["Client"] = relationship(back_populates="vendors")

class UploadedFile(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "uploaded_file"
    client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("client.id"))
    kind: Mapped[FileKindEnum]
    filename: Mapped[str] = mapped_column(String(255))
    financial_year: Mapped[Optional[str]] = mapped_column(String(9), nullable=True)
    tax_period: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    storage_path: Mapped[str] = mapped_column(String(512))
    row_count: Mapped[int] = mapped_column(default=0)
    
    client: Mapped["Client"] = relationship(back_populates="files")

class ReconciliationRun(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "reconciliation_run"
    client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("client.id"))
    status: Mapped[RunStatusEnum] = mapped_column(default=RunStatusEnum.pending)
    tax_period: Mapped[str] = mapped_column(String(7))
    total_records: Mapped[int] = mapped_column(default=0)
    
    client: Mapped["Client"] = relationship(back_populates="runs")
    purchase_invoices: Mapped[List["PurchaseInvoice"]] = relationship(back_populates="run", cascade="all, delete-orphan")
    portal_invoices: Mapped[List["PortalInvoice"]] = relationship(back_populates="run", cascade="all, delete-orphan")
    matches: Mapped[List["MatchResult"]] = relationship(back_populates="run", cascade="all, delete-orphan")

class PurchaseInvoice(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "purchase_invoice"
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("reconciliation_run.id"))
    supplier_gstin: Mapped[str] = mapped_column(String(15), index=True)
    supplier_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    invoice_number: Mapped[str] = mapped_column(String(50))
    invoice_number_norm: Mapped[str] = mapped_column(String(50), index=True)
    invoice_date: Mapped[date] = mapped_column(Date)
    taxable_value: Mapped[float] = mapped_column(Numeric(12, 2))
    cgst: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    sgst: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    igst: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    cess: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    total_tax: Mapped[float] = mapped_column(Numeric(12, 2))
    
    run: Mapped["ReconciliationRun"] = relationship(back_populates="purchase_invoices")

class PortalInvoice(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "portal_invoice"
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("reconciliation_run.id"))
    supplier_gstin: Mapped[str] = mapped_column(String(15), index=True)
    supplier_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    invoice_number: Mapped[str] = mapped_column(String(50))
    invoice_number_norm: Mapped[str] = mapped_column(String(50), index=True)
    invoice_date: Mapped[date] = mapped_column(Date)
    taxable_value: Mapped[float] = mapped_column(Numeric(12, 2))
    cgst: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    sgst: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    igst: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    cess: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    total_tax: Mapped[float] = mapped_column(Numeric(12, 2))
    
    run: Mapped["ReconciliationRun"] = relationship(back_populates="portal_invoices")

class MatchResult(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "match_result"
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("reconciliation_run.id"))
    purchase_invoice_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("purchase_invoice.id"), nullable=True)
    portal_invoice_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("portal_invoice.id"), nullable=True)
    
    bucket: Mapped[BucketEnum]
    match_pass: Mapped[Optional[MatchPassEnum]] = mapped_column(nullable=True)
    confidence: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    tax_diff: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    review_status: Mapped[ReviewStatusEnum] = mapped_column(default=ReviewStatusEnum.pending)
    
    run: Mapped["ReconciliationRun"] = relationship(back_populates="matches")
    purchase_invoice: Mapped[Optional["PurchaseInvoice"]] = relationship()
    portal_invoice: Mapped[Optional["PortalInvoice"]] = relationship()

class GSTNCredential(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "gstn_credential"
    client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("client.id"))
    username: Mapped[str] = mapped_column(String(255))
    encrypted_password: Mapped[bytes] = mapped_column(LargeBinary)
    
    client: Mapped["Client"] = relationship()

class Subscription(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "subscription"
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspace.id"))
    plan: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(50))
    
    workspace: Mapped["Workspace"] = relationship()
