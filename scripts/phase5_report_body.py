# -*- coding: utf-8 -*-
"""Dwellers Phase 5 Request Service - body PDF builder (ReportLab, TOC route)."""
import os, sys, hashlib

PDF_SKILL_DIR = "/home/z/my-project/skills/pdf"
sys.path.insert(0, os.path.join(PDF_SKILL_DIR, "scripts"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily, stringWidth
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, PageBreak,
                                Table, TableStyle, KeepTogether, CondPageBreak,
                                Flowable, HRFlowable)
from reportlab.platypus.tableofcontents import TableOfContents

from phase5_report_content import CH1, CH2, CH3, CH4, CH5, CH6, CH7, CH8, CH9, CH10, CH11, TITLE, SUBJECT
from phase5_report_content2 import CH12, CH13

CHAPTERS = [CH1, CH2, CH3, CH4, CH5, CH6, CH7, CH8, CH9, CH10, CH11, CH12, CH13]

# ---------------------------------------------------------------- fonts
FONT_DIR = "/usr/share/fonts"
pdfmetrics.registerFont(TTFont("NotoSerifSC", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf"))
pdfmetrics.registerFont(TTFont("NotoSerifSC-Bold", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif", f"{FONT_DIR}/truetype/freefont/FreeSerif.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-Bold", f"{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-Italic", f"{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-BoldItalic", f"{FONT_DIR}/truetype/freefont/FreeSerifBoldItalic.ttf"))
pdfmetrics.registerFont(TTFont("DejaVuSans", f"{FONT_DIR}/truetype/dejavu/DejaVuSansMono.ttf"))
registerFontFamily("NotoSerifSC", normal="NotoSerifSC", bold="NotoSerifSC-Bold")
registerFontFamily("FreeSerif", normal="FreeSerif", bold="FreeSerif-Bold",
                   italic="FreeSerif-Italic", boldItalic="FreeSerif-BoldItalic")
registerFontFamily("DejaVuSans", normal="DejaVuSans", bold="DejaVuSans")

from pdf import install_font_fallback  # noqa: E402
install_font_fallback()

# ------------------------------------------------- cascade palette (generated,
# seed 7 minimal - identical family to the Phase 1 / 2 / 3 reports)
PAGE_BG       = colors.HexColor('#f1f0ef')
SECTION_BG    = colors.HexColor('#f2f1f0')
CARD_BG       = colors.HexColor('#e8e7e4')
TABLE_STRIPE  = colors.HexColor('#eeedeb')
HEADER_FILL   = colors.HexColor('#504933')
COVER_BLOCK   = colors.HexColor('#867b5a')
BORDER        = colors.HexColor('#cfcab8')
ICON          = colors.HexColor('#8c7e52')
ACCENT        = colors.HexColor('#87702a')
ACCENT_2      = colors.HexColor('#3a95b4')
TEXT_PRIMARY  = colors.HexColor('#1c1c1a')
TEXT_MUTED    = colors.HexColor('#78766f')
SEM_SUCCESS   = colors.HexColor('#46875c')
SEM_WARNING   = colors.HexColor('#a18347')
SEM_ERROR     = colors.HexColor('#92453e')
SEM_INFO      = colors.HexColor('#466a8e')

TABLE_HEADER_COLOR = HEADER_FILL
TABLE_ROW_EVEN     = colors.white
TABLE_ROW_ODD      = TABLE_STRIPE

# ---------------------------------------------------------------- geometry
MARGIN = 1.0 * inch
PAGE_W, PAGE_H = A4
AVAIL_W = PAGE_W - 2 * MARGIN
AVAIL_H = PAGE_H - 2 * MARGIN
H1_THRESHOLD = AVAIL_H * 0.25
MAX_KEEP_HEIGHT = PAGE_H * 0.4

# ---------------------------------------------------------------- styles
body = ParagraphStyle("Body", fontName="FreeSerif", fontSize=10.5, leading=17,
                      alignment=TA_JUSTIFY, textColor=TEXT_PRIMARY,
                      spaceBefore=0, spaceAfter=10)
h1 = ParagraphStyle("H1x", fontName="FreeSerif", fontSize=22, leading=27,
                    textColor=TEXT_PRIMARY, spaceBefore=18, spaceAfter=4)
h2 = ParagraphStyle("H2x", fontName="FreeSerif", fontSize=15, leading=20,
                    textColor=HEADER_FILL, spaceBefore=14, spaceAfter=8)
bullet = ParagraphStyle("Bullet", parent=body, leftIndent=16, bulletIndent=4,
                        spaceAfter=5, alignment=TA_LEFT,
                        bulletFontName="FreeSerif", bulletFontSize=10.5)
caption = ParagraphStyle("Caption", fontName="FreeSerif-Italic", fontSize=8.5,
                         leading=12, textColor=TEXT_MUTED, alignment=TA_CENTER,
                         spaceBefore=3, spaceAfter=6)
tbl_head = ParagraphStyle("TblHead", fontName="FreeSerif", fontSize=9.5,
                          leading=12.5, textColor=colors.white, alignment=TA_LEFT)
tbl_cell = ParagraphStyle("TblCell", fontName="FreeSerif", fontSize=9,
                          leading=12, textColor=TEXT_PRIMARY, alignment=TA_LEFT)
stat_big = ParagraphStyle("StatBig", fontName="FreeSerif", fontSize=17, leading=21,
                          textColor=ACCENT, alignment=TA_CENTER)
stat_lbl = ParagraphStyle("StatLbl", fontName="FreeSerif", fontSize=8, leading=11,
                          textColor=TEXT_MUTED, alignment=TA_CENTER)
toc_h = ParagraphStyle("TOCTitle", fontName="FreeSerif", fontSize=22, leading=27,
                       textColor=TEXT_PRIMARY, spaceAfter=18)

# ------------------------------------------------------- page number zones
CONTENT_START = {"page": None}
ROMAN = {1: "i", 2: "ii", 3: "iii", 4: "iv", 5: "v", 6: "vi", 7: "vii", 8: "viii"}


class ContentStartMarker(Flowable):
    """Zero-size marker recording the page where chapter 1 begins.
    Overwrites on every multiBuild pass so the final pass wins."""
    def __init__(self):
        super().__init__()
        self.width = self.height = 0

    def draw(self):
        CONTENT_START["page"] = self.canv.getPageNumber()


def on_page(canvas, doc):
    canvas.saveState()
    # header: title left + accent rule
    canvas.setFont("FreeSerif", 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, PAGE_H - 0.62 * inch, TITLE)
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(1.2)
    canvas.line(MARGIN, PAGE_H - 0.70 * inch, PAGE_W - MARGIN, PAGE_H - 0.70 * inch)
    # footer: author left + page number right + light rule
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 0.62 * inch, PAGE_W - MARGIN, 0.62 * inch)
    canvas.setFont("FreeSerif", 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, 0.45 * inch, "Dwellers Engineering - Phase 5 Report")
    page = canvas.getPageNumber()
    start = CONTENT_START["page"]
    if start is not None and page >= start:
        label = str(page - start + 1)
    else:
        label = ROMAN.get(page, str(page))
    canvas.drawRightString(PAGE_W - MARGIN, 0.45 * inch, label)
    canvas.restoreState()


# ---------------------------------------------------------------- doc class
class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, "bookmark_name"):
            level = getattr(flowable, "bookmark_level", 0)
            text = getattr(flowable, "bookmark_text", "")
            key = getattr(flowable, "bookmark_key", "")
            if level != 0:
                return  # chapter-only TOC: guarantees a single TOC page
            start = CONTENT_START["page"]
            # Zone numbering: body pages display 1..N (front matter is roman)
            display = self.page - start + 1 if start else self.page
            self.notify("TOCEntry", (level, text, display, key))


def add_heading(text, style, level=0):
    key = "h_%s" % hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph('<a name="%s"/><b>%s</b>' % (key, text), style)
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p


def safe_keep_together(elements):
    total_h = 0
    for el in elements:
        w, h = el.wrap(AVAIL_W, PAGE_H)
        total_h += h
    if total_h <= MAX_KEEP_HEIGHT:
        return [KeepTogether(elements)]
    elif len(elements) >= 2:
        return [KeepTogether(elements[:2])] + list(elements[2:])
    return list(elements)


def make_table(spec):
    """Build a palette-styled, centered, non-overflowing table."""
    ratios = spec["ratios"]
    assert abs(sum(ratios) - 1.0) < 0.01, "ratios must sum to 1"
    col_widths = [r * AVAIL_W * 0.98 for r in ratios]
    assert sum(col_widths) <= AVAIL_W + 0.5
    size = spec.get("size", 9)
    head_st = ParagraphStyle("th_%s" % id(spec), parent=tbl_head, fontSize=size + 0.5,
                             leading=size + 3.5)
    cell_st = ParagraphStyle("tc_%s" % id(spec), parent=tbl_cell, fontSize=size,
                             leading=size + 3)
    data = [[Paragraph("<b>%s</b>" % h, head_st) for h in spec["headers"]]]
    for row in spec["rows"]:
        cells = []
        for val in row:
            cells.append(Paragraph(str(val), cell_st))
        data.append(cells)
    t = Table(data, colWidths=col_widths, hAlign="CENTER", repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(data)):
        style.append(("BACKGROUND", (0, i), (-1, i),
                      TABLE_ROW_ODD if i % 2 else TABLE_ROW_EVEN))
    t.setStyle(TableStyle(style))
    return t


def make_callout_row(items):
    """Row of stat callout boxes (Data-to-Ink rule)."""
    n = len(items)
    gap = 10
    box_w = (AVAIL_W - gap * (n - 1)) / n
    cells, widths = [], []
    for i, (big, label) in enumerate(items):
        inner = Table([[Paragraph("<b>%s</b>" % big, stat_big)],
                       [Paragraph(label, stat_lbl)]], colWidths=[box_w])
        inner.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), CARD_BG),
            ("BOX", (0, 0), (-1, -1), 1, ACCENT),
            ("TOPPADDING", (0, 0), (-1, 0), 9),
            ("BOTTOMPADDING", (0, 1), (-1, 1), 9),
            ("TOPPADDING", (0, 1), (-1, 1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        cells.append(inner)
        widths.append(box_w)
        if i < n - 1:
            cells.append(Spacer(gap, 1))
            widths.append(gap)
    wrapper = Table([cells], colWidths=widths, hAlign="CENTER")
    wrapper.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return wrapper


def h1_block(num, title, first_flowables):
    """Chapter heading with accent underline, kept with first content."""
    heading = add_heading("%d.  %s" % (num, title), h1, level=0)
    rule = HRFlowable(width="100%", color=ACCENT, thickness=1.2,
                      spaceBefore=0, spaceAfter=12)
    return [CondPageBreak(H1_THRESHOLD)] + safe_keep_together(
        [heading, rule] + first_flowables)


# ---------------------------------------------------------------- build story
story = []

toc = TableOfContents()
toc.levelStyles = [
    ParagraphStyle("TOC0", fontName="FreeSerif", fontSize=11.5, leading=18,
                   leftIndent=6, spaceBefore=3, textColor=TEXT_PRIMARY),
    ParagraphStyle("TOC1", fontName="FreeSerif", fontSize=9.5, leading=14,
                   leftIndent=26, textColor=TEXT_MUTED),
]
story.append(Paragraph("<b>Table of Contents</b>", toc_h))
story.append(HRFlowable(width="100%", color=ACCENT, thickness=1.2,
                        spaceBefore=0, spaceAfter=14))
story.append(toc)
story.append(PageBreak())
story.append(ContentStartMarker())

for ch in CHAPTERS:
    blocks = ch["blocks"]
    first, rest = [], []
    consumed = False
    for kind, payload in blocks:
        if not consumed:
            if kind == "h2":
                first.append(add_heading(payload, h2, level=1))
            elif kind == "p":
                first.append(Paragraph(payload, body))
            elif kind == "callouts":
                first.append(Spacer(1, 4))
                first.append(make_callout_row(payload))
                first.append(Spacer(1, 12))
            elif kind == "table":
                spec = payload
                first.append(Spacer(1, 8))
                first.append(make_table(spec))
                if spec.get("title"):
                    first.append(Paragraph(spec["title"], caption))
                first.append(Spacer(1, 10))
            consumed = True
            continue
        rest.append((kind, payload))

    story.extend(h1_block(ch["num"], ch["title"], first))

    for kind, payload in rest:
        if kind == "h2":
            story.append(add_heading(payload, h2, level=1))
        elif kind == "h3":
            story.append(Paragraph("<b>%s</b>" % payload, ParagraphStyle(
                "H3x", parent=body, fontSize=11.5, leading=16,
                alignment=TA_LEFT, spaceBefore=10, spaceAfter=6)))
        elif kind == "p":
            story.append(Paragraph(payload, body))
        elif kind == "bullet":
            for item in payload:
                story.append(Paragraph(item, bullet, bulletText="\u2022"))
            story.append(Spacer(1, 6))
        elif kind == "table":
            spec = payload
            tbl = make_table(spec)
            cap = Paragraph(spec["title"], caption) if spec.get("title") else None
            story.append(Spacer(1, 8))
            if len(spec["rows"]) <= 8 and cap:
                story.extend(safe_keep_together([tbl, Spacer(1, 3), cap]))
            else:
                story.append(tbl)
                if cap:
                    story.append(Spacer(1, 3))
                    story.append(cap)
            story.append(Spacer(1, 10))
        elif kind == "callouts":
            story.append(Spacer(1, 4))
            story.append(make_callout_row(payload))
            story.append(Spacer(1, 12))
        elif kind == "quote":
            story.append(Paragraph(payload, ParagraphStyle(
                "Quote", parent=body, fontName="FreeSerif-Italic", leftIndent=24,
                textColor=TEXT_MUTED, borderPadding=(0, 0, 0, 8))))

OUT = "/home/z/my-project/scripts/phase5-report-body.pdf"
doc = TocDocTemplate(
    OUT,
    pagesize=A4,
    leftMargin=MARGIN, rightMargin=MARGIN,
    topMargin=MARGIN, bottomMargin=MARGIN,
    title=TITLE, author="Z.ai", creator="Z.ai", subject=SUBJECT,
)
doc.multiBuild(story, onFirstPage=on_page, onLaterPages=on_page)
print("body pages:", doc.page)
print("content starts at pdf page:", CONTENT_START["page"])
print("OK ->", OUT)
