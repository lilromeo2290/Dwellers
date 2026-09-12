"""Render sample pages of the Phase 2 report to PNG for visual QA."""
import pypdfium2 as pdfium

SRC = "/home/z/my-project/download/Dwellers_Phase2_Backend_Foundation_Report.pdf"
pdf = pdfium.PdfDocument(SRC)
pages = {0: "cover", 1: "toc", 2: "ch1", 7: "mid", 9: "callouts", 14: "last"}
for idx, name in pages.items():
    page = pdf[idx]
    bmp = page.render(scale=1.4)
    img = bmp.to_pil()
    out = f"/home/z/my-project/scripts/phase2-qa-{name}.png"
    img.save(out)
    print("saved", out)
