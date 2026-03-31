"""
CUENTAX — Generador XML DTE Chile
===================================
Genera el XML de un DTE según el esquema oficial del SII.
Soporta tipos: 33 (Factura), 39 (Boleta), 41 (Boleta No Afecta),
               56 (ND), 61 (NC), 110/111/112/113 (Exportación)

Referencia: https://www.sii.cl/factura_electronica/factura_mercado/formato_dte.pdf
"""

from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional
from lxml import etree
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Schemas ───────────────────────────────────────────────────
SII_DTE_NS    = "http://www.sii.cl/SiiDte"
SII_XSI_NS    = "http://www.w3.org/2001/XMLSchema-instance"
SII_XMLDSIG   = "http://www.w3.org/2000/09/xmldsig#"
SII_XSD_TYPES = {
    33:  "Factura Electrónica",
    39:  "Boleta Electrónica",
    41:  "Boleta Electrónica No Afecta",
    56:  "Nota de Débito Electrónica",
    61:  "Nota de Crédito Electrónica",
    110: "Factura de Exportación Electrónica",
    111: "Liquidación Factura Exportación",
    112: "Nota Débito Exportación",
    113: "Nota Crédito Exportación",
}
IVA_RATE = Decimal("0.19")


@dataclass
class DTEItem:
    nombre: str
    cantidad: Decimal
    precio_unitario: Decimal
    descuento_pct: Decimal = Decimal("0")
    exento: bool = False
    codigo: Optional[str] = None
    unidad: str = "UN"

    @property
    def monto_item(self) -> Decimal:
        bruto = self.cantidad * self.precio_unitario
        descuento = bruto * (self.descuento_pct / 100)
        return (bruto - descuento).quantize(Decimal("1"), rounding=ROUND_HALF_UP)


@dataclass
class DTEEmisor:
    rut: str
    razon_social: str
    giro: str
    direccion: str
    comuna: str
    ciudad: str
    actividad_economica: int = 620200  # Desarrollo software por defecto


@dataclass
class DTEReceptor:
    rut: str
    razon_social: str
    giro: str
    direccion: str
    comuna: str
    ciudad: str
    email: Optional[str] = None
    # Para tipo 61/56 — referencia al DTE original
    ref_tipo_doc: Optional[int] = None
    ref_folio: Optional[int] = None
    ref_fecha: Optional[str] = None
    ref_motivo: Optional[str] = None


@dataclass
class DTEDocumento:
    tipo_dte: int
    folio: int
    fecha_emision: str  # YYYY-MM-DD
    emisor: DTEEmisor
    receptor: DTEReceptor
    items: list[DTEItem]
    forma_pago: int = 1  # 1=Contado, 2=Crédito
    fecha_vencimiento: Optional[str] = None
    observaciones: Optional[str] = None


