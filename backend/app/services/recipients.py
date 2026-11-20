"""Submission email recipients, managed by Purchasing admins on the Admin page.

If admins haven't saved recipients yet, To falls back to the EMAIL_TO app setting (then the sender mailbox).
The requester is always CC'd in addition to these.
"""
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import AppSetting

TO, CC = "email_to", "email_cc"


def split(value: str | None) -> list[str]:
    return [a.strip() for a in (value or "").replace(";", ",").split(",") if a.strip()]


def get(db: Session) -> dict:
    to, cc = db.get(AppSetting, TO), db.get(AppSetting, CC)
    s = get_settings()
    saved = bool(to and to.value)
    return {
        "to": to.value if saved else (s.email_to or s.graph_shared_mailbox),
        "cc": cc.value if cc else "",
        "source": "admin" if saved else "app setting",
        "updated_by": to.updated_by if to else None,
        "updated_at": to.updated_at if to else None,
    }


def resolve(db: Session) -> tuple[list[str], list[str]]:
    r = get(db)
    return split(r["to"]), split(r["cc"])


def save(db: Session, to: list[str], cc: list[str], user: str) -> dict:
    for key, values in ((TO, to), (CC, cc)):
        row = db.get(AppSetting, key) or AppSetting(key=key)
        row.value, row.updated_by = ", ".join(values), user
        db.add(row)
    db.commit()
    return get(db)
