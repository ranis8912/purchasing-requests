"""Database tables. Column names stay close to a future Ironclad intake mapping."""
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


STATUSES = ["Submitted", "In Review", "Info Needed", "PO/Req Created", "Contract Signed", "Closed", "Rejected"]
OPEN_STATUSES = ["Submitted", "In Review", "Info Needed"]
EMAIL_STATUSES = ["Pending", "Sent", "Failed"]


class PurchaseRequest(Base):
    __tablename__ = "requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    request_number: Mapped[str] = mapped_column(String(20), unique=True, index=True)  # PR-2026-0001
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    requester_email: Mapped[str] = mapped_column(String(320), index=True)
    requester_name: Mapped[str] = mapped_column(String(200))
    department: Mapped[str | None] = mapped_column(String(200))

    request_type: Mapped[str] = mapped_column(String(100))
    title: Mapped[str] = mapped_column(String(200))
    # Code + description are both stored so history stays accurate when lists change.
    job_number: Mapped[str] = mapped_column(String(50), index=True)
    job_description: Mapped[str | None] = mapped_column(String(300))
    cost_center: Mapped[str] = mapped_column(String(50))
    cost_center_name: Mapped[str | None] = mapped_column(String(300))

    vendor_name: Mapped[str] = mapped_column(String(200), index=True)
    is_new_vendor: Mapped[bool] = mapped_column(Boolean, default=False)
    vendor_category: Mapped[str] = mapped_column(String(100))
    vendor_contact_name: Mapped[str | None] = mapped_column(String(200))
    vendor_contact_email: Mapped[str | None] = mapped_column(String(320))

    expense_class: Mapped[str] = mapped_column(String(10))  # OpEx | CapEx
    expense_type: Mapped[str] = mapped_column(String(100))
    capex_project_number: Mapped[str | None] = mapped_column(String(50))
    amount: Mapped[float] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    billing_type: Mapped[str] = mapped_column(String(50))
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    needed_by: Mapped[date | None] = mapped_column(Date)
    is_budgeted: Mapped[bool] = mapped_column(Boolean, default=True)
    nda_in_place: Mapped[bool] = mapped_column(Boolean, default=False)
    vendor_data_access: Mapped[bool] = mapped_column(Boolean, default=False)
    description: Mapped[str] = mapped_column(Text)

    status: Mapped[str] = mapped_column(String(30), default="Submitted", index=True)
    email_status: Mapped[str] = mapped_column(String(10), default="Pending")
    email_error: Mapped[str | None] = mapped_column(Text)
    email_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    admin_notes: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    attachments: Mapped[list["Attachment"]] = relationship(
        back_populates="request", cascade="all, delete-orphan", order_by="Attachment.id"
    )
    history: Mapped[list["StatusHistory"]] = relationship(
        back_populates="request", cascade="all, delete-orphan", order_by="StatusHistory.id"
    )


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("requests.id"), index=True)
    file_name: Mapped[str] = mapped_column(String(255))
    blob_path: Mapped[str] = mapped_column(String(400))
    size_bytes: Mapped[int] = mapped_column(Integer)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    request: Mapped[PurchaseRequest] = relationship(back_populates="attachments")


class StatusHistory(Base):
    __tablename__ = "status_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("requests.id"), index=True)
    old_status: Mapped[str | None] = mapped_column(String(30))
    new_status: Mapped[str] = mapped_column(String(30))
    changed_by: Mapped[str] = mapped_column(String(320))
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    note: Mapped[str | None] = mapped_column(Text)

    request: Mapped[PurchaseRequest] = relationship(back_populates="history")


class LookupValue(Base):
    """Lists of values loaded from the SharePoint workbook (Oracle later)."""

    __tablename__ = "lookup_values"
    __table_args__ = (UniqueConstraint("list_name", "code"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    list_name: Mapped[str] = mapped_column(String(50), index=True)
    code: Mapped[str] = mapped_column(String(100))
    label: Mapped[str] = mapped_column(String(300))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class LookupRefresh(Base):
    """One row per refresh attempt, so admins can see when lists last loaded and why a load failed."""

    __tablename__ = "lookup_refreshes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    source: Mapped[str] = mapped_column(String(50))  # sharepoint | local
    ok: Mapped[bool] = mapped_column(Boolean)
    message: Mapped[str] = mapped_column(Text)
    triggered_by: Mapped[str] = mapped_column(String(320))
