"""Submission email recipients, managed by Purchasing admins on the Admin page.

If admins haven't saved recipients yet, To falls back to the EMAIL_TO app setting (then the sender mailbox).
The requester is always CC'd in addition to these. High-value CCs are added only at or above HIGH_VALUE_AMOUNT.
"""
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import HIGH_VALUE_AMOUNT, AppSetting

TO, CC, HIGH_VALUE_CC = "email_to", "email_cc", "email_cc_high_value"


def split(value: str | None) -> list[str]:
    return [a.strip() for a in (value or "").replace(";", ",").split(",") if a.strip()]


def get(db: Session) -> dict:
    to, cc, hv = db.get(AppSetting, TO), db.get(AppSetting, CC), db.get(AppSetting, HIGH_VALUE_CC)
    s = get_settings()
    saved = bool(to and to.value)
    return {
        "to": to.value if saved else (s.email_to or s.graph_shared_mailbox),
        "cc": cc.value if cc else "",
        "high_value_cc": hv.value if hv else "",
        "source": "admin" if saved else "app setting",
        "updated_by": to.updated_by if to else None,
        "updated_at": to.updated_at if to else None,
    }


def resolve(db: Session, amount: float) -> tuple[list[str], list[str]]:
    r = get(db)
    cc = split(r["cc"]) + (split(r["high_value_cc"]) if amount >= HIGH_VALUE_AMOUNT else [])
    seen: set[str] = set()
    return split(r["to"]), [a for a in cc if not (a.lower() in seen or seen.add(a.lower()))]


def save(db: Session, to: list[str], cc: list[str], high_value_cc: list[str], user: str) -> dict:
    for key, values in ((TO, to), (CC, cc), (HIGH_VALUE_CC, high_value_cc)):
        row = db.get(AppSetting, key) or AppSetting(key=key)
        row.value, row.updated_by = ", ".join(values), user
        db.add(row)
    db.commit()
    return get(db)
