# -*- coding: utf-8 -*-
"""Render Phase 4 report pages to PNG for visual QA."""
import pypdfium2 as pdfium

pdf = pdfium.PdfDocument("/home/z/my-project/download/Dwellers_Phase4_Nationwide_Discovery_Report.pdf")
print("total pages:", len(pdf))
for idx in [0, 1, 2, 7, 11, 18]:
    page = pdf[idx]
    bitmap = page.render(scale=1.4)
    img = bitmap.to_pil()
    out = f"/home/z/my-project/scripts/phase4-qa-p{idx + 1}.png"
    img.save(out)
    print("saved", out)
