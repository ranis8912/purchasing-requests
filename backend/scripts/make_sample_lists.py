"""Create the lists-of-values workbook template with SAMPLE values (replace with real lists from purchasing)."""
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

SHEETS = {
    "RequestTypes": (["Value", "Active"], [["New SOW", "Y"], ["Requisition", "Y"], ["Purchase Order", "Y"],
                     ["Contract", "Y"], ["Amendment", "Y"], ["Renewal", "Y"], ["Change Order", "Y"]]),
    "JobNumbers": (["Code", "Description", "Active"], [["100001", "SAMPLE – Corporate IT", "Y"],
                   ["100002", "SAMPLE – Las Vegas Shows", "Y"], ["100003", "SAMPLE – Orlando Shows", "Y"],
                   ["100004", "SAMPLE – Retired job", "N"]]),
    "CostCenters": (["Code", "Name", "Active"], [["4100", "SAMPLE – Information Technology", "Y"],
                    ["4200", "SAMPLE – Finance", "Y"], ["4300", "SAMPLE – Operations", "Y"], ["4400", "SAMPLE – Marketing", "Y"]]),
    "VendorCategories": (["Value", "Active"], [["Consultant / Professional Services", "Y"], ["Software / SaaS", "Y"],
                         ["Hardware", "Y"], ["Contractor / Staff Augmentation", "Y"], ["Facilities", "Y"], ["Other", "Y"]]),
    "ExpenseTypes": (["Value", "Active"], [["Services", "Y"], ["Software license", "Y"], ["Equipment", "Y"],
                     ["Maintenance & support", "Y"], ["Travel & events", "Y"], ["Other", "Y"]]),
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
