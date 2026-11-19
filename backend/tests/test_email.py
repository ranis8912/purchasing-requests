"""Email routing: small attachments use sendMail (Mail.Send only); large ones use the draft + upload flow."""
from types import SimpleNamespace

import pytest

from app.services import email


class FakeResp:
    def __init__(self, body=None):
        self._body = body or {}

    def json(self):
        return self._body


@pytest.fixture
def graph_calls(monkeypatch):
    calls = []

    def fake_call(method, path, **kw):
        calls.append((method, path, kw))
        if path.endswith("/createUploadSession"):
            return FakeResp({"uploadUrl": "https://upload.example/x"})
        return FakeResp({"id": "draft1"})

    s = email.get_settings()
    for k, v in {"graph_app_id": "a", "graph_tenant_id": "t", "graph_client_secret": "s", "graph_shared_mailbox": "po@ges.com"}.items():
        monkeypatch.setattr(s, k, v)
    monkeypatch.setattr(email.graph, "call", fake_call)
    monkeypatch.setattr(email.requests, "put", lambda *a, **k: SimpleNamespace(status_code=200, text=""))
    return calls


def make_request(size: int):
    att = SimpleNamespace(file_name="sow.pdf", blob_path="x/y.pdf")
    return SimpleNamespace(
        request_number="PR-2026-0001", request_type="New SOW", vendor_name="Acme", job_number="1", job_description="J",
        cost_center="4100", cost_center_name="IT", expense_class="OpEx", amount=1000.0, currency="USD",
        requester_email="a@ges.com", requester_name="A", department=None, title="T", is_new_vendor=False,
        vendor_category="Other", vendor_contact_name=None, vendor_contact_email=None, capex_project_number=None,
        expense_type="Services", billing_type="Fixed fee", start_date=None, end_date=None, needed_by=None,
        is_budgeted=True, nda_in_place=False, vendor_data_access=False, description="<b>x</b>", attachments=[att],
    ), b"%PDF-" + b"0" * size


def test_small_attachments_use_sendmail(graph_calls, monkeypatch):
    r, data = make_request(1000)
    monkeypatch.setattr(email.storage, "get", lambda c, p: data)
    email.send_submission_email(r)
    assert [c[1] for c in graph_calls] == ["/users/po@ges.com/sendMail"]
    msg = graph_calls[0][2]["json"]["message"]
    assert msg["ccRecipients"][0]["emailAddress"]["address"] == "a@ges.com"
    assert msg["replyTo"][0]["emailAddress"]["address"] == "a@ges.com"
    assert "&lt;b&gt;x&lt;/b&gt;" in msg["body"]["content"]  # user text is escaped
    assert msg["subject"].startswith("[PR-2026-0001] New SOW")


def test_large_attachments_use_draft_and_upload_session(graph_calls, monkeypatch):
    r, data = make_request(5 * 1024 * 1024)
    monkeypatch.setattr(email.storage, "get", lambda c, p: data)
    email.send_submission_email(r)
    assert [c[1] for c in graph_calls] == [
        "/users/po@ges.com/messages",
        "/users/po@ges.com/messages/draft1/attachments/createUploadSession",
        "/users/po@ges.com/messages/draft1/send",
    ]
