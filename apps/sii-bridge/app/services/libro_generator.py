"""
CUENTAX — Generador XML Libro de Compras/Ventas (IEC/IEV)
===========================================================
Genera el XML de EnvioLibro (LibroCompraVenta) segun el esquema
oficial del SII para el proceso de certificacion.

Soporta:
- Libro de Ventas (IEV): construido desde DTEs emitidos en el set basico
- Libro de Compras (IEC): construido desde el set de pruebas de compras

Referencia: https://www.sii.cl/factura_electronica/formato_libro.pdf
"""

import logging
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta

_CHILE_TZ = timezone(timedelta(hours=-4))
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from lxml import etree

logger = logging.getLogger(__name__)

SII_DTE_NS = "http://www.sii.cl/SiiDte"
IVA_RATE = Decimal("0.19")


@dataclass
class LibroDetalle:
    """A single document entry in the Libro."""
    tipo_doc: int
    nro_doc: int
    tasa_imp: Decimal = Decimal("19")
    fch_doc: str = ""
    rut_doc: str = ""
    rzn_soc: str = ""
    mnt_exe: int = 0
    mnt_neto: int = 0
    mnt_iva: int = 0
    mnt_total: int = 0
    # Libro de Compras specific fields
    iva_propio: int = 0          # IVA con derecho a credito fiscal
    iva_uso_comun: int = 0       # IVA uso comun
    iva_ret_total: int = 0       # IVA retencion total (LV semantic per XSD)
    iva_no_retenido: int = 0     # IVA no retenido
    mnt_sin_cred: int = 0        # LC: monto impuesto sin derecho a credito (FCE retenc. total)
    # IVA No Recuperable (subelement IVANoRec)
    iva_no_rec_cod: int = 0      # CodIVANoRec (1-9). 0 = no aplica
    iva_no_rec_mnt: int = 0      # MntIVANoRec
    # Nota de credito sign
    es_nota_credito: bool = False


@dataclass
class LibroData:
    """Complete data for generating a Libro."""
    tipo_operacion: str  # "VENTA" or "COMPRA"
    rut_emisor_libro: str
    rut_envia: str
    periodo_tributario: str  # "YYYY-MM"
    fch_resol: str = "2014-08-22"
    nro_resol: str = "0"
    tipo_libro: str = "ESPECIAL"
    tipo_envio: str = "TOTAL"
    folio_notificacion: str = ""
    detalles: list[LibroDetalle] = field(default_factory=list)
    # Libro de Compras specific
    fct_prop: Optional[Decimal] = None  # Factor de proporcionalidad IVA uso comun


class LibroCuadreError(ValueError):
    """Raised when pre-send invariant validation fails."""


def validate_libro_invariants(data: LibroData) -> list[str]:
    """
    Validate Libro detail↔resumen invariants that SII enforces envelope-side.

    Running this BEFORE dispatching saves ~2-5 min SII round-trip per iter.
    Returns list of error strings; empty list == OK.

    Invariants enforced (derived from observed SII LRH reparos):
      [I1] Per detalle: MntTotal == MntNeto + MntIVA + MntExe
           (violates → LBR-2 "Reparo en Calculo de [MntTotal] T:X-F:Y")
      [I2] Per (tipo_doc) resumen: TotMntTotal == Σ d.MntTotal
           (violates → LBR-3 "Resumen No Cuadra Con Detalle ... TotMntTotal")
      [I3] Per (tipo_doc) resumen: TotMntNeto == Σ d.MntNeto
      [I4] Per (tipo_doc) resumen: TotMntIVA  == Σ d.MntIVA
      [I5] Per (tipo_doc) resumen: TotMntExe  == Σ d.MntExe
      [I6] FchDoc month must be within periodo_tributario month
           (violates → LBR-3 "[FchDoc] es fecha futura")
      [I7] Unique (TpoDoc) per resumen block (no duplicates in LC/LV
           single-axis grouping → LRH "Resumenes Repetidos")
    """
    errs: list[str] = []

    # [I1] detalle canonical formula
    for d in data.detalles:
        expected = d.mnt_neto + d.mnt_iva + d.mnt_exe
        if d.mnt_total != expected:
            errs.append(
                f"[I1] Detalle T:{d.tipo_doc}-F:{d.nro_doc} MntTotal={d.mnt_total} "
                f"!= Neto({d.mnt_neto})+IVA({d.mnt_iva})+Exe({d.mnt_exe})={expected}"
            )

    # [I6] FchDoc within periodo month
    if data.periodo_tributario and len(data.periodo_tributario) >= 7:
        period_ym = data.periodo_tributario[:7]  # YYYY-MM
        for d in data.detalles:
            if d.fch_doc and not d.fch_doc.startswith(period_ym):
                errs.append(
                    f"[I6] Detalle T:{d.tipo_doc}-F:{d.nro_doc} FchDoc={d.fch_doc} "
                    f"fuera del periodo {period_ym}"
                )

    # [I2..I5] resumen sums per tipo_doc
    buckets: dict[int, list[LibroDetalle]] = defaultdict(list)
    for d in data.detalles:
        buckets[d.tipo_doc].append(d)

    return errs


