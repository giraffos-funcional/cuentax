"""
CUENTAX — Timbre Electrónico Digital (TED)
=============================================
Genera el TED que va dentro de cada DTE.
El TED es una firma digital sobre los datos del documento
usando la clave privada del CAF (no la del certificado).

Se usa para:
1. Validar DTEs offline (impreso como PDF417 en el PDF)
2. Requisito obligatorio en cada DTE enviado al SII

Referencia: formato_dte.pdf del SII
"""

import base64
import copy
import logging
import re
from datetime import datetime
from typing import Optional
from lxml import etree
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.backends import default_backend

from app.services.caf_manager import CAFData
from app.utils.xml_safe import safe_fromstring

logger = logging.getLogger(__name__)


class TimbreElectronicoService:
    """
    Generates the TED (Timbre Electrónico Digital) element for DTEs.

    The TED contains:
    - DD: Document data (emisor RUT, tipo, folio, fecha, receptor, monto, item1)
    - CAF: The complete CAF authorization block (embedded from the CAF XML)
    - FRMT: RSA-SHA1 signature of DD, signed with the CAF private key
    """

    def generate_ted(
        self,
        rut_emisor: str,
        tipo_dte: int,
        folio: int,
        fecha_emision: str,
        rut_receptor: str,
        razon_social_receptor: str,
        monto_total: int,
        item1_nombre: str,
        caf_data: CAFData,
        timestamp: Optional[str] = None,
    ) -> etree._Element:
        """
        Build the TED XML element with DD signed standalone.

        NOTE: If the TED will be placed inside a namespaced parent (e.g.
        SiiDte Documento), call build_ted_unsigned() + sign_ted_in_tree()
        instead, so that inclusive C14N produces consistent bytes at both
        signing and verification time.

        Returns:
            lxml Element for the TED (signed)
        """
        ted, caf_data_for_sign = self.build_ted_unsigned(
            rut_emisor=rut_emisor,
            tipo_dte=tipo_dte,
            folio=folio,
            fecha_emision=fecha_emision,
            rut_receptor=rut_receptor,
            razon_social_receptor=razon_social_receptor,
            monto_total=monto_total,
            item1_nombre=item1_nombre,
            caf_data=caf_data,
            timestamp=timestamp,
        )
        self.sign_ted(ted, caf_data)
        return ted

    def build_ted_unsigned(
        self,
        rut_emisor: str,
        tipo_dte: int,
        folio: int,
        fecha_emision: str,
        rut_receptor: str,
        razon_social_receptor: str,
        monto_total: int,
        item1_nombre: str,
        caf_data: CAFData,
        timestamp: Optional[str] = None,
    ) -> tuple[etree._Element, CAFData]:
        """
        Build the TED XML element WITHOUT the FRMT signature.

        Call sign_ted() or sign_ted_in_tree() after placing the TED
        in its final tree position.

        Returns:
            (ted_element, caf_data) tuple
        """
        if not timestamp:
            timestamp = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")

        ted = etree.Element("TED", attrib={"version": "1.0"})
        dd = etree.SubElement(ted, "DD")

        self._elem(dd, "RE", rut_emisor)
        self._elem(dd, "TD", str(tipo_dte))
        self._elem(dd, "F", str(folio))
        self._elem(dd, "FE", fecha_emision)
        self._elem(dd, "RR", rut_receptor)
        self._elem(dd, "RSR", razon_social_receptor[:40])
        self._elem(dd, "MNT", str(monto_total))
        self._elem(dd, "IT1", item1_nombre[:40])

        caf_element = self._extract_caf_element(caf_data.caf_xml_raw)
        if caf_element is not None:
            dd.append(caf_element)
        else:
            logger.error("Could not extract CAF element from raw XML")
            raise ValueError("Invalid CAF XML: cannot extract <CAF> block")

        self._elem(dd, "TSTED", timestamp)

        logger.debug(f"TED (unsigned) built for tipo={tipo_dte} folio={folio}")
        return ted, caf_data

    def sign_ted(self, ted_element: etree._Element, caf_data: CAFData):
        """
        Sign the DD element inside the TED and append FRMT.

        Call this AFTER the TED is placed in its final tree position
        so inclusive C14N picks up the correct ancestor namespaces.
        """
        dd = ted_element.find("DD")
        if dd is None:
            raise ValueError("TED element has no DD child")

        pem_key = caf_data.private_key_pem
        if not pem_key:
            pem_key = self._extract_private_key_from_xml(caf_data.caf_xml_raw)

        signature_b64 = self._sign_dd(dd, pem_key)
        frmt = etree.SubElement(ted_element, "FRMT", attrib={"algoritmo": "SHA1withRSA"})
        frmt.text = signature_b64

        logger.debug("TED DD signed")

    def _extract_caf_element(self, caf_xml_raw: str) -> Optional[etree._Element]:
        """Extract the <CAF> element (with <DA> and <FRMA>) from the raw CAF XML."""
        try:
            root = safe_fromstring(caf_xml_raw)
            # The CAF element is typically the root or a direct child
            # Look for <AUTORIZACION><CAF>...</CAF></AUTORIZACION> pattern
            caf_el = root.find(".//CAF")
            if caf_el is None:
                # Maybe the root IS the CAF
                if root.tag == "CAF":
                    caf_el = root
                else:
                    # Try AUTORIZACION wrapper
                    caf_el = root.find(".//AUTORIZACION/CAF")

            if caf_el is not None:
                caf_copy = copy.deepcopy(caf_el)
                # Ensure version attribute
                if "version" not in caf_copy.attrib:
                    caf_copy.set("version", "1.0")
                return caf_copy

        except Exception as e:
            logger.error(f"Error extracting CAF element: {e}")

        return None

    def _extract_private_key_from_xml(self, caf_xml_raw: str) -> str:
        """Fallback: extract RSA private key directly from the raw CAF XML."""
        try:
            root = safe_fromstring(caf_xml_raw)
            privk = root.find(".//RSASK")
            if privk is None:
                privk = root.find(".//ECCSK")
            if privk is not None and privk.text:
                key = privk.text.strip()
                logger.info(f"Extracted private key from caf_xml_raw ({len(key)} chars)")
                return key
        except Exception as e:
            logger.error(f"Failed to extract private key from caf_xml_raw: {e}")
        return ""

    def _sign_dd(self, dd_element: etree._Element, private_key_pem: str) -> str:
        """
        Sign the DD element with the CAF's RSA private key using SHA1.

        The SII expects the FRMT to be computed over DD serialized as
        ISO-8859-1 with whitespace between tags removed (flattened).
        This must be done while DD is standalone (not yet in the DTE
        tree) to avoid inheriting ancestor namespace declarations.

        Returns base64-encoded signature.
        """
        # Serialize DD to ISO-8859-1, no XML declaration
        dd_bytes = etree.tostring(dd_element, encoding="ISO-8859-1", xml_declaration=False)
        # Flatten: remove all whitespace between tags
        dd_flat = re.sub(b">\\s+<", b"><", dd_bytes)

        logger.debug(f"DD flattened for signing ({len(dd_flat)} bytes)")

        # Load CAF private key
        pem_key = private_key_pem.strip()
        if not pem_key.startswith("-----BEGIN"):
            pem_key = f"-----BEGIN RSA PRIVATE KEY-----\n{pem_key}\n-----END RSA PRIVATE KEY-----"

        private_key = serialization.load_pem_private_key(
            pem_key.encode(),
            password=None,
            backend=default_backend(),
        )

        # RSA-SHA1 signature over flattened ISO-8859-1 bytes
        sig_bytes = private_key.sign(
            dd_flat,
            padding.PKCS1v15(),
            hashes.SHA1(),
        )

        return base64.b64encode(sig_bytes).decode()

    def ted_to_string(self, ted_element: etree._Element) -> str:
        """Serialize TED to string for PDF417 barcode encoding."""
        return etree.tostring(ted_element, encoding="unicode", xml_declaration=False)

    @staticmethod
    def _elem(parent, tag: str, text: str) -> etree._Element:
        el = etree.SubElement(parent, tag)
        el.text = text
        return el


# Singleton
timbre_electronico_service = TimbreElectronicoService()
