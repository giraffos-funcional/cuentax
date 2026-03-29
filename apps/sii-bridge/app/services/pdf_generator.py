"""
CUENTAX — PDF Generator for DTEs
===================================
Generates PDF representations of Chilean DTEs (electronic tax documents).

Used for:
1. Printing (carta/oficio format with PDF417 barcode)
2. SII certification step 4: "Muestras de Impresión" (up to 20 documents)
3. Customer delivery

Layout follows SII guidelines:
- Header: Emisor data + DTE type/folio box
- Body: Receptor data + Items table + Totals
- Footer: Timbre Electrónico (PDF417 barcode) + Acuse de recibo box

Uses ReportLab for PDF generation and pdf417gen for barcode.
"""

import io
import logging
from datetime import datetime
from decimal import Decimal
from typing import Optional

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import mm, cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT

logger = logging.getLogger(__name__)

SII_XSD_TYPES = {
    33: "FACTURA ELECTRÓNICA",
    39: "BOLETA ELECTRÓNICA",
    41: "BOLETA NO AFECTA ELECTRÓNICA",
    56: "NOTA DE DÉBITO ELECTRÓNICA",
    61: "NOTA DE CRÉDITO ELECTRÓNICA",
    110: "FACTURA EXPORTACIÓN ELECTRÓNICA",
}


def _format_rut(rut: str) -> str:
    """Format RUT with dots and dash: 12345678-9 → 12.345.678-9."""
    clean = rut.replace(".", "").replace("-", "").strip()
    if len(clean) < 2:
        return rut
    body, dv = clean[:-1], clean[-1]
    # Add dots every 3 digits from right
    formatted = ""
    for i, c in enumerate(reversed(body)):
        if i > 0 and i % 3 == 0:
            formatted = "." + formatted
        formatted = c + formatted
    return f"{formatted}-{dv}"


def _format_money(amount: int) -> str:
    """Format money: 1234567 → $1.234.567."""
    s = str(abs(amount))
    parts = []
    for i, c in enumerate(reversed(s)):
        if i > 0 and i % 3 == 0:
            parts.append(".")
        parts.append(c)
    formatted = "".join(reversed(parts))
    return f"${'-' if amount < 0 else ''}{formatted}"