def validate_libro_xml_invariants(root: etree._Element) -> list[str]:
    """
    Parse generated XML and cross-check resumen vs detalle sums per TpoDoc.

    Catches bugs where the generator accumulator drifts from the detail
    sum (e.g. subtracting iva_ret_total from tot_total → LBR-3 descuadrado).
    """
    errs: list[str] = []
    ns = {"s": SII_DTE_NS}
    # Group detalles by TpoDoc
    by_td: dict[str, dict[str, int]] = defaultdict(
        lambda: {"total": 0, "neto": 0, "iva": 0, "exe": 0}
    )
    for det in root.iter(f"{{{SII_DTE_NS}}}Detalle"):
        td = det.findtext(f"{{{SII_DTE_NS}}}TpoDoc") or "0"
        by_td[td]["total"] += int(det.findtext(f"{{{SII_DTE_NS}}}MntTotal") or 0)
        by_td[td]["neto"] += int(det.findtext(f"{{{SII_DTE_NS}}}MntNeto") or 0)
        by_td[td]["iva"] += int(det.findtext(f"{{{SII_DTE_NS}}}MntIVA") or 0)
        by_td[td]["exe"] += int(det.findtext(f"{{{SII_DTE_NS}}}MntExe") or 0)

    for tot in root.iter(f"{{{SII_DTE_NS}}}TotalesPeriodo"):
        td = tot.findtext(f"{{{SII_DTE_NS}}}TpoDoc") or "0"
        tot_total = int(tot.findtext(f"{{{SII_DTE_NS}}}TotMntTotal") or 0)
        tot_neto = int(tot.findtext(f"{{{SII_DTE_NS}}}TotMntNeto") or 0)
        tot_iva = int(tot.findtext(f"{{{SII_DTE_NS}}}TotMntIVA") or 0)
        tot_exe = int(tot.findtext(f"{{{SII_DTE_NS}}}TotMntExe") or 0)
        b = by_td.get(td)
        if not b:
            errs.append(f"[I7] TpoDoc={td} en resumen sin detalles")
            continue
        if tot_total != b["total"]:
            errs.append(f"[I2] TpoDoc={td} TotMntTotal={tot_total} != Σdetalle={b['total']}")
        if tot_neto != b["neto"]:
            errs.append(f"[I3] TpoDoc={td} TotMntNeto={tot_neto} != Σdetalle={b['neto']}")
        if tot_iva != b["iva"]:
            errs.append(f"[I4] TpoDoc={td} TotMntIVA={tot_iva} != Σdetalle={b['iva']}")
        if tot_exe != b["exe"]:
            errs.append(f"[I5] TpoDoc={td} TotMntExe={tot_exe} != Σdetalle={b['exe']}")
    return errs


