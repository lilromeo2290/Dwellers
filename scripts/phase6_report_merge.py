# -*- coding: utf-8 -*-
"""Merge cover + body into the final Phase 6 report PDF."""
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89


def normalize_page_to_a4(page, force=False):
    box = page.mediabox
    w, h = float(box.width), float(box.height)
    if force or abs(w - A4_W) > 0.1 or abs(h - A4_H) > 0.1:
        page.scale_to(A4_W, A4_H)
    return page


writer = PdfWriter()
cover_page = PdfReader("/home/z/my-project/scripts/phase6-report-cover.pdf").pages[0]
writer.add_page(normalize_page_to_a4(cover_page, force=True))
for page in PdfReader("/home/z/my-project/scripts/phase6-report-body.pdf").pages:
    writer.add_page(normalize_page_to_a4(page))
writer.add_metadata({
    "/Title": "Dwellers - Phase 5 Request Service / Job Requests Report",
    "/Author": "Z.ai",
    "/Creator": "Z.ai",
    "/Subject": ("Delivery record for the Phase 6 QUOTATIONS build: "
                 "quote state machine, server-side pesewa totals, eligibility, expiry, races, "
                 "accept/decline and the payment boundary"),
})
out = "/home/z/my-project/download/Dwellers_Phase6_Quotations_Report.pdf"
with open(out, "wb") as f:
    writer.write(f)
print("pages:", len(writer.pages), "->", out)
