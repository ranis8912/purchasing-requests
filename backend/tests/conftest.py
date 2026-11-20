import base64
import json
import os
import tempfile
from pathlib import Path

import pytest

_tmp = Path(tempfile.mkdtemp())
os.environ.update({
    "APP_ENV": "local", "AUTH_MODE": "easyauth", "SCHEDULER_ENABLED": "false",
    "DB_PATH": str(_tmp / "test.db"), "LOCAL_FILES_DIR": str(_tmp / "files"), "STATIC_DIR": str(_tmp / "static"),
    "GRAPH_APP_ID": "", "GRAPH_CLIENT_SECRET": "", "SP_SITE_URL": "", "BLOB_ACCOUNT_URL": "",
})
(_tmp / "static").mkdir()
(_tmp / "static" / "index.html").write_text("<html>spa</html>")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

PDF = b"%PDF-1.4\n%test\n"


def principal(email: str, name: str = "Test User", roles: tuple[str, ...] = ()) -> dict:
    claims = [{"typ": "preferred_username", "val": email}, {"typ": "name", "val": name}]
    claims += [{"typ": "roles", "val": r} for r in roles]
    raw = base64.b64encode(json.dumps({"auth_typ": "aad", "claims": claims}).encode()).decode().rstrip("=")
    return {"X-MS-CLIENT-PRINCIPAL": raw}


ALICE = principal("alice@ges.com", "Alice Requester")
BOB = principal("bob@ges.com", "Bob Requester")
ADMIN = principal("po.admin@ges.com", "Pat Admin", ("Admin",))


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


def form(**overrides) -> dict:
    data = {
        "approver_email": "approver.one@example.com", "po_recipients": ["ap@ges.com"],
        "is_po_extension": False, "is_capital_project": False,
        "project_number": "012345678", "cost_center": "0410", "supplier_name": "Acme Consulting",
        "start_date": "2026-01-01", "end_date": "2026-12-31", "agreement_signed": False, "amount": 85000,
        "description": "Annual network assessment for all show sites.",
    }
    data.update(overrides)
    return data


def submit(client, headers, files=None, **overrides):
    files = files if files is not None else [("supporting_files", ("sow.pdf", PDF, "application/pdf"))]
    return client.post("/api/requests", headers=headers, data={"payload": json.dumps(form(**overrides))}, files=files)