class DTEPDFGenerator:
    """Generates PDF for a DTE document."""

    def generate(self, dte_data: dict, ted_string: Optional[str] = None) -> bytes:
        """
        Generate a PDF for a DTE.

        Args:
            dte_data: Dict with DTE information:
                tipo_dte, folio, fecha_emision,
                emisor: {rut, razon_social, giro, direccion, comuna, ciudad},
                receptor: {rut, razon_social, giro, direccion, comuna, ciudad},
                items: [{nombre, cantidad, precio_unitario, monto_item, exento}],
                totales: {neto, iva, exento, total},
                referencia: {tipo_doc, folio, fecha, razon} (optional)
            ted_string: TED XML string for PDF417 barcode (optional)

        Returns:
            PDF file content as bytes
        """
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            leftMargin=1.5 * cm,
            rightMargin=1.5 * cm,
            topMargin=1 * cm,
            bottomMargin=1.5 * cm,
        )

        styles = getSampleStyleSheet()
        elements = []

        # Header: Emisor info + DTE type box
        elements.extend(self._build_header(dte_data, styles))
        elements.append(Spacer(1, 8 * mm))

        # Receptor info
        elements.extend(self._build_receptor(dte_data, styles))
        elements.append(Spacer(1, 5 * mm))

        # Items table
        elements.extend(self._build_items_table(dte_data, styles))
        elements.append(Spacer(1, 5 * mm))

        # Totals
        elements.extend(self._build_totals(dte_data, styles))

        # Reference (for NC/ND)
        ref = dte_data.get("referencia")
        if ref:
            elements.append(Spacer(1, 3 * mm))
            elements.extend(self._build_referencia(ref, styles))

        # PDF417 barcode (TED)
        if ted_string:
            elements.append(Spacer(1, 8 * mm))
            elements.extend(self._build_timbre(ted_string, styles))

        # Acuse de recibo box
        elements.append(Spacer(1, 5 * mm))
        elements.extend(self._build_acuse_recibo(styles))

        doc.build(elements)
        return buffer.getvalue()

    def _build_header(self, data: dict, styles) -> list:
        """Build header with emisor data and DTE type box."""
        emisor = data.get("emisor", {})
        tipo_dte = data.get("tipo_dte", 33)
        folio = data.get("folio", 0)
        tipo_nombre = SII_XSD_TYPES.get(tipo_dte, f"DTE TIPO {tipo_dte}")

        # Left: Emisor info
        emisor_style = ParagraphStyle("emisor", parent=styles["Normal"], fontSize=9)
        emisor_bold = ParagraphStyle("emisor_bold", parent=styles["Normal"], fontSize=12, fontName="Helvetica-Bold")

        left_content = [
            Paragraph(emisor.get("razon_social", ""), emisor_bold),
            Paragraph(f"RUT: {_format_rut(emisor.get('rut', ''))}", emisor_style),
            Paragraph(f"Giro: {emisor.get('giro', '')}", emisor_style),
            Paragraph(f"{emisor.get('direccion', '')}, {emisor.get('comuna', '')}", emisor_style),
            Paragraph(f"{emisor.get('ciudad', '')}", emisor_style),
        ]

        # Right: DTE type box (red border per SII standard)
        box_style = ParagraphStyle("box", parent=styles["Normal"], fontSize=10,
                                   alignment=TA_CENTER, fontName="Helvetica-Bold")
        box_data = [
            [Paragraph(f"R.U.T.: {_format_rut(emisor.get('rut', ''))}", box_style)],
            [Paragraph(tipo_nombre, box_style)],
            [Paragraph(f"N° {folio}", box_style)],
        ]
        box_table = Table(box_data, colWidths=[70 * mm])
        box_table.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 2, colors.red),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.red),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))

        # Combine into a two-column layout
        left_table = Table([[p] for p in left_content], colWidths=[100 * mm])
        left_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))

        header_table = Table([[left_table, box_table]], colWidths=[105 * mm, 75 * mm])
        header_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))

        return [header_table]

    def _build_receptor(self, data: dict, styles) -> list:
        """Build receptor information section."""
        receptor = data.get("receptor", {})
        fecha = data.get("fecha_emision", "")

        info_style = ParagraphStyle("info", parent=styles["Normal"], fontSize=9)

        rows = [
            ["Señor(es):", receptor.get("razon_social", ""), "Fecha:", fecha],
            ["R.U.T.:", _format_rut(receptor.get("rut", "")), "Giro:", receptor.get("giro", "")],
            ["Dirección:", receptor.get("direccion", ""), "Comuna:", receptor.get("comuna", "")],
        ]

        table = Table(rows, colWidths=[20 * mm, 70 * mm, 18 * mm, 70 * mm])
        table.setStyle(TableStyle([
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.black),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.grey),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ]))
        return [table]

    def _build_items_table(self, data: dict, styles) -> list:
        """Build items detail table."""
        items = data.get("items", [])

        header = ["N°", "Descripción", "Cant.", "P. Unit.", "Exento", "Monto"]
        rows = [header]

        for i, item in enumerate(items, 1):
            rows.append([
                str(i),
                item.get("nombre", ""),
                str(item.get("cantidad", 1)),
                _format_money(int(item.get("precio_unitario", 0))),
                "Sí" if item.get("exento") else "",
                _format_money(int(item.get("monto_item", 0))),
            ])

        col_widths = [10 * mm, 70 * mm, 15 * mm, 28 * mm, 15 * mm, 30 * mm]
        table = Table(rows, colWidths=col_widths)
        table.setStyle(TableStyle([
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("BACKGROUND", (0, 0), (-1, 0), colors.Color(0.9, 0.9, 0.9)),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.black),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.grey),
            ("ALIGN", (0, 0), (0, -1), "CENTER"),
            ("ALIGN", (2, 0), (2, -1), "CENTER"),
            ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
            ("ALIGN", (4, 0), (4, -1), "CENTER"),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))
        return [table]

    def _build_totals(self, data: dict, styles) -> list:
        """Build totals section aligned to the right."""
        totales = data.get("totales", {})
        tipo_dte = data.get("tipo_dte", 33)

        rows = []
        if tipo_dte not in (39, 41):
            if totales.get("neto", 0) > 0:
                rows.append(["Neto:", _format_money(totales["neto"])])
            if totales.get("exento", 0) > 0:
                rows.append(["Exento:", _format_money(totales["exento"])])
            if totales.get("iva", 0) > 0:
                rows.append(["IVA (19%):", _format_money(totales["iva"])])

        rows.append(["TOTAL:", _format_money(totales.get("total", 0))])

        table = Table(rows, colWidths=[30 * mm, 35 * mm], hAlign="RIGHT")
        table.setStyle(TableStyle([
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ("ALIGN", (0, 0), (0, -1), "RIGHT"),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.black),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.grey),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        return [table]

    def _build_referencia(self, ref: dict, styles) -> list:
        """Build reference section for NC/ND."""
        info_style = ParagraphStyle("ref", parent=styles["Normal"], fontSize=8)
        rows = [
            ["Tipo Doc. Ref:", str(ref.get("tipo_doc", "")),
             "Folio Ref:", str(ref.get("folio", ""))],
            ["Fecha Ref:", ref.get("fecha", ""),
             "Razón:", ref.get("razon", "")],
        ]
        table = Table(rows, colWidths=[25 * mm, 30 * mm, 20 * mm, 80 * mm])
        table.setStyle(TableStyle([
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.black),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))
        return [table]

    def _build_timbre(self, ted_string: str, styles) -> list:
        """Build PDF417 barcode from TED XML string."""
        elements = []
        try:
            from pdf417gen import encode, render_image

            # Encode TED string as PDF417
            codes = encode(ted_string, columns=10, security_level=5)
            img = render_image(codes, scale=2, ratio=3, padding=2)

            # Convert PIL image to ReportLab image
            img_buffer = io.BytesIO()
            img.save(img_buffer, format="PNG")
            img_buffer.seek(0)

            rl_image = Image(img_buffer, width=60 * mm, height=20 * mm)
            elements.append(rl_image)

            label_style = ParagraphStyle("timbre_label", parent=styles["Normal"],
                                         fontSize=7, alignment=TA_CENTER)
            elements.append(Paragraph("Timbre Electrónico SII", label_style))
            elements.append(Paragraph(
                "Res. Ex. SII N° 80 del 22-08-2014 — Verifique documento en www.sii.cl",
                label_style,
            ))
        except ImportError:
            logger.warning("pdf417gen not installed — skipping barcode generation")
            warn_style = ParagraphStyle("warn", parent=styles["Normal"], fontSize=8, alignment=TA_CENTER)
            elements.append(Paragraph("[TIMBRE ELECTRÓNICO PDF417 — pdf417gen no disponible]", warn_style))
        except Exception as e:
            logger.error(f"Error generating PDF417 barcode: {e}")

        return elements

    def _build_acuse_recibo(self, styles) -> list:
        """Build acuse de recibo box at the bottom."""
        box_style = ParagraphStyle("acuse", parent=styles["Normal"], fontSize=7)
        content = [
            ["ACUSE DE RECIBO"],
            ["Nombre: _________________________  RUT: _________________"],
            ["Fecha: ___________  Recinto: _________________  Firma: _________________"],
            ["El acuse de recibo que se declara en este acto, de acuerdo a lo dispuesto en "
             "la letra b) del Art. 4° y la letra c) del Art. 5° de la Ley 19.983, "
             "acredita que la entrega de mercaderías o servicio(s) prestado(s) "
             "ha(n) sido recibido(s)."],
        ]

        table = Table([[c] for c in content], colWidths=[175 * mm])
        table.setStyle(TableStyle([
            ("FONTSIZE", (0, 0), (-1, -1), 7),
            ("FONTNAME", (0, 0), (0, 0), "Helvetica-Bold"),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.black),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ]))
        return [table]


# Singleton
pdf_generator = DTEPDFGenerator()
