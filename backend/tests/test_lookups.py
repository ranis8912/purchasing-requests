import io

import pytest
from openpyxl import Workbook

from app.db import SessionLocal
from app.services import lookups


def workbook(**sheets) -> bytes:
    wb = Workbook()
    wb.remove(wb.active)
    for name, rows in sheets.items():
        ws = wb.create_sheet(name)
        for r in rows:
            ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


GOOD = {s: [["Code", "Name", "Active"], ["A", "Alpha", "Y"], ["B", "Beta", "N"]] for s in lookups.SHEETS.values()}


def test_parse_good_workbook():
    lists = lookups.parse_workbook(workbook(**GOOD))
    assert lists["job_numbers"] == [("A", "Alpha")]


@pytest.mark.parametrize("sheets, error", [
    ({k: v for k, v in GOOD.items() if k != "JobNumbers"}, "Missing sheet 'JobNumbers'"),
    ({**GOOD, "CostCenters": [["Code", "Name"], ["A", "x"], ["A", "y"]]}, "Duplicate value 'A'"),
    ({**GOOD, "ExpenseTypes": [["Value", "Active"], ["X", "N"]]}, "no active values"),
])
def test_bad_workbook_rejected(sheets, error):
    with pytest.raises(lookups.WorkbookError, match=error):
        lookups.parse_workbook(workbook(**sheets))


def test_failed_refresh_keeps_last_good_lists(client, monkeypatch, tmp_path):
    bad = tmp_path / "bad.xlsx"
    bad.write_bytes(workbook(JobNumbers=[["Code"], ["1"]]))
    monkeypatch.setattr(lookups.get_settings(), "local_lists_file", str(bad))
    with SessionLocal() as db:
        before = lookups.get_lists(db)
        entry = lookups.refresh(db, "test")
        assert not entry.ok and "Missing sheet" in entry.message
        assert lookups.get_lists(db) == before
