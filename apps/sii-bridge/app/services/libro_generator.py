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
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from lxml import etree

logger = logging.getLogger(__name__)

SII_DTE_NS = "http://www.sii.cl/SiiDte"
SII_XSI_NS = "http://www.w3.org/2001/XMLSchema-instance"
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
        nsmap = {None: SII_DTE_NS, "xsi": SII_XSI_NS}

        root = etree.Element(
            "LibroCompraVenta",
            attrib={
                "version": "1.0",
                f"{{{SII_XSI_NS}}}schemaLocation": f"{SII_DTE_NS} LibroCV_v10.xsd",
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
        self._elem(envio_libro, "TmstFirma", datetime.now().strftime("%Y-%m-%dT%H:%M:%S"))

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

        for tipo_doc in sorted(by_tipo.keys()):
            detalles = by_tipo[tipo_doc]
            totales = etree.SubElement(resumen, "TotalesPeriodo")
            self._elem(totales, "TpoDoc", str(tipo_doc))
            self._elem(totales, "TotDoc", str(len(detalles)))

            # Sum amounts — notas de credito subtract
            tot_exe = 0
            tot_neto = 0
            tot_iva = 0
            tot_total = 0
            tot_iva_propio = 0
            tot_iva_uso_comun = 0
            tot_iva_ret_total = 0
            tot_iva_no_retenido = 0

            for d in detalles:
                sign = -1 if d.es_nota_credito else 1
                tot_exe += d.mnt_exe * sign
                tot_neto += d.mnt_neto * sign
                tot_iva += d.mnt_iva * sign
                tot_total += d.mnt_total * sign
                tot_iva_propio += d.iva_propio * sign
                tot_iva_uso_comun += d.iva_uso_comun * sign
                tot_iva_ret_total += d.iva_ret_total * sign
                tot_iva_no_retenido += d.iva_no_retenido * sign

            # XSD sequence: TotMntExe, TotMntNeto, TotMntIVA are REQUIRED
            self._elem(totales, "TotMntExe", str(tot_exe))
            self._elem(totales, "TotMntNeto", str(tot_neto))
            self._elem(totales, "TotMntIVA", str(tot_iva))

            # Libro de Compras: optional fields in XSD sequence order
            # TotIVAUsoComun → FctProp → TotCredIVAUsoComun → ... →
            # TotIVAPropio → ... → TotMntTotal → TotIVARetTotal → TotIVANoRetenido
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

            self._elem(totales, "TotMntTotal", str(tot_total))

            # After TotMntTotal in XSD sequence
            if data.tipo_operacion == "COMPRA":
                if tot_iva_ret_total:
                    self._elem(totales, "TotIVARetTotal", str(tot_iva_ret_total))
                if tot_iva_no_retenido:
                    self._elem(totales, "TotIVANoRetenido", str(tot_iva_no_retenido))

    def _build_detalle(
        self, parent: etree._Element, det: LibroDetalle, tipo_operacion: str
    ):
        """Build a single Detalle element."""
        detalle = etree.SubElement(parent, "Detalle")
        self._elem(detalle, "TpoDoc", str(det.tipo_doc))
        self._elem(detalle, "NroDoc", str(det.nro_doc))

        if det.tasa_imp and det.mnt_neto:
            self._elem(detalle, "TasaImp", f"{det.tasa_imp:.2f}")

        self._elem(detalle, "FchDoc", det.fch_doc)

        if det.rut_doc:
            self._elem(detalle, "RUTDoc", det.rut_doc)
        if det.rzn_soc:
            self._elem(detalle, "RznSoc", det.rzn_soc[:50])

        if det.mnt_exe:
            self._elem(detalle, "MntExe", str(det.mnt_exe))
        if det.mnt_neto:
            self._elem(detalle, "MntNeto", str(det.mnt_neto))
        if det.mnt_iva:
            self._elem(detalle, "MntIVA", str(det.mnt_iva))

        # Libro de Compras specific fields
        if tipo_operacion == "COMPRA":
            if det.iva_propio:
                self._elem(detalle, "IVAPropio", str(det.iva_propio))
            if det.iva_uso_comun:
                self._elem(detalle, "IVAUsoComun", str(det.iva_uso_comun))
            if det.iva_ret_total:
                self._elem(detalle, "IVARetTotal", str(det.iva_ret_total))
            if det.iva_no_retenido:
                self._elem(detalle, "IVANoRetenido", str(det.iva_no_retenido))

        self._elem(detalle, "MntTotal", str(det.mnt_total))

    @staticmethod
    def _elem(parent: etree._Element, tag: str, text: str) -> etree._Element:
        el = etree.SubElement(parent, tag)
        el.text = text
        return el


# Singleton
libro_generator = LibroXMLGenerator()
