"""Fake requests for local development and DEMO_MODE deployments. Fictional people and vendors only."""
import logging
import random
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Attachment, PurchaseRequest, StatusHistory
from . import lookups, storage

log = logging.getLogger(__name__)

VENDORS = ["Acme Consulting", "Northwind AV Rentals", "Brightline Staffing", "Contoso Networks", "Fabrikam Telecom",
           "Signet Print Co.", "Desert Electric LLC", "Tailspin Identity", "Orbit Freight", "Summit Facilities"]
TITLES = ["Show Wi-Fi services", "Booth graphics print run", "Temporary labor - CES", "Network refresh",
          "SSO platform renewal", "Forklift maintenance", "Freight for Orlando show", "Warehouse lighting upgrade"]
PEOPLE = [("dev.user@ges.com", "Dev User"), ("jordan.lee@example.com", "Jordan Lee"),
          ("maria.gomez@example.com", "Maria Gomez"), ("alex.chen@example.com", "Alex Chen")]
FLOW = ["Submitted", "In Review", "Info Needed", "PO/Req Created", "Contract Signed", "Closed", "Rejected"]
FAKE_PDF = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"


def seed(db: Session, count: int = 38) -> int:
    """Insert `count` demo requests. Only for local development or DEMO_MODE."""
    s = get_settings()
    if not s.use_local_services:
        raise RuntimeError("Demo data is only allowed locally or with DEMO_MODE=true")
    if not lookups.get_lists(db)["job_numbers"]:
        lookups.refresh(db, "demo-seed")
    lists = lookups.get_lists(db)
    rng = random.Random(7)
    now = datetime.now(timezone.utc)
    rows = []
    for _ in range(count):
        when = now - timedelta(days=rng.randint(0, 330), hours=rng.randint(0, 23))
        email, name = rng.choice(PEOPLE)
        job, cc = rng.choice(lists["job_numbers"]), rng.choice(lists["cost_centers"])
        capex = rng.random() < 0.3
        status = rng.choices(FLOW, weights=[3, 3, 2, 3, 2, 4, 1])[0]
        r = PurchaseRequest(
            submitted_at=when, requester_email=email, requester_name=name,
            department=rng.choice(["IT", "Operations", "Finance", "Marketing"]),
            request_type=rng.choice(lists["request_types"])["code"], title=rng.choice(TITLES),
            job_number=job["code"], job_description=job["label"], cost_center=cc["code"], cost_center_name=cc["label"],
            vendor_name=rng.choice(VENDORS), is_new_vendor=rng.random() < 0.2,
            vendor_category=rng.choice(lists["vendor_categories"])["code"],
            expense_class="CapEx" if capex else "OpEx", capex_project_number="CP-2026-014" if capex else None,
            expense_type=rng.choice(lists["expense_types"])["code"], amount=round(rng.uniform(2_000, 180_000), -2),
            currency="USD", billing_type=rng.choice(["Fixed fee", "Time & materials", "Recurring / subscription"]),
            start_date=date.today() + timedelta(days=rng.randint(-30, 60)),
            needed_by=date.today() + timedelta(days=rng.randint(3, 45)),
            description="DEMO DATA: fictional request for reviewing the portal.",
            status=status, email_status="Sent", email_sent_at=when,
        )
        r.history.append(StatusHistory(new_status="Submitted", changed_by=email, changed_at=when))
        if status != "Submitted":
            r.history.append(StatusHistory(
                old_status="Submitted", new_status=status, changed_by="purchasing.admin@example.com",
                changed_at=when + timedelta(days=2), note="Need W-9 from vendor." if status == "Info Needed" else None))
        rows.append(r)

    # Number in submission order so PR numbers increase with time, like real data.
    rows.sort(key=lambda r: r.submitted_at)
    per_year: dict[int, int] = {}  # continue after any existing numbers for that year
    for num in db.scalars(select(PurchaseRequest.request_number)):
        year, seq = int(num.split("-")[1]), int(num.split("-")[2])
        per_year[year] = max(per_year.get(year, 0), seq)
    for r in rows:
        per_year[r.submitted_at.year] = per_year.get(r.submitted_at.year, 0) + 1
        r.request_number = f"PR-{r.submitted_at.year}-{per_year[r.submitted_at.year]:04d}"
        path = f"{r.request_number}/demo.pdf"
        storage.put(s.blob_attachments_container, path, FAKE_PDF, "application/pdf")
        r.attachments.append(Attachment(file_name="Signed SOW (demo).pdf", blob_path=path, size_bytes=len(FAKE_PDF)))
        db.add(r)
    db.commit()
    log.info("Seeded %d demo requests", len(rows))
    return len(rows)


def seed_if_empty(db: Session) -> None:
    if not db.scalar(select(func.count()).select_from(PurchaseRequest)):
        seed(db)