class DTEXMLGenerator:
    """
    Genera el XML de un DTE según el formato oficial SII Chile.
    El XML generado está listo para ser firmado por SIICertificateService.
    """

    def generate(self, doc: DTEDocumento) -> etree._Element:
        """
        Genera el XML completo del DTE.
        
        Returns:
            Elemento XML lxml sin firmar, listo para firma.
        """
        if doc.tipo_dte not in SII_XSD_TYPES:
            raise ValueError(f"Tipo DTE {doc.tipo_dte} no soportado")

        # Calcular montos
        totales = self._calculate_totals(doc)

        # Root DTE
        dte_root = etree.Element("DTE", attrib={"version": "1.0"}, nsmap={None: SII_DTE_NS})
        documento = etree.SubElement(dte_root, "Documento", attrib={"ID": f"DTE-{doc.folio}"})

        # Encabezado
        encabezado = etree.SubElement(documento, "Encabezado")
        self._build_id_doc(encabezado, doc)
        self._build_emisor(encabezado, doc.emisor)
        self._build_receptor(encabezado, doc.receptor)
        self._build_totales(encabezado, totales, doc.tipo_dte)

        # Detalle de items
        for i, item in enumerate(doc.items, start=1):
            self._build_item(documento, item, i, doc.tipo_dte)

        # Referencia (para NC/ND)
        if doc.receptor.ref_tipo_doc and doc.receptor.ref_folio:
            self._build_referencia(documento, doc)

        logger.debug(f"XML DTE tipo {doc.tipo_dte} folio {doc.folio} generado")
        return dte_root

    def _build_id_doc(self, encabezado, doc: DTEDocumento):
        id_doc = etree.SubElement(encabezado, "IdDoc")
        self._elem(id_doc, "TipoDTE", str(doc.tipo_dte))
        self._elem(id_doc, "Folio", str(doc.folio))
        self._elem(id_doc, "FchEmis", doc.fecha_emision)
        self._elem(id_doc, "FmaPago", str(doc.forma_pago))
        if doc.fecha_vencimiento:
            self._elem(id_doc, "FchVenc", doc.fecha_vencimiento)

    def _build_emisor(self, encabezado, emisor: DTEEmisor):
        e = etree.SubElement(encabezado, "Emisor")
        self._elem(e, "RUTEmisor", emisor.rut)
        self._elem(e, "RznSoc", emisor.razon_social[:100])
        self._elem(e, "GiroEmis", emisor.giro[:80])
        self._elem(e, "Acteco", str(emisor.actividad_economica))
        if emisor.direccion:
            self._elem(e, "DirOrigen", emisor.direccion[:70])
        if emisor.comuna:
            self._elem(e, "CmnaOrigen", emisor.comuna[:20])
        if emisor.ciudad:
            self._elem(e, "CiudadOrigen", emisor.ciudad[:20])

    def _build_receptor(self, encabezado, receptor: DTEReceptor):
        r = etree.SubElement(encabezado, "Receptor")
        self._elem(r, "RUTRecep", receptor.rut)
        self._elem(r, "RznSocRecep", receptor.razon_social[:100])
        self._elem(r, "GiroRecep", receptor.giro[:40])
        if receptor.direccion:
            self._elem(r, "DirRecep", receptor.direccion[:70])
        if receptor.comuna:
            self._elem(r, "CmnaRecep", receptor.comuna[:20])
        if receptor.ciudad:
            self._elem(r, "CiudadRecep", receptor.ciudad[:20])
        if receptor.email:
            self._elem(r, "CorreoRecep", receptor.email)

    def _build_totales(self, encabezado, totales: dict, tipo_dte: int):
        t = etree.SubElement(encabezado, "Totales")
        
        # Boletas (39, 41) incluyen IVA en precio — reportan MntTotal directamente
        if tipo_dte in (39, 41):
            self._elem(t, "MntTotal", str(totales["total"]))
        else:
            if totales["neto"] > 0:
                self._elem(t, "MntNeto", str(totales["neto"]))
            if totales["exento"] > 0:
                self._elem(t, "MntExe", str(totales["exento"]))
            if totales["iva"] > 0:
                self._elem(t, "TasaIVA", "19.00")
                self._elem(t, "IVA", str(totales["iva"]))
            self._elem(t, "MntTotal", str(totales["total"]))

    def _build_item(self, documento, item: DTEItem, idx: int, tipo_dte: int):
        det = etree.SubElement(documento, "Detalle")
        self._elem(det, "NroLinDet", str(idx))
        # XSD sequence: NroLinDet → CdgItem → IndExe → NmbItem
        if item.codigo:
            cd = etree.SubElement(det, "CdgItem")
            self._elem(cd, "TpoCodigo", "INT1")
            self._elem(cd, "VlrCodigo", item.codigo[:35])
        if item.exento:
            self._elem(det, "IndExe", "1")
        self._elem(det, "NmbItem", item.nombre[:80])
        self._elem(det, "QtyItem", str(item.cantidad))
        self._elem(det, "UnmdItem", item.unidad)
        self._elem(det, "PrcItem", str(item.precio_unitario))
        if item.descuento_pct > 0:
            self._elem(det, "DescuentoPct", str(item.descuento_pct))
        self._elem(det, "MontoItem", str(item.monto_item))

    def _build_referencia(self, documento, doc: DTEDocumento):
        ref = etree.SubElement(documento, "Referencia")
        self._elem(ref, "NroLinRef", "1")
        self._elem(ref, "TpoDocRef", str(doc.receptor.ref_tipo_doc))
        self._elem(ref, "FolioRef", str(doc.receptor.ref_folio))
        self._elem(ref, "FchRef", doc.receptor.ref_fecha or doc.fecha_emision)
        if doc.receptor.ref_motivo:
            self._elem(ref, "RazonRef", doc.receptor.ref_motivo[:90])

    def _calculate_totals(self, doc: DTEDocumento) -> dict:
        neto = Decimal("0")
        exento = Decimal("0")

        for item in doc.items:
            if item.exento or doc.tipo_dte == 41:
                exento += item.monto_item
            else:
                neto += item.monto_item

        # Boletas (39) el precio ya incluye IVA
        if doc.tipo_dte in (39,):
            total = neto + exento
            iva = Decimal("0")
        else:
            iva = (neto * IVA_RATE).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
            total = neto + iva + exento

        return {
            "neto": int(neto),
            "exento": int(exento),
            "iva": int(iva),
            "total": int(total),
        }

    @staticmethod
    def _elem(parent, tag: str, text: str) -> etree._Element:
        el = etree.SubElement(parent, tag)
        el.text = text
        return el


    def generate_envio_dte(
        self,
        signed_dtes: list[etree._Element],
        rut_emisor: str,
        rut_envia: str,
        ambiente: str = "certificacion",
    ) -> etree._Element:
        """
        Generate the EnvioDTE envelope that wraps multiple signed DTEs.

        The EnvioDTE contains:
        - SetDTE (ID="SetDoc") with:
          - Caratula (metadata: who sends, resolution, document counts)
          - Multiple <DTE> elements (already individually signed)
        - The SetDTE itself needs to be signed separately (done by certificate_service)

        Args:
            signed_dtes: List of individually signed DTE XML elements
            rut_emisor: RUT of the issuing company
            rut_envia: RUT of the person sending (certificate holder)
            ambiente: "certificacion" or "produccion"

        Returns:
            EnvioDTE XML element (SetDTE NOT yet signed — caller must sign it)
        """
        nsmap = {None: SII_DTE_NS, "xsi": SII_XSI_NS}

        envio = etree.Element(
            "EnvioDTE",
            attrib={
                "version": "1.0",
                f"{{{SII_XSI_NS}}}schemaLocation": f"{SII_DTE_NS} EnvioDTE_v10.xsd",
            },
            nsmap=nsmap,
        )
        set_dte = etree.SubElement(envio, "SetDTE", attrib={"ID": "SetDoc"})

        # Build Caratula
        caratula = self._build_caratula(
            set_dte, signed_dtes, rut_emisor, rut_envia, ambiente
        )

        # Append all signed DTEs
        for dte in signed_dtes:
            set_dte.append(dte)

        logger.info(
            f"EnvioDTE generated: {len(signed_dtes)} DTEs, "
            f"emisor={rut_emisor}, envia={rut_envia}"
        )
        return envio

    def _build_caratula(
        self,
        set_dte: etree._Element,
        signed_dtes: list[etree._Element],
        rut_emisor: str,
        rut_envia: str,
        ambiente: str,
    ) -> etree._Element:
        """Build the Caratula (header) for EnvioDTE."""
        caratula = etree.SubElement(set_dte, "Caratula", attrib={"version": "1.0"})

        self._elem(caratula, "RutEmisor", rut_emisor)
        self._elem(caratula, "RutEnvia", rut_envia)
        # RutReceptor is SII's own RUT for certification/production uploads
        self._elem(caratula, "RutReceptor", "60803000-K")

        # Resolution data depends on environment
        if ambiente == "certificacion":
            self._elem(caratula, "FchResol", "2014-08-22")
            self._elem(caratula, "NroResol", "0")
        else:
            # Production: company's actual SII resolution from config
            if not settings.SII_RESOLUCION_FECHA:
                raise ValueError(
                    "SII_RESOLUCION_FECHA must be set for production environment"
                )
            self._elem(caratula, "FchResol", settings.SII_RESOLUCION_FECHA)
            self._elem(caratula, "NroResol", str(settings.SII_RESOLUCION_NUMERO))

        # Timestamp
        self._elem(caratula, "TmstFirmaEnv", datetime.now().strftime("%Y-%m-%dT%H:%M:%S"))

        # SubTotDTE: count documents by type
        tipo_counts: Counter[int] = Counter()
        for dte in signed_dtes:
            # Extract TipoDTE — try with and without namespace (lxml default
            # namespace handling varies depending on how elements were created)
            tipo_el = None
            for tag_variant in [
                f".//{{{SII_DTE_NS}}}TipoDTE",
                ".//TipoDTE",
                f".//{{{SII_DTE_NS}}}IdDoc/{{{SII_DTE_NS}}}TipoDTE",
                ".//IdDoc/TipoDTE",
            ]:
                tipo_el = dte.find(tag_variant)
                if tipo_el is not None:
                    break

            if tipo_el is not None and tipo_el.text:
                tipo_counts[int(tipo_el.text)] += 1
            else:
                logger.warning(f"Could not find TipoDTE in DTE element: {etree.tostring(dte)[:200]}")

        for tipo_dte, count in sorted(tipo_counts.items()):
            sub = etree.SubElement(caratula, "SubTotDTE")
            self._elem(sub, "TpoDTE", str(tipo_dte))
            self._elem(sub, "NroDTE", str(count))

        return caratula


# Singleton
dte_generator = DTEXMLGenerator()
