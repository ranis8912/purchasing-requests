"""Nightly SQLite backup to the 'backups' Blob container (lifecycle rule deletes copies after 30 days)."""
import logging
import sqlite3
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from ..config import get_settings
from . import storage

log = logging.getLogger(__name__)


def backup_database() -> str:
    s = get_settings()
    name = f"po_intake_{datetime.now(timezone.utc):%Y%m%d_%H%M%S}.db"
    with tempfile.TemporaryDirectory() as tmp:
        copy = Path(tmp) / name
        src, dst = sqlite3.connect(s.db_path), sqlite3.connect(copy)
        try:
            src.backup(dst)  # consistent snapshot even while the app is writing
        finally:
            dst.close()
            src.close()
        storage.put(s.blob_backups_container, name, copy.read_bytes())
    log.info("Database backed up as %s", name)
    return name
