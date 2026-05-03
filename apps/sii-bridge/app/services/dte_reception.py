"""
CUENTAX — DTE Reception Service
==================================
Handles reception of DTEs from other companies or from the SII
during the certification intercambio step.

Functions:
1. Parse incoming EnvioDTE XML
2. Validate DTEs (schema, signature, RUT)
3. Generate RecepcionDTE response XML
4. Generate ResultadoDTE (accept/reject) response XML
"""

import logging
from datetime import datetime, timezone, timedelta

_CHILE_TZ = timezone(timedelta(hours=-4))
from typing import Optional
from lxml import etree

from app.services.certificate import certificate_service
from app.utils.xml_safe import safe_fromstring

logger = logging.getLogger(__name__)

SII_DTE_NS = "http://www.sii.cl/SiiDte"


class DTEReceptionService:
    """Handles reception of DTEs from third parties or SII."""

    def parse_envio(self, xml_content: str) -> dict:
        """
        Parse an incoming EnvioDTE XML and extract all DTEs.

        Returns:
            {
                "success": bool,
                "rut_emisor": str,
                "total_dtes": int,
                "dtes": [{tipo_dte, folio, rut_emisor, rut_receptor, monto_total, fecha}],
                "errores": [str],
            }
        """
        try:
            root = safe_fromstring(xml_content)
        except etree.XMLSyntaxError as e:
            return {"success": False, "errores": [f"Invalid XML: {e}"]}

        dtes_data = []
        errores = []

        # Find all DTE elements (use `is None` checks instead of `or` because
        # leaf lxml elements are falsy in boolean contexts)
        dte_elements = root.findall(f".//{{{SII_DTE_NS}}}DTE")
        if not dte_elements:
            dte_elements = root.findall(".//DTE")

        def _find_either(parent, tag):
            if parent is None:
                return None
            el = parent.find(f".//{{{SII_DTE_NS}}}{tag}")
            if el is None:
                el = parent.find(f".//{tag}")
            return el

        for dte_el in dte_elements:
            try:
                doc = _find_either(dte_el, "Documento")
                if doc is None:
                    errores.append("DTE without Documento element")
                    continue

                enc = _find_either(doc, "Encabezado")
                if enc is None:
                    errores.append("Documento without Encabezado")
                    continue

                id_doc = _find_either(enc, "IdDoc")
                emisor = _find_either(enc, "Emisor")
                receptor = _find_either(enc, "Receptor")
                totales = _find_either(enc, "Totales")

                tipo_dte = self._get_text(id_doc, "TipoDTE")
                folio = self._get_text(id_doc, "Folio")
                fecha = self._get_text(id_doc, "FchEmis")
                rut_emisor = self._get_text(emisor, "RUTEmisor")
                rut_receptor = self._get_text(receptor, "RUTRecep")
                monto = self._get_text(totales, "MntTotal")

                dtes_data.append({
                    "tipo_dte": int(tipo_dte) if tipo_dte else 0,
                    "folio": int(folio) if folio else 0,
                    "rut_emisor": rut_emisor or "",
                    "rut_receptor": rut_receptor or "",
                    "monto_total": int(monto) if monto else 0,
                    "fecha_emision": fecha or "",
                })
            except Exception as e:
                errores.append(f"Error parsing DTE: {e}")

        # Extract caratula info
        caratula = root.find(f".//{{{SII_DTE_NS}}}Caratula")
        if caratula is None:
            caratula = root.find(".//Caratula")
        rut_emisor_envio = self._get_text(caratula, "RutEmisor") if caratula is not None else ""

        return {
            "success": len(dtes_data) > 0,
            "rut_emisor": rut_emisor_envio,
            "total_dtes": len(dtes_data),
            "dtes": dtes_data,
            "errores": errores,
        }

    def generate_recepcion_dte(
        self,
        rut_receptor: str,
        rut_emisor_envio: str,
        dtes_recibidos: list[dict],
        rut_firma: Optional[str] = None,
    ) -> str:
        """
        Generate RecepcionDTE XML (acuse de recibo del envío).

        This acknowledges receipt of the EnvioDTE package.

        Args:
            rut_receptor: Our RUT (the company receiving)
            rut_emisor_envio: RUT of the company that sent the EnvioDTE
            dtes_recibidos: List of received DTEs with estado
            rut_firma: RUT for signing (default: rut_receptor)

        Returns:
            Signed RecepcionDTE XML string
        """
        timestamp = datetime.now(_CHILE_TZ).strftime("%Y-%m-%dT%H:%M:%S")
        nsmap = {None: SII_DTE_NS}

        recepcion = etree.Element(
            "RespuestaDTE",
            attrib={"version": "1.0"},
            nsmap=nsmap,
        )
        resultado = etree.SubElement(recepcion, "Resultado", attrib={"ID": "Recepcion"})

        # Caratula — XSD strict order:
        #   RutResponde, RutRecibe, IdRespuesta, NroDetalles, NmbContacto?,
        #   MailContacto?, TmstFirmaResp
        caratula = etree.SubElement(resultado, "Caratula", attrib={"version": "1.0"})
        self._elem(caratula, "RutResponde", rut_receptor)
        self._elem(caratula, "RutRecibe", rut_emisor_envio)
        self._elem(caratula, "IdRespuesta", "1")
        self._elem(caratula, "NroDetalles", str(len(dtes_recibidos)))
        self._elem(caratula, "NmbContacto", "CUENTAX Sistema")
        self._elem(caratula, "MailContacto", "")
        self._elem(caratula, "TmstFirmaResp", timestamp)

        # RecepcionEnvio. CodEnvio min=1 per XSD facet.
        recep_envio = etree.SubElement(resultado, "RecepcionEnvio")
        self._elem(recep_envio, "NmbEnvio", "EnvioDTE.xml")
        self._elem(recep_envio, "FchRecep", timestamp)
        self._elem(recep_envio, "CodEnvio", "1")
        self._elem(recep_envio, "EnvioDTEID", "SetDoc")
        self._elem(recep_envio, "Digest", "")
        self._elem(recep_envio, "RutEmisor", rut_emisor_envio)
        self._elem(recep_envio, "RutReceptor", rut_receptor)
        self._elem(recep_envio, "EstadoRecepEnv", "0")  # 0 = Envío recibido OK
        self._elem(recep_envio, "RecepEnvGlosa", "Envío recibido correctamente")
        self._elem(recep_envio, "NroDTE", str(len(dtes_recibidos)))

        # RecepcionDTE for each document. SII certification expects DTEs whose
        # RUTRecep does not match our RUT to be flagged with EstadoRecepDTE=3
        # (RUT Receptor no corresponde) — this is exactly the trampa that ships
        # in the Set de Intercambio: 1 DTE addressed to us + 1 addressed to a
        # different RUT to validate that our system rejects misdirected docs.
        for dte in dtes_recibidos:
            recep_dte = etree.SubElement(recep_envio, "RecepcionDTE")
            self._elem(recep_dte, "TipoDTE", str(dte["tipo_dte"]))
            self._elem(recep_dte, "Folio", str(dte["folio"]))
            self._elem(recep_dte, "FchEmis", dte.get("fecha_emision", ""))
            self._elem(recep_dte, "RUTEmisor", dte.get("rut_emisor", ""))
            self._elem(recep_dte, "RUTRecep", dte.get("rut_receptor") or rut_receptor)
            self._elem(recep_dte, "MntTotal", str(dte.get("monto_total", 0)))
            dte_rut_recep = (dte.get("rut_receptor") or "").strip()
            our_rut = rut_receptor.strip()
            if dte_rut_recep and dte_rut_recep != our_rut:
                # 3 = RUT Receptor no corresponde
                self._elem(recep_dte, "EstadoRecepDTE", "3")
                self._elem(recep_dte, "RecepDTEGlosa", "RUT Receptor no corresponde")
            else:
                self._elem(recep_dte, "EstadoRecepDTE", "0")
                self._elem(recep_dte, "RecepDTEGlosa", "Documento recibido OK")

        # Sign the Resultado element first, then the outer RespuestaDTE
        # (XSD requires Signature on both layers)
        certificate_service.sign_xml(resultado, rut_emisor=rut_firma or rut_receptor)
        certificate_service.sign_xml(recepcion, rut_emisor=rut_firma or rut_receptor)

        return etree.tostring(recepcion, encoding="ISO-8859-1", xml_declaration=True).decode("iso-8859-1")

    def generate_resultado_dte(
        self,
        rut_receptor: str,
        rut_emisor: str,
        tipo_dte: int,
        folio: int,
        fecha_emision: str,
        monto_total: int,
        aceptado: bool = True,
        glosa: str = "",
        rut_firma: Optional[str] = None,
    ) -> str:
        """
        Generate ResultadoDTE XML (commercial acceptance/rejection).

        After receiving a DTE and sending the acuse de recibo,
        the receiver must accept or reject the document.

        Args:
            rut_receptor: Our RUT
            rut_emisor: Emisor RUT
            tipo_dte: Document type
            folio: Document folio
            fecha_emision: Emission date
            monto_total: Total amount
            aceptado: True = accept, False = reject
            glosa: Explanation text
            rut_firma: RUT for signing

        Returns:
            Signed ResultadoDTE XML string
        """
        timestamp = datetime.now(_CHILE_TZ).strftime("%Y-%m-%dT%H:%M:%S")
        nsmap = {None: SII_DTE_NS}

        resp = etree.Element(
            "RespuestaDTE",
            attrib={"version": "1.0"},
            nsmap=nsmap,
        )
        resultado = etree.SubElement(resp, "Resultado", attrib={"ID": "ResultadoDTE"})

        # Caratula — XSD strict order: RutResponde, RutRecibe, IdRespuesta,
        # NroDetalles, NmbContacto?, MailContacto?, TmstFirmaResp
        caratula = etree.SubElement(resultado, "Caratula", attrib={"version": "1.0"})
        self._elem(caratula, "RutResponde", rut_receptor)
        self._elem(caratula, "RutRecibe", rut_emisor)
        self._elem(caratula, "IdRespuesta", "1")
        self._elem(caratula, "NroDetalles", "1")
        self._elem(caratula, "NmbContacto", "CUENTAX Sistema")
        self._elem(caratula, "MailContacto", "")
        self._elem(caratula, "TmstFirmaResp", timestamp)

        result_dte = etree.SubElement(resultado, "ResultadoDTE")
        self._elem(result_dte, "TipoDTE", str(tipo_dte))
        self._elem(result_dte, "Folio", str(folio))
        self._elem(result_dte, "FchEmis", fecha_emision)
        self._elem(result_dte, "RUTEmisor", rut_emisor)
        self._elem(result_dte, "RUTRecep", rut_receptor)
        self._elem(result_dte, "MntTotal", str(monto_total))
        # CodEnvio min=1 per XSD facet (1=aceptado, 2=rechazado para schema)
        self._elem(result_dte, "CodEnvio", "1")
        self._elem(result_dte, "EstadoDTE", "0" if aceptado else "2")
        self._elem(result_dte, "EstadoDTEGlosa", glosa or ("Documento aceptado" if aceptado else "Documento rechazado"))

        # Sign the Resultado then the outer RespuestaDTE (XSD requires both)
        certificate_service.sign_xml(resultado, rut_emisor=rut_firma or rut_receptor)
        certificate_service.sign_xml(resp, rut_emisor=rut_firma or rut_receptor)

        return etree.tostring(resp, encoding="ISO-8859-1", xml_declaration=True).decode("iso-8859-1")

    def generate_envio_recibos(
        self,
        rut_receptor: str,
        rut_emisor_envio: str,
        dtes_recibidos: list[dict],
        rut_firma: Optional[str] = None,
    ) -> str:
        """
        Generate EnvioRecibos XML (Recepción de Mercaderías / Servicios).

        SII certification Paso 4 INTERCAMBIO expects this as the second file:
        a Recibo per DTE that we ACCEPT (i.e. DTEs whose RUTRecep matches
        ours). For DTEs addressed to other RUTs no Recibo is emitted.

        Returns:
            Signed EnvioRecibos XML string
        """
        timestamp = datetime.now(_CHILE_TZ).strftime("%Y-%m-%dT%H:%M:%S")
        nsmap = {None: SII_DTE_NS}

        envio = etree.Element(
            "EnvioRecibos",
            attrib={"version": "1.0"},
            nsmap=nsmap,
        )
        set_recibos = etree.SubElement(envio, "SetRecibos", attrib={"ID": "SetRecibos"})

        # Caratula
        caratula = etree.SubElement(set_recibos, "Caratula", attrib={"version": "1.0"})
        self._elem(caratula, "RutResponde", rut_receptor)
        self._elem(caratula, "RutRecibe", rut_emisor_envio)
        self._elem(caratula, "NmbContacto", "CUENTAX Sistema")
        self._elem(caratula, "MailContacto", "")
        self._elem(caratula, "TmstFirmaEnv", timestamp)

        # Canonical Declaracion text required by EnvioRecibos_v10.xsd as a
        # fixed value. The schema rejects any deviation so we hard-code it
        # exactly as the SII publishes it.
        # Schema-fixed value (sin acentos, sin grado, "ley" en minuscula).
        # El XSD compara byte-a-byte contra esta cadena exacta.
        DECLARACION_FIJA = (
            "El acuse de recibo que se declara en este acto, de acuerdo a "
            "lo dispuesto en la letra b) del Art. 4, y la letra c) del Art. 5 "
            "de la Ley 19.983, acredita que la entrega de mercaderias o "
            "servicio(s) prestado(s) ha(n) sido recibido(s)."
        )

        # One Recibo per DTE addressed to us
        idx = 0
        for dte in dtes_recibidos:
            dte_rut_recep = (dte.get("rut_receptor") or "").strip()
            if dte_rut_recep and dte_rut_recep != rut_receptor.strip():
                continue  # not for us — skip
            idx += 1
            recibo = etree.SubElement(set_recibos, "Recibo", attrib={"version": "1.0"})
            doc = etree.SubElement(recibo, "DocumentoRecibo", attrib={"ID": f"DOC_{idx}"})
            self._elem(doc, "TipoDoc", str(dte["tipo_dte"]))
            self._elem(doc, "Folio", str(dte["folio"]))
            self._elem(doc, "FchEmis", dte.get("fecha_emision", ""))
            self._elem(doc, "RUTEmisor", dte.get("rut_emisor", ""))
            self._elem(doc, "RUTRecep", rut_receptor)
            self._elem(doc, "MntTotal", str(dte.get("monto_total", 0)))
            self._elem(doc, "Recinto", "Oficina Zyncro Av Irarrazaval 2401 Of 1108")
            self._elem(doc, "RutFirma", rut_firma or rut_receptor)
            self._elem(doc, "Declaracion", DECLARACION_FIJA)
            self._elem(doc, "TmstFirmaRecibo", timestamp)
            # Sign each Recibo
            certificate_service.sign_xml(recibo, rut_emisor=rut_firma or rut_receptor)

        # Sign SetRecibos envelope, then the outer EnvioRecibos
        certificate_service.sign_xml(set_recibos, rut_emisor=rut_firma or rut_receptor)
        certificate_service.sign_xml(envio, rut_emisor=rut_firma or rut_receptor)

        return etree.tostring(envio, encoding="ISO-8859-1", xml_declaration=True).decode("iso-8859-1")

    def _get_text(self, parent, tag: str) -> Optional[str]:
        """Extract text from a child element, searching with and without namespace.

        IMPORTANT: lxml elements with no children evaluate to ``False`` in a
        boolean context (deprecation but still in effect). That breaks the
        common ``find(ns) or find(no_ns)`` fallback for leaf elements like
        <TipoDTE>33</TipoDTE> — find() returns the element but `or` discards
        it and walks the no-namespace path, which doesn't match. Use
        ``is None`` explicitly.
        """
        if parent is None:
            return None
        el = parent.find(f"{{{SII_DTE_NS}}}{tag}")
        if el is None:
            el = parent.find(tag)
        return el.text.strip() if el is not None and el.text else None

    @staticmethod
    def _elem(parent, tag: str, text: str) -> etree._Element:
        el = etree.SubElement(parent, tag)
        el.text = text
        return el


# Singleton
dte_reception_service = DTEReceptionService()
