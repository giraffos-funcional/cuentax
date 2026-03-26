"""
Servicio de firma digital XML — SII Chile
==========================================
Firma documentos XML DTE usando el certificado digital de la empresa.
Compatible con el formato requerido por el SII (SHA1 + RSA).

Basado en el código validado de Boletax (Phase 4 Validation).
"""

import logging
from pathlib import Path
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from signxml import XMLSigner, XMLVerifier, methods
from lxml import etree
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


class SIICertificateService:
    """
    Gestiona el certificado digital PFX/P12 de la empresa.
    Proporciona métodos de firma XML y criptografía compatibles con el SII.
    """

    def __init__(self):
        self._private_key = None
        self._certificate = None
        self._loaded = False

    def load_certificate(
        self,
        cert_path: Optional[str] = None,
        cert_password: Optional[str] = None,
    ) -> bool:
        """
        Carga el certificado digital PFX desde el filesystem.
        
        Args:
            cert_path: Ruta al archivo .pfx/.p12
            cert_password: Contraseña del certificado
            
        Returns:
            True si el certificado se cargó correctamente
        """
        path = Path(cert_path or settings.SII_CERT_PATH)
        password = (cert_password or settings.SII_CERT_PASSWORD).encode()

        if not path.exists():
            logger.warning(f"⚠️  Certificado no encontrado en: {path}")
            logger.warning("   El sistema operará en modo sin firma (solo certificación)")
            return False

        try:
            with open(path, "rb") as f:
                pfx_data = f.read()

            private_key, certificate, additional_certs = pkcs12.load_key_and_certificates(
                pfx_data, password
            )

            self._private_key = private_key
            self._certificate = certificate
            self._loaded = True

            logger.info(f"✅ Certificado cargado: {certificate.subject.rfc4514_string()}")
            logger.info(f"   Válido hasta: {certificate.not_valid_after_utc}")
            return True

        except Exception as e:
            logger.error(f"❌ Error cargando certificado: {e}")
            return False

    @property
    def is_loaded(self) -> bool:
        """Indica si hay un certificado cargado y válido."""
        return self._loaded

    def sign_xml(self, xml_element: etree._Element) -> etree._Element:
        """
        Firma un elemento XML DTE usando el certificado de la empresa.
        
        El SII requiere:
        - Algoritmo de firma: SHA1withRSA (RSA-SHA1)
        - Método de canonicalización: http://www.w3.org/TR/2001/REC-xml-c14n-20010315
        - Algoritmo de digest: SHA1
        
        Args:
            xml_element: Elemento XML lxml a firmar
            
        Returns:
            Elemento XML firmado
            
        Raises:
            RuntimeError: Si no hay certificado cargado
        """
        if not self._loaded:
            raise RuntimeError(
                "No hay certificado cargado. Carga el certificado antes de firmar."
            )

        try:
            signer = XMLSigner(
                method=methods.enveloped,
                signature_algorithm="rsa-sha1",
                digest_algorithm="sha1",
                c14n_algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
            )

            signed_root = signer.sign(
                xml_element,
                key=self._private_key,
                cert=self._certificate,
            )

            logger.debug("✅ XML firmado correctamente")
            return signed_root

        except Exception as e:
            logger.error(f"❌ Error firmando XML: {e}")
            raise

    def verify_xml_signature(self, signed_xml: etree._Element) -> bool:
        """
        Verifica la firma de un XML DTE.
        
        Args:
            signed_xml: Elemento XML con firma para verificar
            
        Returns:
            True si la firma es válida
        """
        try:
            verifier = XMLVerifier()
            verifier.verify(signed_xml, x509_cert=self._certificate)
            return True
        except Exception as e:
            logger.warning(f"⚠️  Verificación de firma fallida: {e}")
            return False

    def get_certificate_pem(self) -> Optional[str]:
        """Retorna el certificado en formato PEM para inclusión en XML."""
        if not self._certificate:
            return None
        return self._certificate.public_bytes(serialization.Encoding.PEM).decode()


# Singleton — el certificado se carga una vez al arrancar
certificate_service = SIICertificateService()
