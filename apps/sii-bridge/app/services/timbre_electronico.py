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
        Build the TED XML element.

        Args:
            rut_emisor: RUT of the issuing company
            tipo_dte: Document type (33, 39, 41, 56, 61)
            folio: Document folio number
            fecha_emision: Date of emission (YYYY-MM-DD)
            rut_receptor: RUT of the receiver
            razon_social_receptor: Name of the receiver (truncated to 40 chars)
            monto_total: Total amount (integer)
            item1_nombre: Name of the first item (truncated to 40 chars)
            caf_data: The loaded CAFData with private key and raw XML
            timestamp: Signature timestamp (default: now)

        Returns:
            lxml Element for the TED
        """
        if not timestamp:
            timestamp = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")

        # Build DD (Datos del Documento)
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

        # Embed CAF block from the raw CAF XML
        caf_element = self._extract_caf_element(caf_data.caf_xml_raw)
        if caf_element is not None:
            dd.append(caf_element)
        else:
            logger.error("Could not extract CAF element from raw XML")
            raise ValueError("Invalid CAF XML: cannot extract <CAF> block")

        self._elem(dd, "TSTED", timestamp)

        # Sign DD with CAF private key (RSA-SHA1)
        signature_b64 = self._sign_dd(dd, caf_data.private_key_pem)
        frmt = etree.SubElement(ted, "FRMT", attrib={"algoritmo": "SHA1withRSA"})
        frmt.text = signature_b64

        logger.debug(f"TED generated for DTE tipo={tipo_dte} folio={folio}")
        return ted

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

    def _sign_dd(self, dd_element: etree._Element, private_key_pem: str) -> str:
        """
        Sign the DD element with the CAF's RSA private key using SHA1.

        Returns base64-encoded signature.
        """
        # Canonicalize DD
        dd_c14n = etree.tostring(dd_element, method="c14n", exclusive=False, with_comments=False)

        # Load CAF private key
        # The CAF private key is stored as raw PEM content (just the base64 key material)
        # We need to wrap it in PEM headers if not already present
        pem_key = private_key_pem.strip()
        if not pem_key.startswith("-----BEGIN"):
            pem_key = f"-----BEGIN RSA PRIVATE KEY-----\n{pem_key}\n-----END RSA PRIVATE KEY-----"

        private_key = serialization.load_pem_private_key(
            pem_key.encode(),
            password=None,
            backend=default_backend(),
        )

        # RSA-SHA1 signature
        sig_bytes = private_key.sign(
            dd_c14n,
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
