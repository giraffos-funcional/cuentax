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
    iva_ret_total: int = 0       # IVA retencion total (factura de compra)
    iva_no_retenido: int = 0     # IVA no retenido
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

    def _build_resumen_periodo(self, parent: etree._Element, data: LibroData):
        """Build the ResumenPeriodo with TotalesPeriodo per document type."""
        resumen = etree.SubElement(parent, "ResumenPeriodo")

        # Group detalles by tipo_doc
        by_tipo: dict[int, list[LibroDetalle]] = defaultdict(list)
        for d in data.detalles:
            by_tipo[d.tipo_doc].append(d)

        # For empty AJUSTE (zero-totals): emit a single TotalesPeriodo with TpoDoc=33
        # and all amounts zero so the XSD requirement for at least one TotalesPeriodo
        # is satisfied without affecting any period totals at the SII backend.
        if not by_tipo:
            totales = etree.SubElement(resumen, "TotalesPeriodo")
            self._elem(totales, "TpoDoc", "33")
            self._elem(totales, "TotDoc", "0")
            self._elem(totales, "TotMntExe", "0")
            self._elem(totales, "TotMntNeto", "0")
            self._elem(totales, "TotMntIVA", "0")
            self._elem(totales, "TotMntTotal", "0")
            return

        for tipo_doc in sorted(by_tipo.keys()):
            detalles = by_tipo[tipo_doc]
            totales = etree.SubElement(resumen, "TotalesPeriodo")
            self._elem(totales, "TpoDoc", str(tipo_doc))
            self._elem(totales, "TotDoc", str(len(detalles)))

            # Sum amounts per TpoDoc (straight sum, no sign flip)
            tot_exe = 0
            tot_neto = 0
            tot_iva = 0
            tot_total = 0
            tot_iva_propio = 0
            tot_iva_uso_comun = 0
            tot_iva_ret_total = 0
            tot_iva_no_retenido = 0
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
                tot_total += d.mnt_total
                tot_iva_propio += d.iva_propio
                tot_iva_uso_comun += d.iva_uso_comun
                tot_iva_ret_total += d.iva_ret_total
                tot_iva_no_retenido += d.iva_no_retenido
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

            # Libro de Compras: XSD sequence order per LibroCV_v10.xsd:
            # TotIVAUsoComun → FctProp → TotCredIVAUsoComun →
            # TotIVAPropio → TotIVARetTotal → TotMntTotal →
            # TotIVANoRetenido
            if data.tipo_operacion == "COMPRA":
                if tot_iva_uso_comun:
                    self._elem(totales, "TotIVAUsoComun", str(tot_iva_uso_comun))
                if data.fct_prop is not None and tot_iva_uso_comun:
                    fct = data.fct_prop
                    self._elem(totales, "FctProp", str(fct))
                    cred_iva = int(
                        (Decimal(str(tot_iva_uso_comun)) * fct).quantize(
                            Decimal("1"), rounding=ROUND_HALF_UP
                        )
                    )
                    self._elem(totales, "TotCredIVAUsoComun", str(cred_iva))
                if tot_iva_propio:
                    self._elem(totales, "TotIVAPropio", str(tot_iva_propio))
                if tot_iva_ret_total:
                    self._elem(totales, "TotIVARetTotal", str(tot_iva_ret_total))

            # TotIVANoRec must appear BEFORE TotMntTotal per LibroCV_v10.xsd
            # sequence: ... TotIVAPropio → TotIVANoRec* → TotIVARetTotal →
            # TotMntTotal → TotIVANoRetenido.  Emit one block per CodIVANoRec.
            if data.tipo_operacion == "COMPRA" and iva_no_rec_by_cod:
                for cod in sorted(iva_no_rec_by_cod.keys()):
                    bucket = iva_no_rec_by_cod[cod]
                    tot_iva_no_rec = etree.SubElement(totales, "TotIVANoRec")
                    self._elem(tot_iva_no_rec, "CodIVANoRec", str(cod))
                    self._elem(tot_iva_no_rec, "TotOpIVANoRec", str(bucket["cnt"]))
                    self._elem(tot_iva_no_rec, "TotMntIVANoRec", str(bucket["mnt"]))

            self._elem(totales, "TotMntTotal", str(tot_total))

            if data.tipo_operacion == "COMPRA":
                if tot_iva_no_retenido:
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
        # MntIVA is obligatoriedad=1 (siempre) per IECV spec section 2.4
        # campo 20: "Es un dato obligatorio... En los documentos exentos, el
        # campo debe ir con un cero." Emit always — value 0 is valid.
        self._elem(detalle, "MntIVA", str(det.mnt_iva))

        # Libro de Compras: XSD Detalle sequence per LibroCV_v10.xsd:
        # IVAUsoComun → IVAPropio → IVANoRec → IVARetTotal → MntTotal → IVANoRetenido
        if tipo_operacion == "COMPRA":
            if det.iva_uso_comun:
                self._elem(detalle, "IVAUsoComun", str(det.iva_uso_comun))
            if det.iva_propio:
                self._elem(detalle, "IVAPropio", str(det.iva_propio))
            if det.iva_no_rec_cod and det.iva_no_rec_mnt:
                # Entrega gratuita / IVA sin derecho a credito: emit IVANoRec
                # subelement with CodIVANoRec (tabla SII) and MntIVANoRec.
                iva_no_rec = etree.SubElement(detalle, "IVANoRec")
                self._elem(iva_no_rec, "CodIVANoRec", str(det.iva_no_rec_cod))
                self._elem(iva_no_rec, "MntIVANoRec", str(det.iva_no_rec_mnt))
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
