"""API request/response shapes."""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

CURRENCIES = ["USD", "CAD", "EUR", "GBP"]
BILLING_TYPES = ["Fixed fee", "Time & materials", "Recurring / subscription", "One-time purchase"]


class RequestIn(BaseModel):
    """Form fields. Sent as a JSON string in the multipart 'payload' part next to the PDF files."""

    request_type: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=3, max_length=200)
    department: str | None = Field(default=None, max_length=200)
    job_number: str = Field(min_length=1, max_length=50)
    cost_center: str = Field(min_length=1, max_length=50)

    vendor_name: str = Field(min_length=2, max_length=200)
    is_new_vendor: bool = False
    vendor_category: str = Field(min_length=1, max_length=100)
    vendor_contact_name: str | None = Field(default=None, max_length=200)
    vendor_contact_email: EmailStr | None = None

    expense_class: Literal["OpEx", "CapEx"]
    expense_type: str = Field(min_length=1, max_length=100)
    capex_project_number: str | None = Field(default=None, max_length=50)
    amount: float = Field(gt=0, lt=1_000_000_000)
    currency: Literal["USD", "CAD", "EUR", "GBP"] = "USD"
    billing_type: str = Field(min_length=1, max_length=50)
    start_date: date | None = None
    end_date: date | None = None
    needed_by: date | None = None
    is_budgeted: bool = True
    nda_in_place: bool = False
    vendor_data_access: bool = False
    description: str = Field(min_length=10, max_length=5000)

    @model_validator(mode="after")
    def _rules(self):
        if self.billing_type not in BILLING_TYPES:
            raise ValueError(f"billing_type must be one of {BILLING_TYPES}")
        if self.is_new_vendor and not (self.vendor_contact_name and self.vendor_contact_email):
            raise ValueError("New vendors need a contact name and email")
        if self.expense_class == "CapEx" and not self.capex_project_number:
            raise ValueError("CapEx requests need a capital project number")
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("End date is before start date")
        return self


class AttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    file_name: str
    size_bytes: int
    uploaded_at: datetime


class HistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    old_status: str | None
    new_status: str
    changed_by: str
    changed_at: datetime
    note: str | None


class RequestSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    request_number: str
    submitted_at: datetime
    requester_name: str
    requester_email: str
    request_type: str
    title: str
    job_number: str
    cost_center: str
    vendor_name: str
    expense_class: str
    amount: float
    currency: str
    needed_by: date | None
    status: str
    email_status: str


class RequestDetail(RequestSummary):
    department: str | None
    job_description: str | None
    cost_center_name: str | None
    is_new_vendor: bool
    vendor_category: str
    vendor_contact_name: str | None
    vendor_contact_email: str | None
    expense_type: str
    capex_project_number: str | None
    billing_type: str
    start_date: date | None
    end_date: date | None
    is_budgeted: bool
    nda_in_place: bool
    vendor_data_access: bool
    description: str
    email_error: str | None
    email_sent_at: datetime | None
    admin_notes: str | None
    updated_at: datetime
    attachments: list[AttachmentOut]
    history: list[HistoryOut]


class StatusUpdate(BaseModel):
    status: str
    note: str | None = Field(default=None, max_length=2000)


class NotesUpdate(BaseModel):
    admin_notes: str = Field(max_length=5000)