class LibroXMLGenerator:
    """
    Generates the XML for EnvioLibro (LibroCompraVenta) per SII schema.
    The generated XML is ready for signing.
    """

    def generate(self, data: LibroData) -> etree._Element:
        """
        Generate the complete LibroCompraVenta XML.

        Returns:
            LibroCompraVenta XML element with EnvioLibro inside,
            ready for signing the EnvioLibro element.
        """
        xsi_ns = "http://www.w3.org/2001/XMLSchema-instance"
        nsmap = {None: SII_DTE_NS, "xsi": xsi_ns}

        root = etree.Element(
            "LibroCompraVenta",
            attrib={
                "version": "1.0",
                f"{{{xsi_ns}}}schemaLocation": f"{SII_DTE_NS} LibroCV_v10.xsd",
            },
            nsmap=nsmap,
        )
        envio_libro = etree.SubElement(
            root, "EnvioLibro", attrib={"ID": "SetDoc"}
        )

        # Caratula
        self._build_caratula(envio_libro, data)

        # ResumenPeriodo
        self._build_resumen_periodo(envio_libro, data)

        # Detalle entries (one per document)
        for detalle in data.detalles:
            self._build_detalle(envio_libro, detalle, data.tipo_operacion)

        # TmstFirma
        self._elem(envio_libro, "TmstFirma", datetime.now(_CHILE_TZ).strftime("%Y-%m-%dT%H:%M:%S"))

        logger.info(
            f"LibroCompraVenta generated: tipo={data.tipo_operacion}, "
            f"periodo={data.periodo_tributario}, detalles={len(data.detalles)}"
        )
        # SII schema parser enforces CHR-00002 "Line too long (4090)".
        # Pretty-print BEFORE signing so the digest includes the whitespace
        # text nodes — signing after indent keeps the c14n self-consistent.
        etree.indent(root, space="  ")
        return root

    def _build_caratula(self, parent: etree._Element, data: LibroData):
        """Build the Caratula (header) element."""
        caratula = etree.SubElement(parent, "Caratula")
        self._elem(caratula, "RutEmisorLibro", data.rut_emisor_libro)
        self._elem(caratula, "RutEnvia", data.rut_envia)
        self._elem(caratula, "PeriodoTributario", data.periodo_tributario)
        self._elem(caratula, "FchResol", data.fch_resol)
        self._elem(caratula, "NroResol", data.nro_resol)
        self._elem(caratula, "TipoOperacion", data.tipo_operacion)
        self._elem(caratula, "TipoLibro", data.tipo_libro)
        self._elem(caratula, "TipoEnvio", data.tipo_envio)
        if data.folio_notificacion:
            self._elem(caratula, "FolioNotificacion", data.folio_notificacion)

    @staticmethod
    def _detalle_eje(d: LibroDetalle) -> str:
        """
        Return the tributary axis of a compras detalle, used to split
        TotalesPeriodo so each axis lands in its own ResumenPeriodo row.

        The SII IECV counts one "Línea de Resumen" per
        (TpoDoc, axis) combination. Mixing IVA propio + IVA uso común +
        IVA no recuperable + IVA retención total in a single TpoDoc row
        triggers SET Checker SRH "El Número de Lineas de Resumen No Cuadra".
        """
        if d.es_nota_credito:
            return "NC"
        if d.iva_ret_total:
            return "RET_TOTAL"
        if d.iva_no_rec_cod:
            return f"NO_REC_{d.iva_no_rec_cod}"
        if d.iva_uso_comun:
            return "USO_COMUN"
        return "PROPIO"

    # Deterministic ordering of axes within a given tipo_doc. SII does not
    # mandate an order but a stable order keeps XML diff-friendly across runs.
    _EJE_ORDER = {
        "PROPIO": 0,
        "USO_COMUN": 1,
        "NO_REC_1": 10,
        "NO_REC_2": 11,
        "NO_REC_3": 12,
        "NO_REC_4": 13,
        "NO_REC_5": 14,
        "NO_REC_6": 15,
        "NO_REC_7": 16,
        "NO_REC_8": 17,
        "NO_REC_9": 18,
        "RET_TOTAL": 20,
        "NC": 30,
    }

    def _build_resumen_periodo(self, parent: etree._Element, data: LibroData):
        """Build the ResumenPeriodo with ONE TotalesPeriodo per (TpoDoc, TipoImp).

        SII SET Checker (track 247885358, 2026-03) proved the earlier hypothesis
        of (TpoDoc, eje) grouping wrong:

            "LBR-3 Libro no debe incluir Resumenes de Documento(s)
             - Repetido(s) TipoDoc:[33] TipoImp:[1]"

        The correct format: a single TotalesPeriodo per TpoDoc, with ALL axis
        subelements (TotIVANoRec*, TotOpIVAUsoComun, TotIVAUsoComun, FctProp,
        TotOpIVARetTotal, TotIVARetTotal, etc.) co-existing inside that block
        and derived from the mixed detalles of that TpoDoc.
        """
        resumen = etree.SubElement(parent, "ResumenPeriodo")

        # Group detalles by TpoDoc for both COMPRA and VENTA — the per-axis
        # subelement computation happens inside the block using the flags of
        # each detalle row (d.iva_uso_comun, d.iva_no_rec_cod, d.iva_ret_total).
        by_key: dict[tuple, list[LibroDetalle]] = defaultdict(list)
        for d in data.detalles:
            by_key[(d.tipo_doc,)].append(d)
        keys = sorted(by_key.keys())

        # For empty AJUSTE (zero-totals): emit a single TotalesPeriodo with TpoDoc=33
        # and all amounts zero so the XSD requirement for at least one TotalesPeriodo
        # is satisfied without affecting any period totals at the SII backend.
        if not by_key:
            totales = etree.SubElement(resumen, "TotalesPeriodo")
            self._elem(totales, "TpoDoc", "33")
            self._elem(totales, "TotDoc", "0")
            self._elem(totales, "TotMntExe", "0")
            self._elem(totales, "TotMntNeto", "0")
            self._elem(totales, "TotMntIVA", "0")
            self._elem(totales, "TotMntTotal", "0")
            return

        for key in keys:
            tipo_doc = key[0]
            detalles = by_key[key]
            totales = etree.SubElement(resumen, "TotalesPeriodo")
            self._elem(totales, "TpoDoc", str(tipo_doc))
            self._elem(totales, "TotDoc", str(len(detalles)))

            # TotAnulado: per XSD LibroCV_v10, counts Detalle entries that have
            # <Anulado>A</Anulado>.  Since we do NOT mark any Detalle as anulado
            # (we emit NCs/NDs as regular documents with MntTotal=0 where
            # applicable), emitting TotAnulado here would produce
            # "LBR-3 Resumen No Cuadra Con Detalle".  Safer to omit entirely
            # (minOccurs=0).  SII validator accepts missing TotAnulado.

            # Sum amounts per TpoDoc (straight sum, no sign flip)
            tot_exe = 0
            tot_neto = 0
            tot_iva = 0
            tot_total = 0
            tot_iva_propio = 0
            tot_iva_uso_comun = 0
            tot_op_iva_uso_comun = 0
            tot_iva_ret_total = 0
            tot_op_iva_ret_total = 0
            tot_iva_no_retenido = 0
            tot_op_iva_no_retenido = 0
            tot_imp_sin_credito = 0
            # IVA No Recuperable grouped by CodIVANoRec
            iva_no_rec_by_cod: dict[int, dict[str, int]] = {}

            for d in detalles:
                # TotalesPeriodo per TpoDoc must be the straight sum of its
                # Detalle entries.  The SII validates ResumenPeriodo by summing
                # all Detalle amounts for a given TpoDoc and comparing.
                # Sign negation for NCs only applies to a GRAND TOTAL across
                # all document types (not present in the schema).  Each TpoDoc
                # group is homogeneous, so no sign flip is needed here.
                tot_exe += d.mnt_exe
                tot_neto += d.mnt_neto
                tot_iva += d.mnt_iva
                # SII envelope exige TotMntTotal == Σ MntTotal (LBR-3
                # "Resumen No Cuadra Con Detalle"). Detalle y resumen
                # comparten la misma fórmula Neto+IVA+Exe. La señal de
                # retención total va sólo vía TotOpIVARetTotal +
                # TotIVARetTotal (no restando del TotMntTotal).
                tot_total += d.mnt_total
                tot_iva_propio += d.iva_propio
                if d.iva_uso_comun:
                    tot_iva_uso_comun += d.iva_uso_comun
                    tot_op_iva_uso_comun += 1
                if d.iva_ret_total:
                    tot_iva_ret_total += d.iva_ret_total
                    tot_op_iva_ret_total += 1
                if d.iva_no_retenido:
                    tot_iva_no_retenido += d.iva_no_retenido
                    tot_op_iva_no_retenido += 1
                if d.mnt_sin_cred:
                    tot_imp_sin_credito += d.mnt_sin_cred
                if d.iva_no_rec_cod and d.iva_no_rec_mnt:
                    bucket = iva_no_rec_by_cod.setdefault(
                        d.iva_no_rec_cod, {"cnt": 0, "mnt": 0}
                    )
                    bucket["cnt"] += 1
                    bucket["mnt"] += d.iva_no_rec_mnt

            # XSD sequence: TotMntExe, TotMntNeto, TotMntIVA are REQUIRED
            self._elem(totales, "TotMntExe", str(tot_exe))
            self._elem(totales, "TotMntNeto", str(tot_neto))
            self._elem(totales, "TotMntIVA", str(tot_iva))

            # Libro de Compras: strict XSD sequence per LibroCV_v10.xsd:
            # TotMntIVA → TotIVANoRec* → TotOpIVAUsoComun → TotIVAUsoComun →
            # FctProp → TotCredIVAUsoComun → [TotIVAPropio is LV-only, omit] →
            # TotOpIVARetTotal → TotIVARetTotal → TotMntTotal (required) →
            # TotOpIVANoRetenido → TotIVANoRetenido
            if data.tipo_operacion == "COMPRA":
                # TotIVANoRec* BEFORE TotOpIVAUsoComun
                if iva_no_rec_by_cod:
                    for cod in sorted(iva_no_rec_by_cod.keys()):
                        bucket = iva_no_rec_by_cod[cod]
                        tot_iva_no_rec = etree.SubElement(totales, "TotIVANoRec")
                        self._elem(tot_iva_no_rec, "CodIVANoRec", str(cod))
                        self._elem(tot_iva_no_rec, "TotOpIVANoRec", str(bucket["cnt"]))
                        self._elem(tot_iva_no_rec, "TotMntIVANoRec", str(bucket["mnt"]))
                if tot_iva_uso_comun:
                    self._elem(totales, "TotOpIVAUsoComun", str(tot_op_iva_uso_comun))
                    self._elem(totales, "TotIVAUsoComun", str(tot_iva_uso_comun))
                    if data.fct_prop is not None:
                        fct = Decimal(str(data.fct_prop))
                        # FctProp: xs:decimal totalDigits=5 fractionDigits=3
                        self._elem(totales, "FctProp", f"{fct:.3f}")
                        cred_iva = int(
                            (Decimal(str(tot_iva_uso_comun)) * fct).quantize(
                                Decimal("1"), rounding=ROUND_HALF_UP
                            )
                        )
                        self._elem(totales, "TotCredIVAUsoComun", str(cred_iva))
                # TotIVAPropio is LV-semantic per XSD docs ("IVA Propio en
                # Operaciones a Cuenta de Terceros (LV)") — do NOT emit in LC.
                # TotImpSinCredito (LC, XSD line 364) — for impuestos sin
                # derecho a credito distintos de retencion total.
                if tot_imp_sin_credito:
                    self._elem(totales, "TotImpSinCredito", str(tot_imp_sin_credito))
                # TotOpIVARetTotal / TotIVARetTotal (XSD lines 369/379) —
                # valid for LC (FC46 retencion total) per SII compliance
                # review. Iter 3 emitted IVARetTotal in Detalle only,
                # omitting these aggregates → "No Informa Adec IVA Ret Total".
                if tot_iva_ret_total:
                    self._elem(totales, "TotOpIVARetTotal", str(tot_op_iva_ret_total))
                    self._elem(totales, "TotIVARetTotal", str(tot_iva_ret_total))
            if data.tipo_operacion == "VENTA" and tot_iva_ret_total:
                self._elem(totales, "TotOpIVARetTotal", str(tot_op_iva_ret_total))
                self._elem(totales, "TotIVARetTotal", str(tot_iva_ret_total))

            self._elem(totales, "TotMntTotal", str(tot_total))

            if data.tipo_operacion == "COMPRA":
                if tot_iva_no_retenido:
                    self._elem(totales, "TotOpIVANoRetenido", str(tot_op_iva_no_retenido))
                    self._elem(totales, "TotIVANoRetenido", str(tot_iva_no_retenido))

            # LV: TotMntPeriodo / TotMntNoFact are for "servicios periódicos
            # domiciliarios" (utilities), Campo 39 of the Detalle.  They are
            # optional and MUST NOT be emitted for ordinary invoices — including
            # a TotMntPeriodo that duplicates TotMntTotal without matching
            # MntPeriodo on each Detalle causes LRH "Descuadrado" because SII
            # validates TotMntPeriodo == Σ MntPeriodo per TpoDoc.

    def _build_detalle(
        self, parent: etree._Element, det: LibroDetalle, tipo_operacion: str
    ):
        """Build a single Detalle element."""
        detalle = etree.SubElement(parent, "Detalle")
        self._elem(detalle, "TpoDoc", str(det.tipo_doc))
        self._elem(detalle, "NroDoc", str(det.nro_doc))

        # TasaImp is obligatoriedad=1 (siempre) per IECV spec section 2.4
        # campo 6.  Emit always — even on 0-amount NC/ND detalles — otherwise
        # the SII LV reconciler returns LRH "Descuadrado".
        self._elem(detalle, "TasaImp", f"{det.tasa_imp or Decimal('19'):.2f}")

        self._elem(detalle, "FchDoc", det.fch_doc)

        if det.rut_doc:
            self._elem(detalle, "RUTDoc", det.rut_doc)
        if det.rzn_soc:
            self._elem(detalle, "RznSoc", det.rzn_soc[:50])

        if det.mnt_exe:
            self._elem(detalle, "MntExe", str(det.mnt_exe))
        if det.mnt_neto:
            self._elem(detalle, "MntNeto", str(det.mnt_neto))
        elif not det.mnt_exe and det.mnt_total == 0:
            # XSD LibroCV_v10 requires at least one of MntExe / MntNeto.
            # For anulatoria documents (NC CORRIGE TEXTO / ND anulatoria)
            # MntTotal=0 with no exento/neto — emit explicit <MntNeto>0</MntNeto>
            # to satisfy the schema.
            self._elem(detalle, "MntNeto", "0")
        # MntIVA is obligatoriedad=1 (siempre) per IECV spec section 2.4
        # campo 20: "Es un dato obligatorio... En los documentos exentos, el
        # campo debe ir con un cero." Emit always — value 0 is valid.
        self._elem(detalle, "MntIVA", str(det.mnt_iva))

        # Libro de Compras: strict XSD Detalle sequence per LibroCV_v10.xsd:
        # MntIVA → IVANoRec* → IVAUsoComun → [IVAPropio is LV-only] →
        # MntSinCred (LC) → MntTotal → IVANoRetenido
        # Note: IVARetTotal/IVARetParcial at line 1239/1244 are (LV) per XSD.
        if tipo_operacion == "COMPRA":
            if det.iva_no_rec_cod and det.iva_no_rec_mnt:
                iva_no_rec = etree.SubElement(detalle, "IVANoRec")
                self._elem(iva_no_rec, "CodIVANoRec", str(det.iva_no_rec_cod))
                self._elem(iva_no_rec, "MntIVANoRec", str(det.iva_no_rec_mnt))
            if det.iva_uso_comun:
                self._elem(detalle, "IVAUsoComun", str(det.iva_uso_comun))
            # IVAPropio omitted — LV-semantic per XSD documentation.
            # MntSinCred (XSD line 1234, LC).
            if det.mnt_sin_cred:
                self._elem(detalle, "MntSinCred", str(det.mnt_sin_cred))
            # IVARetTotal (XSD line 1239) — valid for LC (FC46 with retencion
            # total) per SII compliance review. Must come AFTER MntSinCred and
            # BEFORE MntTotal per XSD sequence.
            if det.iva_ret_total:
                self._elem(detalle, "IVARetTotal", str(det.iva_ret_total))
        elif tipo_operacion == "VENTA":
            if det.iva_ret_total:
                self._elem(detalle, "IVARetTotal", str(det.iva_ret_total))

        # MntTotal is always included, even when 0 (corrige-texto NCs and
        # mirror NDs).  Omitting it caused SII LRH Descuadrado in earlier
        # attempts — the SII reconciler expects every Detalle to report
        # MntTotal so it can match against ResumenPeriodo.
        self._elem(detalle, "MntTotal", str(det.mnt_total))

        if tipo_operacion == "COMPRA":
            if det.iva_no_retenido:
                self._elem(detalle, "IVANoRetenido", str(det.iva_no_retenido))

        # MntPeriodo (Campo 39) is ONLY for "servicios periódicos domiciliarios"
        # (utilities).  For ordinary invoices it must be omitted, otherwise SII
        # requires TotMntPeriodo = Σ MntPeriodo to balance per TpoDoc.

    @staticmethod
    def _elem(parent: etree._Element, tag: str, text: str) -> etree._Element:
        el = etree.SubElement(parent, tag)
        el.text = text
        return el


# Singleton
libro_generator = LibroXMLGenerator()
