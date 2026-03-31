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
from xml.sax.saxutils import escape as xml_escape
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

    IMPORTANT: DD is built as plain-text string (no lxml, no xmlns) to avoid
    namespace contamination from ancestor elements. The SII verifier expects
    DD bytes WITHOUT any xmlns declarations.
    """

    def generate_ted_signed(
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
        Build and sign the TED as plain-text strings, then parse to lxml element.

        This approach avoids xmlns inheritance from ancestor elements (SiiDte
        namespace) that would invalidate the FRMT signature. The DD is built
        as a concatenated string, signed as ISO-8859-1 bytes, and the complete
        TED is assembled as a string before parsing to lxml.

        Returns:
            lxml Element for the signed TED
        """
        if not timestamp:
            timestamp = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")

        # Extract CAF block as clean string (no xmlns)
        caf_str = self._get_caf_string(caf_data.caf_xml_raw)
        if not caf_str:
            raise ValueError("Invalid CAF XML: cannot extract <CAF> block")

        # Build DD as plain-text string — NO lxml, NO xmlns
        # XML-escape text values to handle &, <, > in business data
        rsr = xml_escape(razon_social_receptor[:40])
        it1 = xml_escape(item1_nombre[:40])
        dd_str = (
            f"<DD>"
            f"<RE>{xml_escape(rut_emisor)}</RE>"
            f"<TD>{tipo_dte}</TD>"
            f"<F>{folio}</F>"
            f"<FE>{fecha_emision}</FE>"
            f"<RR>{xml_escape(rut_receptor)}</RR>"
            f"<RSR>{rsr}</RSR>"
            f"<MNT>{monto_total}</MNT>"
            f"<IT1>{it1}</IT1>"
            f"{caf_str}"
            f"<TSTED>{timestamp}</TSTED>"
            f"</DD>"
        )

        # Encode to ISO-8859-1 and flatten whitespace
        dd_bytes = dd_str.encode("iso-8859-1")
        dd_flat = re.sub(b">\\s+<", b"><", dd_bytes)

        logger.debug(f"DD plain-text for signing ({len(dd_flat)} bytes): {dd_flat[:120]}...")

        # Get private key from CAF
        pem_key = caf_data.private_key_pem
        if not pem_key:
            pem_key = self._extract_private_key_from_xml(caf_data.caf_xml_raw)
        if not pem_key:
            raise ValueError("No private key available in CAF data")

        # RSA-SHA1 signature
        frmt_b64 = self._sign_bytes(dd_flat, pem_key)

        # Assemble complete TED as string, then parse to lxml
        # Prepend XML declaration so lxml knows this is ISO-8859-1
        ted_str = (
            f'<?xml version="1.0" encoding="ISO-8859-1"?>'
            f'<TED version="1.0">'
            f"{dd_str}"
            f'<FRMT algoritmo="SHA1withRSA">{frmt_b64}</FRMT>'
            f"</TED>"
        )

        logger.debug(f"TED signed for tipo={tipo_dte} folio={folio}")
        return etree.fromstring(ted_str.encode("iso-8859-1"))

    def _get_caf_string(self, caf_xml_raw: str) -> Optional[str]:
        """Extract <CAF> block as a clean string with no xmlns declarations."""
        try:
            root = safe_fromstring(caf_xml_raw)
            caf_el = root.find(".//CAF")
            if caf_el is None:
                if root.tag == "CAF":
                    caf_el = root
                else:
                    caf_el = root.find(".//AUTORIZACION/CAF")

            if caf_el is None:
                return None

            caf_copy = copy.deepcopy(caf_el)
            if "version" not in caf_copy.attrib:
                caf_copy.set("version", "1.0")

            # Serialize, strip ALL xmlns declarations, flatten whitespace, strip trailing
            caf_bytes = etree.tostring(caf_copy, encoding="unicode")
            caf_clean = re.sub(r'\s+xmlns(:[a-zA-Z0-9]+)?="[^"]*"', '', caf_bytes)
            caf_flat = re.sub(r'>\s+<', '><', caf_clean).strip()
            return caf_flat

        except Exception as e:
            logger.error(f"Error extracting CAF string: {e}")
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

    def _sign_bytes(self, data: bytes, private_key_pem: str) -> str:
        """RSA-SHA1 sign raw bytes. Returns base64-encoded signature."""
        pem_key = private_key_pem.strip()
        if not pem_key.startswith("-----BEGIN"):
            pem_key = f"-----BEGIN RSA PRIVATE KEY-----\n{pem_key}\n-----END RSA PRIVATE KEY-----"

        private_key = serialization.load_pem_private_key(
            pem_key.encode(),
            password=None,
            backend=default_backend(),
        )

        sig_bytes = private_key.sign(
            data,
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
