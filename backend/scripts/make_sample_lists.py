"""Create the lists-of-values workbook template with SAMPLE values (replace with real lists from purchasing)."""
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

SHEETS = {
    "Approvers": (["Email", "Name", "Active"], [["approver.one@example.com", "SAMPLE – Approver One", "Y"],
                  ["approver.two@example.com", "SAMPLE – Approver Two", "Y"],
                  ["approver.three@example.com", "SAMPLE – Approver Three", "Y"],
                  ["former.approver@example.com", "SAMPLE – Former Approver", "N"]]),
}

out = Path(__file__).resolve().parent.parent / "sample_data" / "PO Intake Lists.xlsx"
wb = Workbook()
wb.remove(wb.active)
for name, (header, rows) in SHEETS.items():
    ws = wb.create_sheet(name)
    ws.append(header)
    for c in ws[1]:
        c.font, c.fill = Font(bold=True, color="FFFFFF"), PatternFill("solid", fgColor="063C59")
    for r in rows:
        ws.append(r)
    ws.column_dimensions["A"].width, ws.column_dimensions["B"].width = 36, 40
wb.save(out)
print("Wrote", out)
