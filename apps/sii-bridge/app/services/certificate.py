"""
CUENTAX — Certificate Service (SII Bridge)
===========================================
Carga y gestiona certificados digitales PFX/P12 del SII.
Implementa la firma XML con SHA1+RSA según el estándar SII Chile.

Soporta múltiples empresas compartiendo el mismo certificado digital.
En Chile, un certificado pertenece a una PERSONA (titular), quien puede
firmar DTEs para múltiples empresas como representante legal.

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

from app.utils.rut import clean_rut

logger = logging.getLogger(__name__)

XMLDSIG_NS = "http://www.w3.org/2000/09/xmldsig#"
C14N_METHOD = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"


def _normalize_rut(rut: str) -> str:
    """Normalize a RUT for comparison: remove dots, dashes, uppercase."""
    return clean_rut(rut)


def _extract_rut_from_cert(cert: x509.Certificate) -> Optional[str]:
    """
    Extract the titular RUT from the X.509 certificate subject.

    Chilean digital certificates typically include:
    - serialNumber OID with the RUT (e.g., "16122939-3")
    - CN with the person's name

    Returns the normalized RUT or None if not found.
    """
    # Try serialNumber OID first (standard for Chilean certs)
    try:
        serial_attrs = cert.subject.get_attributes_for_oid(
            x509.oid.NameOID.SERIAL_NUMBER
        )
        if serial_attrs:
            raw_rut = serial_attrs[0].value.strip()
            normalized = _normalize_rut(raw_rut)
            if len(normalized) >= 2:
                logger.debug(f"RUT titular extracted from serialNumber: {raw_rut}")
                return normalized
    except Exception as e:
        logger.debug(f"Could not extract serialNumber from cert: {e}")

    # Fallback: try to extract from CN (some certs embed RUT in CN)
    try:
        cn_attrs = cert.subject.get_attributes_for_oid(
            x509.oid.NameOID.COMMON_NAME
        )
        if cn_attrs:
            cn_value = cn_attrs[0].value
            # Look for RUT pattern in CN (e.g., "NOMBRE APELLIDO / 16122939-3")
            import re
            rut_match = re.search(r'(\d{7,8}-[\dkK])', cn_value)
            if rut_match:
                normalized = _normalize_rut(rut_match.group(1))
                logger.debug(f"RUT titular extracted from CN: {rut_match.group(1)}")
                return normalized
    except Exception as e:
        logger.debug(f"Could not extract RUT from CN: {e}")

    return None


class CertificateService:
    def __init__(self):
        # Certificate storage by titular RUT (the person who owns the cert)
        # Key: rut_titular (normalized)
        # Value: {"private_key": ..., "certificate": ..., "nombre": ..., "vence": ..., "rut_titular": ...}
        self._certs: dict[str, dict] = {}

        # Company-to-certificate mapping
        # Key: rut_empresa (normalized), Value: rut_titular (normalized)
        # Multiple empresas can map to the same titular
        self._empresa_to_titular: dict[str, str] = {}

    @property
    def is_loaded(self) -> bool:
        """True if any certificate is loaded. Backward compatible."""
        return len(self._certs) > 0

    def is_loaded_for(self, rut_empresa: str) -> bool:
        """True if a certificate is available for the given empresa."""
        normalized = _normalize_rut(rut_empresa)
        return normalized in self._empresa_to_titular

    def load_pfx(self, pfx_bytes: bytes, password: str, rut_empresa: str) -> dict:
        """
        Load a PFX/P12 certificate and associate it with an empresa.

        If the same titular cert is already loaded, just adds the empresa mapping.
        If a different cert is loaded, stores it alongside the existing ones.
        """
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

        # Extract titular RUT from cert subject
        rut_titular = _extract_rut_from_cert(certificate)
        if not rut_titular:
            logger.warning(
                "Could not extract RUT titular from certificate subject. "
                "Using empresa RUT as titular fallback."
            )
            rut_titular = _normalize_rut(rut_empresa)

        nombre_titular = self._get_cn(certificate)
        not_after = (
            certificate.not_valid_after_utc
            if hasattr(certificate, 'not_valid_after_utc')
            else certificate.not_valid_after.replace(tzinfo=timezone.utc)
        )
        days_remaining = (not_after - datetime.now(timezone.utc)).days

        # Store cert under titular RUT (or update if already present)
        if rut_titular not in self._certs:
            self._certs[rut_titular] = {
                "private_key": private_key,
                "certificate": certificate,
                "nombre": nombre_titular,
                "vence": not_after,
                "rut_titular": rut_titular,
            }
            logger.info(
                f"Cert loaded — Titular: {rut_titular} ({nombre_titular}), "
                f"Expires: {not_after.date()}, Days: {days_remaining}"
            )
        else:
            logger.info(
                f"Cert for titular {rut_titular} already loaded. "
                f"Adding empresa mapping only."
            )

        # Map empresa to titular
        normalized_empresa = _normalize_rut(rut_empresa)
        self._empresa_to_titular[normalized_empresa] = rut_titular
        logger.info(
            f"Empresa {rut_empresa} ({normalized_empresa}) → "
            f"Titular {rut_titular} ({nombre_titular})"
        )

        if days_remaining < 30:
            logger.warning(f"Certificate expires in {days_remaining} days!")

        # Collect all empresas associated with this titular
        associated_empresas = [
            emp for emp, tit in self._empresa_to_titular.items()
            if tit == rut_titular
        ]

        return {
            "success": True,
            "rut_empresa": rut_empresa,
            "rut_titular": rut_titular,
            "nombre_titular": nombre_titular,
            "vence": not_after.isoformat(),
            "dias_para_vencer": days_remaining,
            "empresas_asociadas": associated_empresas,
            "mensaje": (
                f"Certificado cargado para {nombre_titular} ({rut_titular}). "
                f"Vence en {days_remaining} días. "
                f"Empresas asociadas: {len(associated_empresas)}."
            ),
        }

    def associate_company(self, rut_empresa: str) -> dict:
        """
        Associate an empresa with the existing loaded certificate.

        Works only if exactly one certificate is loaded.
        If multiple certs are loaded, the caller must use load_pfx
        to specify which cert to associate.
        """
        if not self.is_loaded:
            raise RuntimeError("No hay certificado cargado")

        if len(self._certs) > 1:
            raise RuntimeError(
                "Múltiples certificados cargados. Usa load_pfx para asociar "
                "la empresa al certificado correcto."
            )

        rut_titular = next(iter(self._certs))
        cert_data = self._certs[rut_titular]
        normalized_empresa = _normalize_rut(rut_empresa)

        self._empresa_to_titular[normalized_empresa] = rut_titular
        logger.info(
            f"Empresa {rut_empresa} ({normalized_empresa}) associated with "
            f"titular {rut_titular} ({cert_data['nombre']})"
        )

        associated_empresas = [
            emp for emp, tit in self._empresa_to_titular.items()
            if tit == rut_titular
        ]

        return {
            "success": True,
            "rut_empresa": rut_empresa,
            "rut_titular": rut_titular,
            "nombre_titular": cert_data["nombre"],
            "empresas_asociadas": associated_empresas,
            "mensaje": (
                f"Empresa {rut_empresa} asociada al certificado de "
                f"{cert_data['nombre']} ({rut_titular})."
            ),
        }

    def sign_xml(
        self, element: etree._Element, rut_emisor: Optional[str] = None
    ) -> etree._Element:
        """
        Sign XML with RSA-SHA1 per SII Chile standard.

        Args:
            element: XML element to sign
            rut_emisor: RUT of the issuing company. Used to look up
                which titular certificate to use. If not provided,
                falls back to the first (or only) loaded cert.
        """
        private_key, certificate = self._resolve_cert(rut_emisor)

        element_id = element.get("ID") or element.get("id") or ""
        reference_uri = f"#{element_id}" if element_id else ""

        # C14N of the element
        c14n_bytes = etree.tostring(element, method="c14n", exclusive=False, with_comments=False)

        # SHA1 digest
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

        # RSA-SHA1 signature
        sig_bytes = private_key.sign(signed_info_c14n, padding.PKCS1v15(), hashes.SHA1())
        sig_b64 = base64.b64encode(sig_bytes).decode()

        # Public cert in base64
        cert_b64 = base64.b64encode(certificate.public_bytes(serialization.Encoding.DER)).decode()

        # Signature node
        signature_xml = f"""<Signature xmlns="{XMLDSIG_NS}">
            {signed_info_xml}
            <SignatureValue>{sig_b64}</SignatureValue>
            <KeyInfo><X509Data><X509Certificate>{cert_b64}</X509Certificate></X509Data></KeyInfo>
        </Signature>"""

        element.append(etree.fromstring(signature_xml.encode()))

        rut_label = rut_emisor or "default"
        logger.debug(f"XML signed. Ref: {reference_uri}, Emisor: {rut_label}")
        return element

    def get_status(self, rut_empresa: Optional[str] = None) -> dict:
        """
        Get certificate status.

        Args:
            rut_empresa: If provided, return status for that specific empresa.
                If not, return general status with all empresas listed.
        """
        if not self.is_loaded:
            return {"cargado": False}

        if rut_empresa:
            normalized = _normalize_rut(rut_empresa)
            rut_titular = self._empresa_to_titular.get(normalized)
            if not rut_titular or rut_titular not in self._certs:
                return {
                    "cargado": False,
                    "rut_empresa": rut_empresa,
                    "mensaje": f"No hay certificado asociado a la empresa {rut_empresa}",
                }
            cert_data = self._certs[rut_titular]
            days = (cert_data["vence"] - datetime.now(timezone.utc)).days
            associated = [
                emp for emp, tit in self._empresa_to_titular.items()
                if tit == rut_titular
            ]
            return {
                "cargado": True,
                "rut_empresa": rut_empresa,
                "rut_titular": rut_titular,
                "nombre_titular": cert_data["nombre"],
                "vence": cert_data["vence"].isoformat(),
                "dias_para_vencer": days,
                "empresas_asociadas": associated,
            }

        # General status: list all certs and their empresas
        certs_status = []
        for rut_titular, cert_data in self._certs.items():
            days = (cert_data["vence"] - datetime.now(timezone.utc)).days
            associated = [
                emp for emp, tit in self._empresa_to_titular.items()
                if tit == rut_titular
            ]
            certs_status.append({
                "rut_titular": rut_titular,
                "nombre_titular": cert_data["nombre"],
                "vence": cert_data["vence"].isoformat(),
                "dias_para_vencer": days,
                "empresas_asociadas": associated,
            })

        return {
            "cargado": True,
            "total_certificados": len(self._certs),
            "total_empresas": len(self._empresa_to_titular),
            "certificados": certs_status,
        }

    def get_available_certs(self) -> list[dict]:
        """List all loaded certificates with their associated empresas."""
        result = []
        for rut_titular, cert_data in self._certs.items():
            days = (cert_data["vence"] - datetime.now(timezone.utc)).days
            associated = [
                emp for emp, tit in self._empresa_to_titular.items()
                if tit == rut_titular
            ]
            result.append({
                "rut_titular": rut_titular,
                "nombre_titular": cert_data["nombre"],
                "vence": cert_data["vence"].isoformat(),
                "dias_para_vencer": days,
                "empresas_asociadas": associated,
            })
        return result

    def _resolve_cert(self, rut_emisor: Optional[str] = None) -> tuple:
        """
        Resolve which certificate to use for signing.

        Returns (private_key, certificate) tuple.

        Resolution order:
        1. If rut_emisor provided, look up via _empresa_to_titular mapping
        2. If not provided and only one cert loaded, use that one
        3. If not provided and multiple certs loaded, raise error
        """
        if not self.is_loaded:
            raise RuntimeError("Sin certificado cargado")

        if rut_emisor:
            normalized = _normalize_rut(rut_emisor)
            rut_titular = self._empresa_to_titular.get(normalized)
            if not rut_titular:
                raise RuntimeError(
                    f"No hay certificado asociado a la empresa {rut_emisor}. "
                    f"Carga un certificado o asocia la empresa con /certificate/associate."
                )
            cert_data = self._certs.get(rut_titular)
            if not cert_data:
                raise RuntimeError(
                    f"Certificado del titular {rut_titular} no encontrado en memoria."
                )
            return cert_data["private_key"], cert_data["certificate"]

        # No rut_emisor: fallback
        if len(self._certs) == 1:
            cert_data = next(iter(self._certs.values()))
            return cert_data["private_key"], cert_data["certificate"]

        raise RuntimeError(
            "Múltiples certificados cargados. Debes indicar rut_emisor "
            "para seleccionar el certificado correcto."
        )

    @staticmethod
    def _get_cn(cert: x509.Certificate) -> str:
        try:
            return cert.subject.get_attributes_for_oid(x509.oid.NameOID.COMMON_NAME)[0].value
        except Exception:
            return "Desconocido"


certificate_service = CertificateService()
