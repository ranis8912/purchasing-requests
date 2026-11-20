"""Purchasing requests: submit, list, detail, attachments, and admin actions."""
import csv
import io
import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response, StreamingResponse
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..auth import User, get_current_user, require_admin
from ..config import get_settings
from ..db import get_db
from ..models import STATUSES, Attachment, PurchaseRequest, StatusHistory, utcnow
from ..schemas import NotesUpdate, RequestDetail, RequestIn, RequestSummary, StatusUpdate
from ..services import email, lookups, storage

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/requests", tags=["requests"])


def _next_number(db: Session) -> str:
    prefix = f"PR-{datetime.now(timezone.utc).year}-"
    last = db.scalar(select(func.max(PurchaseRequest.request_number)).where(PurchaseRequest.request_number.like(f"{prefix}%")))
    seq = int(last.rsplit("-", 1)[1]) + 1 if last else 1
    return f"{prefix}{seq:04d}"


def _get_visible(db: Session, number: str, user: User) -> PurchaseRequest:
    r = db.scalar(
        select(PurchaseRequest)
        .where(PurchaseRequest.request_number == number)
        .options(selectinload(PurchaseRequest.attachments), selectinload(PurchaseRequest.history))
    )
    # Same 404 for "missing" and "not yours", so request numbers can't be probed.
    if not r or (not user.is_admin and r.requester_email != user.email):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    return r


def _send_email(db: Session, r: PurchaseRequest) -> None:
    try:
        email.send_submission_email(r)
        r.email_status, r.email_error, r.email_sent_at = "Sent", None, utcnow()
    except Exception as exc:
        log.exception("Email failed for %s", r.request_number)
        r.email_status, r.email_error = "Failed", str(exc)[:1000]
    db.commit()


async def _read_files(files: list[UploadFile]) -> list[tuple[str, bytes]]:
    s = get_settings()
    if not files:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Attach at least one supporting document")
    if len(files) > s.max_files:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Attach at most {s.max_files} files")
    out = []
    for f in files:
        data = await f.read()
        name = (f.filename or "attachment").replace("\\", "/").rsplit("/", 1)[-1][:255]
        kind = storage.FILE_TYPES.get(storage.extension(name))
        if not kind:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"'{name}': only PDF, Word or Excel files are allowed")
        if not data.startswith(kind[1]):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"'{name}' doesn't match its file type")
        if len(data) > s.max_file_mb * 1024 * 1024:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"'{name}' is larger than {s.max_file_mb} MB")
        out.append((name, data))
    return out


@router.post("", response_model=RequestDetail, status_code=status.HTTP_201_CREATED)
async def submit_request(
    payload: str = Form(...),
    files: list[UploadFile] = File(default=[]),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        data = RequestIn.model_validate(json.loads(payload))
    except ValidationError as exc:
        msgs = "; ".join(f"{'.'.join(map(str, e['loc'])) or 'form'}: {e['msg']}" for e in exc.errors())
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, msgs) from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Invalid form data") from exc
    uploads = await _read_files(files)

    approver = lookups.find(db, "approvers", data.approver_email)
    if not approver:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Approver is not on the approvers list")

    s = get_settings()
    r = PurchaseRequest(
        **data.model_dump(exclude={"po_recipients"}),
        po_recipients=", ".join(data.po_recipients) or None,
        approver_name=approver.label,
        request_number=_next_number(db),
        requester_email=user.email,
        requester_name=user.name,
    )
    for name, content in uploads:
        path = f"{r.request_number}/{uuid.uuid4().hex}{storage.extension(name)}"
        storage.put(s.blob_attachments_container, path, content, storage.content_type(name))
        r.attachments.append(Attachment(file_name=name, blob_path=path, size_bytes=len(content)))
    r.history.append(StatusHistory(old_status=None, new_status="Pending Review", changed_by=user.email))
    db.add(r)
    db.commit()
    log.info("Request %s submitted by %s", r.request_number, user.email)

    _send_email(db, r)  # request is already saved; a failed email is flagged for admin resend
    return r


@router.get("", response_model=list[RequestSummary])
def list_requests(
    scope: str = Query("mine", pattern="^(mine|all)$"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = select(PurchaseRequest).order_by(PurchaseRequest.submitted_at.desc())
    if scope == "mine" or not user.is_admin:
        q = q.where(PurchaseRequest.requester_email == user.email)
    return db.scalars(q).all()


@router.get("/export.csv")
def export_csv(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    cols = [c.name for c in PurchaseRequest.__table__.columns if c.name != "id"]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(cols)
    for r in db.scalars(select(PurchaseRequest).order_by(PurchaseRequest.submitted_at)):
        w.writerow([getattr(r, c) for c in cols])
    name = f"purchasing_requests_{datetime.now(timezone.utc):%Y%m%d}.csv"
    return Response(buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.get("/{number}", response_model=RequestDetail)
def get_request(number: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _get_visible(db, number, user)


@router.get("/{number}/attachments/{attachment_id}")
def download_attachment(number: str, attachment_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = _get_visible(db, number, user)
    a = next((a for a in r.attachments if a.id == attachment_id), None)
    if not a:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    data = storage.get(get_settings().blob_attachments_container, a.blob_path)
    safe = a.file_name.replace('"', "")
    # PDFs open in the browser; Word/Excel files download.
    disposition = "inline" if storage.extension(a.file_name) == ".pdf" else "attachment"
    return StreamingResponse(io.BytesIO(data), media_type=storage.content_type(a.file_name),
                             headers={"Content-Disposition": f'{disposition}; filename="{safe}"'})


@router.patch("/{number}/status", response_model=RequestDetail)
def update_status(number: str, body: StatusUpdate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if body.status not in STATUSES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Status must be one of {STATUSES}")
    r = _get_visible(db, number, admin)
    if body.status != r.status or body.note:
        r.history.append(StatusHistory(old_status=r.status, new_status=body.status, changed_by=admin.email, note=body.note))
        r.status = body.status
        db.commit()
    return r


@router.put("/{number}/notes", response_model=RequestDetail)
def update_notes(number: str, body: NotesUpdate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    r = _get_visible(db, number, admin)
    r.admin_notes = body.admin_notes
    db.commit()
    return r


@router.post("/{number}/resend-email", response_model=RequestDetail)
def resend_email(number: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    r = _get_visible(db, number, admin)
    log.info("Email resend for %s by %s", number, admin.email)
    _send_email(db, r)
    return r
