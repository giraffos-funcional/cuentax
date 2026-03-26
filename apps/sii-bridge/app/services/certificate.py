"""
CUENTAX — Certificate Service (SII Bridge)
===========================================
Carga y gestiona el certificado digital PFX/P12 del SII.
Implementa la firma XML con SHA1+RSA según el estándar SII Chile.

El SII usa XMLDSig con:
- Algoritmo de firma: RSA-SHA1 (obligatorio por SII)
- Algoritmo de digest: SHA1
- CanonicalizationMethod: C14N
"""

import logging
import base64
import hashlib
from datetime import datetime, timezone
from typing import Optional
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.backends import default_backend
from cryptography import x509
from lxml import etree

logger = logging.getLogger(__name__)

XMLDSIG_NS = "http://www.w3.org/2000/09/xmldsig#"
C14N_METHOD = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"


class CertificateService:
    def __init__(self):
        self._private_key = None
        self._certificate = None
        self._rut_empresa: Optional[str] = None
        self._vence: Optional[datetime] = None

    @property
    def is_loaded(self) -> bool:
        return self._private_key is not None and self._certificate is not None

    def load_pfx(self, pfx_bytes: bytes, password: str, rut_empresa: str) -> dict:
        try:
            private_key, certificate, _ = pkcs12.load_key_and_certificates(
                pfx_bytes,
                password.encode() if isinstance(password, str) else password,
                backend=default_backend(),
            )
        except Exception as e:
            raise ValueError(f"Error cargando PFX: {e}. Verifica la contraseña.")

        if not private_key or not certificate:
            raise ValueError("PFX no contiene clave privada o certificado")

        self._private_key = private_key
        self._certificate = certificate
        self._rut_empresa = rut_empresa

        not_after = (
            certificate.not_valid_after_utc
            if hasattr(certificate, 'not_valid_after_utc')
            else certificate.not_valid_after.replace(tzinfo=timezone.utc)
        )
        self._vence = not_after
        days_remaining = (not_after - datetime.now(timezone.utc)).days

        logger.info(f"✅ Cert cargado — RUT: {rut_empresa}, Vence: {not_after.date()}, Días: {days_remaining}")

        if days_remaining < 30:
            logger.warning(f"⚠️  Certificado vence en {days_remaining} días!")

        return {
            "success": True,
            "rut_empresa": rut_empresa,
            "nombre_empresa": self._get_cn(certificate),
            "vence": not_after.isoformat(),
            "dias_para_vencer": days_remaining,
            "mensaje": f"Certificado cargado. Vence en {days_remaining} días.",
        }

    def sign_xml(self, element: etree._Element) -> etree._Element:
        """Firma XML con RSA-SHA1 según estándar SII Chile."""
        if not self.is_loaded:
            raise RuntimeError("Sin certificado cargado")

        element_id = element.get("ID") or element.get("id") or ""
        reference_uri = f"#{element_id}" if element_id else ""

        # C14N del elemento
        c14n_bytes = etree.tostring(element, method="c14n", exclusive=False, with_comments=False)

        # Digest SHA1
        digest = base64.b64encode(hashlib.sha1(c14n_bytes).digest()).decode()

        # SignedInfo
        signed_info_xml = f"""<SignedInfo xmlns="{XMLDSIG_NS}">
            <CanonicalizationMethod Algorithm="{C14N_METHOD}"/>
            <SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>
            <Reference URI="{reference_uri}">
                <DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
                <DigestValue>{digest}</DigestValue>
            </Reference>
        </SignedInfo>"""

        signed_info_c14n = etree.tostring(
            etree.fromstring(signed_info_xml.encode()), method="c14n"
        )

        # Firma RSA-SHA1
        sig_bytes = self._private_key.sign(signed_info_c14n, padding.PKCS1v15(), hashes.SHA1())
        sig_b64 = base64.b64encode(sig_bytes).decode()

        # Cert público en base64
        cert_b64 = base64.b64encode(self._certificate.public_bytes(serialization.Encoding.DER)).decode()

        # Nodo Signature
        signature_xml = f"""<Signature xmlns="{XMLDSIG_NS}">
            {signed_info_xml}
            <SignatureValue>{sig_b64}</SignatureValue>
            <KeyInfo><X509Data><X509Certificate>{cert_b64}</X509Certificate></X509Data></KeyInfo>
        </Signature>"""

        element.append(etree.fromstring(signature_xml.encode()))
        logger.debug(f"XML firmado. Ref: {reference_uri}")
        return element

    def get_status(self) -> dict:
        if not self.is_loaded:
            return {"cargado": False}
        days = (self._vence - datetime.now(timezone.utc)).days if self._vence else None
        return {
            "cargado": True,
            "rut_empresa": self._rut_empresa,
            "vence": self._vence.isoformat() if self._vence else None,
            "dias_para_vencer": days,
        }

    @staticmethod
    def _get_cn(cert: x509.Certificate) -> str:
        try:
            return cert.subject.get_attributes_for_oid(x509.oid.NameOID.COMMON_NAME)[0].value
        except Exception:
            return "Desconocido"


certificate_service = CertificateService()
