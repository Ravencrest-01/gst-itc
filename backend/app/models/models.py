import uuid
from sqlalchemy import (
    Column, String, ForeignKey, Date, Numeric, Float, 
    Index, UniqueConstraint, DateTime, text
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from app.models.base import Base

class Organization(Base):
    __tablename__ = "organization"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    gstin = Column(String, nullable=False)
    legal_name = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AppUser(Base):
    __tablename__ = "app_user"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("org_id", "email", name="uq_user_org_email"),
    )


class Vendor(Base):
    __tablename__ = "vendor"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True)
    gstin = Column(String, nullable=False)
    name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ReconciliationRun(Base):
    __tablename__ = "reconciliation_run"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("app_user.id"), nullable=False)
    tax_period = Column(String, nullable=False)
    status = Column(String, nullable=False, default="created")  # "created" | "matching" | "completed"
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_run_org_tax_period", "org_id", "tax_period"),
    )


class UploadedFile(Base):
    __tablename__ = "uploaded_file"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True)
    run_id = Column(UUID(as_uuid=True), ForeignKey("reconciliation_run.id", ondelete="CASCADE"), nullable=False, index=True)
    file_type = Column(String, nullable=False)  # "PR" | "2B"
    filename = Column(String, nullable=False)
    storage_path = Column(String, nullable=False)
    row_count = Column(Numeric, nullable=True)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class PurchaseInvoice(Base):
    __tablename__ = "purchase_invoice"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True)
    run_id = Column(UUID(as_uuid=True), ForeignKey("reconciliation_run.id", ondelete="CASCADE"), nullable=False, index=True)
    vendor_id = Column(UUID(as_uuid=True), ForeignKey("vendor.id"), nullable=True)
    supplier_gstin = Column(String, nullable=False)
    invoice_no = Column(String, nullable=False)
    invoice_no_norm = Column(String, nullable=True)
    invoice_date = Column(Date, nullable=False)
    taxable_value = Column(Numeric(18, 2), nullable=False)
    cgst = Column(Numeric(18, 2), nullable=False)
    sgst = Column(Numeric(18, 2), nullable=False)
    igst = Column(Numeric(18, 2), nullable=False)
    cess = Column(Numeric(18, 2), nullable=False)
    total_tax = Column(Numeric(18, 2), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class PortalInvoice(Base):
    __tablename__ = "portal_invoice"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True)
    run_id = Column(UUID(as_uuid=True), ForeignKey("reconciliation_run.id", ondelete="CASCADE"), nullable=False, index=True)
    vendor_id = Column(UUID(as_uuid=True), ForeignKey("vendor.id"), nullable=True)
    supplier_gstin = Column(String, nullable=False)
    invoice_no = Column(String, nullable=False)
    invoice_no_norm = Column(String, nullable=True)
    invoice_date = Column(Date, nullable=False)
    taxable_value = Column(Numeric(18, 2), nullable=False)
    cgst = Column(Numeric(18, 2), nullable=False)
    sgst = Column(Numeric(18, 2), nullable=False)
    igst = Column(Numeric(18, 2), nullable=False)
    cess = Column(Numeric(18, 2), nullable=False)
    total_tax = Column(Numeric(18, 2), nullable=False)
    filing_period = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class MatchResult(Base):
    __tablename__ = "match_result"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True)
    run_id = Column(UUID(as_uuid=True), ForeignKey("reconciliation_run.id", ondelete="CASCADE"), nullable=False, index=True)
    purchase_invoice_id = Column(UUID(as_uuid=True), ForeignKey("purchase_invoice.id"), nullable=True)
    portal_invoice_id = Column(UUID(as_uuid=True), ForeignKey("portal_invoice.id"), nullable=True)
    bucket = Column(String, nullable=False)  # "matched" | "mismatched" | "missing_in_portal" | "missing_in_books" | "probable"
    match_pass = Column(String, nullable=False)  # "exact" | "normalized" | "tolerance" | "fuzzy" | "none"
    confidence = Column(Float, nullable=False)
    tax_diff = Column(Numeric(18, 2), nullable=False)
    status = Column(String, nullable=False)  # "auto" | "pending_review" | "confirmed" | "rejected"
    reviewed_by = Column(UUID(as_uuid=True), ForeignKey("app_user.id"), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class DiscrepancyNotice(Base):
    __tablename__ = "discrepancy_notice"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True)
    run_id = Column(UUID(as_uuid=True), ForeignKey("reconciliation_run.id", ondelete="CASCADE"), nullable=False, index=True)
    vendor_id = Column(UUID(as_uuid=True), ForeignKey("vendor.id"), nullable=False)
    match_result_id = Column(UUID(as_uuid=True), ForeignKey("match_result.id"), nullable=False)
    notice_type = Column(String, nullable=False)
    channel = Column(String, nullable=False)
    status = Column(String, nullable=False)
    generated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    sent_at = Column(DateTime(timezone=True), nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_log"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True)
    run_id = Column(UUID(as_uuid=True), ForeignKey("reconciliation_run.id"), nullable=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("app_user.id"), nullable=True)
    action = Column(String, nullable=False)
    entity_type = Column(String, nullable=False)
    entity_id = Column(UUID(as_uuid=True), nullable=True)
    details = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
