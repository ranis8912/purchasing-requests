from conftest import ADMIN, ALICE, BOB, submit


def test_health_and_auth(client):
    assert client.get("/api/health").json() == {"status": "ok"}
    assert client.get("/api/me").status_code == 401
    assert client.get("/api/me", headers={"X-MS-CLIENT-PRINCIPAL": "not-base64!"}).status_code == 401
    me = client.get("/api/me", headers=ADMIN).json()
    assert me == {"email": "po.admin@ges.com", "name": "Pat Admin", "is_admin": True, "demo_mode": False, "email_live": False}
    assert client.get("/api/me", headers=ALICE).json()["is_admin"] is False


def test_lookups_loaded_at_startup(client):
    lists = client.get("/api/lookups", headers=ALICE).json()
    assert [j["code"] for j in lists["job_numbers"]] == ["100001", "100002", "100003"]  # inactive row skipped
    assert lists["cost_centers"][0] == {"code": "4100", "label": "SAMPLE – Information Technology"}


def test_submit_saves_request_and_sends_email(client):
    r = submit(client, ALICE)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["request_number"].startswith("PR-") and body["status"] == "Submitted"
    assert body["email_status"] == "Sent"  # local mode writes to the outbox folder
    assert body["job_description"] == "SAMPLE – Corporate IT"
    assert body["attachments"][0]["file_name"] == "sow.pdf"
    pdf = client.get(f"/api/requests/{body['request_number']}/attachments/{body['attachments'][0]['id']}", headers=ALICE)
    assert pdf.content.startswith(b"%PDF-")


def test_validation(client):
    assert submit(client, ALICE, files=[]).status_code == 422
    assert submit(client, ALICE, files=[("files", ("x.pdf", b"MZ not a pdf", "application/pdf"))]).status_code == 422
    assert submit(client, ALICE, expense_class="CapEx").status_code == 422  # needs project number
    assert submit(client, ALICE, expense_class="CapEx", capex_project_number="CP-1").status_code == 201
    assert submit(client, ALICE, is_new_vendor=True).status_code == 422  # needs contact
    assert submit(client, ALICE, job_number="999999").status_code == 422
    assert submit(client, ALICE, amount=0).status_code == 422


def test_requesters_only_see_their_own(client):
    number = submit(client, BOB).json()["request_number"]
    assert client.get(f"/api/requests/{number}", headers=ALICE).status_code == 404
    assert client.get(f"/api/requests/{number}", headers=BOB).status_code == 200
    assert client.get(f"/api/requests/{number}", headers=ADMIN).status_code == 200
    alice_all = client.get("/api/requests?scope=all", headers=ALICE).json()  # non-admin "all" = mine
    assert alice_all and all(r["requester_email"] == "alice@ges.com" for r in alice_all)
    admin_all = {r["requester_email"] for r in client.get("/api/requests?scope=all", headers=ADMIN).json()}
    assert {"alice@ges.com", "bob@ges.com"} <= admin_all


def test_admin_actions(client):
    number = submit(client, ALICE).json()["request_number"]
    url = f"/api/requests/{number}"
    assert client.patch(f"{url}/status", headers=ALICE, json={"status": "Closed"}).status_code == 403
    assert client.patch(f"{url}/status", headers=ADMIN, json={"status": "Bogus"}).status_code == 422
    r = client.patch(f"{url}/status", headers=ADMIN, json={"status": "Info Needed", "note": "Need W-9"}).json()
    assert r["status"] == "Info Needed" and r["history"][-1]["note"] == "Need W-9"
    notes = client.put(f"{url}/notes", headers=ADMIN, json={"admin_notes": "Called vendor"}).json()
    assert notes["admin_notes"] == "Called vendor"
    assert client.post(f"{url}/resend-email", headers=ADMIN).json()["email_status"] == "Sent"
    assert client.get("/api/requests/export.csv", headers=ALICE).status_code == 403
    assert number in client.get("/api/requests/export.csv", headers=ADMIN).text


def test_spa_routing(client):
    assert client.get("/requests/PR-2026-0001").text == "<html>spa</html>"
    missing_api = client.get("/api/does-not-exist", headers=ALICE)
    assert missing_api.status_code == 404 and missing_api.headers["content-type"].startswith("application/json")
    assert client.get("/..%2F..%2Fapp%2Fconfig.py").text == "<html>spa</html>"


def test_admin_by_group_claim(client, monkeypatch):
    from app.config import get_settings
    from conftest import principal
    import base64, json
    monkeypatch.setattr(get_settings(), "azure_ad_admin_group_id", "grp-123")
    claims = [{"typ": "preferred_username", "val": "g@ges.com"}, {"typ": "groups", "val": "grp-123"}]
    hdr = {"X-MS-CLIENT-PRINCIPAL": base64.b64encode(json.dumps({"claims": claims}).encode()).decode()}
    assert client.get("/api/me", headers=hdr).json()["is_admin"] is True
    assert client.get("/api/me", headers=principal("x@ges.com")).json()["is_admin"] is False


def test_demo_seed(client, monkeypatch):
    from app.config import get_settings
    from app.db import SessionLocal
    from app.services import demo
    monkeypatch.setattr(get_settings(), "app_env", "dev")
    with SessionLocal() as db:
        try:
            demo.seed(db, 2)
            raise AssertionError("seed must refuse outside local/demo")
        except RuntimeError:
            pass
        monkeypatch.setattr(get_settings(), "demo_mode", True)
        assert demo.seed(db, 3) == 3
