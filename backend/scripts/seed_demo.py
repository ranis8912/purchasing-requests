"""Fill a LOCAL database with demo requests so the dashboard can be reviewed."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionLocal, init_db  # noqa: E402
from app.services import demo  # noqa: E402

init_db()
with SessionLocal() as db:
    print(f"Seeded {demo.seed(db)} demo requests")
