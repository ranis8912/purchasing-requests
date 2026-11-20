"""Health, current user, lists of values, and admin list refresh."""
from fastapi import APIRouter, Depends
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from ..auth import User, get_current_user, require_admin
from ..config import Settings, get_settings
from ..db import get_db
from ..models import STATUSES, URGENT_REASONS, LookupRefresh, LookupValue
from ..schemas import RecipientsUpdate
from ..services import lookups, recipients

router = APIRouter(prefix="/api")


@router.get("/health", tags=["meta"])
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


@router.get("/me", tags=["meta"])
def me(user: User = Depends(get_current_user), settings: Settings = Depends(get_settings)):
    return {"email": user.email, "name": user.name, "is_admin": user.is_admin, "demo_mode": settings.demo_mode,
            "email_live": settings.email_configured}


@router.get("/lookups", tags=["meta"])
def get_lookups(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {**lookups.get_lists(db), "urgent_reasons": URGENT_REASONS, "statuses": STATUSES}


def _refresh_status(db: Session) -> dict:
    last = db.scalars(select(LookupRefresh).order_by(LookupRefresh.id.desc()).limit(10)).all()
    counts = dict(db.execute(select(LookupValue.list_name, func.count()).group_by(LookupValue.list_name)).all())
    return {
        "counts": {k: counts.get(k, 0) for k in lookups.SHEETS},
        "sheets": lookups.SHEETS,
        "refreshes": [
            {"started_at": r.started_at, "ok": r.ok, "source": r.source, "message": r.message, "triggered_by": r.triggered_by}
            for r in last
        ],
    }


@router.get("/admin/lookups", tags=["admin"])
def lookup_status(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return _refresh_status(db)


@router.post("/admin/lookups/refresh", tags=["admin"])
def refresh_lookups(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    lookups.refresh(db, admin.email)
    return _refresh_status(db)


@router.get("/admin/recipients", tags=["admin"])
def get_recipients(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return recipients.get(db)


@router.put("/admin/recipients", tags=["admin"])
def set_recipients(body: RecipientsUpdate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return recipients.save(db, [str(a) for a in body.to], [str(a) for a in body.cc], admin.email)
