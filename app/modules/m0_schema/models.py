import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, Date, DateTime, ForeignKey
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