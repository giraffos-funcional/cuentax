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


def _wrap_b64(b64_str: str, width: int = 76) -> str:
    """Wrap a base64 string into lines of `width` characters.
    SII enforces a max XML line length of ~4090 chars; wrapping base64
    values at 76 chars (the RFC 2045 standard) keeps lines short."""
    return "\n".join(b64_str[i:i + width] for i in range(0, len(b64_str), width))


def _normalize_rut(rut: str) -> str:
    """Normalize a RUT for comparison: remove dots, dashes, uppercase."""
    return clean_rut(rut)


def _extract_rut_from_cert(cert: x509.Certificate) -> Optional[str]:
    """
    Extract the titular RUT from the X.509 certificate.

    Chilean digital certificates store the RUT in various locations:
    1. serialNumber OID in subject (e.g., "16122939-3")
    2. SubjectAlternativeName extension with OID 1.3.6.1.4.1.8321.1
       (Chilean CA standard for e-CertChile, CertificaFirma, etc.)
    3. CN with RUT pattern

    Returns the normalized RUT or None if not found.
    """
    import re

    # Try serialNumber OID first (standard for some Chilean CAs)
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

    # Try SubjectAlternativeName (SAN) — Chilean CAs store RUT here
    # OID 1.3.6.1.4.1.8321.1 = RUT del titular (e-CertChile standard)
    try:
        san_ext = cert.extensions.get_extension_for_oid(
            x509.oid.ExtensionOID.SUBJECT_ALTERNATIVE_NAME
        )
        for name in san_ext.value:
            if isinstance(name, x509.OtherName):
                # OID 1.3.6.1.4.1.8321.1 = titular RUT
                if name.type_id.dotted_string == "1.3.6.1.4.1.8321.1":
                    raw_value = name.value
                    # Value is ASN.1 encoded — extract the RUT string
                    rut_match = re.search(rb'(\d{7,8}-[\dkK])', raw_value)
                    if rut_match:
                        rut_str = rut_match.group(1).decode("ascii")
                        normalized = _normalize_rut(rut_str)
                        logger.debug(f"RUT titular extracted from SAN: {rut_str}")
                        return normalized
    except x509.ExtensionNotFound:
        logger.debug("No SAN extension in cert")
    except Exception as e:
        logger.debug(f"Could not extract RUT from SAN: {e}")

    # Fallback: try to extract from CN (some certs embed RUT in CN)
    try:
        cn_attrs = cert.subject.get_attributes_for_oid(
            x509.oid.NameOID.COMMON_NAME
        )
        if cn_attrs:
            cn_value = cn_attrs[0].value
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

        # Persist to Odoo (pass raw PFX bytes for storage)
        # Skip during restore to avoid recursive save
        if not getattr(self, '_restoring', False):
            self.save_to_odoo(
                pfx_bytes, password, rut_titular,
                nombre_titular, not_after, rut_empresa,
            )

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
        self,
        element: etree._Element,
        rut_emisor: Optional[str] = None,
        target_id: Optional[str] = None,
    ) -> etree._Element:
        """
        Sign XML with RSA-SHA1 per SII Chile standard (XMLDSig enveloped).

        Approach: build SignedInfo as a standalone XML string, parse and
        C14N it, sign those bytes, then embed the CANONICAL SignedInfo
        directly into the Signature XML. This ensures C14N idempotency:
        when the SII verifier extracts SignedInfo from the tree and
        canonicalizes it, it gets the exact same bytes that were signed.

        Args:
            element: Parent element where Signature will be appended.
            rut_emisor: RUT of the issuing company.
            target_id: ID of the element to digest. If provided, the child
                element with this ID is digested and the Reference URI
                points to it. If not provided, the element itself is
                digested using its own ID attribute.
        """
        private_key, certificate = self._resolve_cert(rut_emisor)

        # Determine Reference URI and find target element for digest
        if target_id:
            ref_uri = f"#{target_id}"
            target = None
            for el in element.iter():
                if el.get("ID") == target_id:
                    target = el
                    break
            if target is None:
                raise ValueError(f"Element with ID '{target_id}' not found")
        else:
            element_id = element.get("ID", "")
            ref_uri = f"#{element_id}" if element_id else ""
            target = element

        # Step 1: Compute digest of target element (standalone C14N).
        # Must be done BEFORE appending Signature (enveloped-signature
        # transform = digest without Signature present).
        target_xml = etree.tostring(target)
        target_reparsed = etree.fromstring(target_xml)
        target_c14n = etree.tostring(target_reparsed, method="c14n")
        digest_b64 = base64.b64encode(
            hashlib.sha1(target_c14n).digest()
        ).decode()

        # Step 2: Build SignedInfo as standalone XML, parse and C14N.
        # Building as a string ensures no ancestor namespace pollution.
        signed_info_xml = (
            f'<SignedInfo xmlns="{XMLDSIG_NS}">'
            f'<CanonicalizationMethod Algorithm="{C14N_METHOD}"/>'
            f'<SignatureMethod Algorithm="{XMLDSIG_NS}rsa-sha1"/>'
            f'<Reference URI="{ref_uri}">'
            f'<Transforms>'
            f'<Transform Algorithm="{XMLDSIG_NS}enveloped-signature"/>'
            f'</Transforms>'
            f'<DigestMethod Algorithm="{XMLDSIG_NS}sha1"/>'
            f'<DigestValue>{digest_b64}</DigestValue>'
            f'</Reference>'
            f'</SignedInfo>'
        )
        signed_info_el = etree.fromstring(signed_info_xml.encode())
        signed_info_c14n = etree.tostring(signed_info_el, method="c14n")

        # Step 3: Sign canonical SignedInfo with RSA-SHA1
        sig_bytes = private_key.sign(
            signed_info_c14n, padding.PKCS1v15(), hashes.SHA1()
        )
        sig_value_b64 = _wrap_b64(base64.b64encode(sig_bytes).decode())

        # Step 4: Build complete Signature XML string.
        # CRITICAL: embed the CANONICAL SignedInfo (same bytes that were
        # signed) so that C14N of the in-tree SignedInfo is idempotent
        # and produces the exact bytes the verifier expects.
        cert_der = certificate.public_bytes(serialization.Encoding.DER)
        cert_b64 = _wrap_b64(base64.b64encode(cert_der).decode())

        pub_key = certificate.public_key()
        pub_numbers = pub_key.public_numbers()
        mod_bytes = pub_numbers.n.to_bytes(
            (pub_numbers.n.bit_length() + 7) // 8, "big"
        )
        mod_b64 = _wrap_b64(base64.b64encode(mod_bytes).decode())
        exp_b64 = base64.b64encode(
            pub_numbers.e.to_bytes(
                (pub_numbers.e.bit_length() + 7) // 8, "big"
            )
        ).decode()

        # Use the canonical SignedInfo bytes (same that were signed)
        signed_info_str = signed_info_c14n.decode()

        sig_xml = (
            f'<Signature xmlns="{XMLDSIG_NS}">'
            f'{signed_info_str}'
            f'<SignatureValue>\n{sig_value_b64}\n</SignatureValue>'
            f'<KeyInfo>'
            f'<KeyValue>'
            f'<RSAKeyValue>'
            f'<Modulus>\n{mod_b64}\n</Modulus>'
            f'<Exponent>{exp_b64}</Exponent>'
            f'</RSAKeyValue>'
            f'</KeyValue>'
            f'<X509Data>'
            f'<X509Certificate>\n{cert_b64}\n</X509Certificate>'
            f'</X509Data>'
            f'</KeyInfo>'
            f'</Signature>'
        )
        element.append(etree.fromstring(sig_xml.encode()))

        rut_label = rut_emisor or "default"
        logger.debug(
            f"XML signed (RSA-SHA1). Emisor: {rut_label}, URI: {ref_uri}, "
            f"digest_c14n={len(target_c14n)}B, si_c14n={len(signed_info_c14n)}B"
        )
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

        # No rut_emisor: fallback to first (or only) cert.
        # This is safe for seed signing (SII token is per-person, any cert works).
        # For DTE signing, rut_emisor should always be provided.
        cert_data = next(iter(self._certs.values()))
        if len(self._certs) > 1:
            logger.warning(
                f"Multiple certs loaded but no rut_emisor specified. "
                f"Using first cert: {cert_data['rut_titular']} ({cert_data['nombre']})"
            )
        return cert_data["private_key"], cert_data["certificate"]

    @staticmethod
    def _get_cn(cert: x509.Certificate) -> str:
        try:
            return cert.subject.get_attributes_for_oid(x509.oid.NameOID.COMMON_NAME)[0].value
        except Exception:
            return "Desconocido"


    # ── Odoo Persistence (ir.config_parameter) ─────────────────
    # Stores PFX (base64), password, and metadata as JSON in Odoo's
    # built-in key-value store. No custom modules required.

    def save_to_odoo(
        self, pfx_bytes: bytes, password: str, rut_titular: str,
        nombre_titular: str, vence: datetime, rut_empresa: str,
    ) -> bool:
        """Save certificate to Odoo ir.config_parameter."""
        try:
            from app.adapters.odoo_rpc import odoo_rpc
            import base64
            import json

            normalized_titular = _normalize_rut(rut_titular)
            key = f"cuentax.cert.{normalized_titular}"

            # Read existing to preserve empresa list
            existing_raw = odoo_rpc.execute(
                "ir.config_parameter", "get_param", key, "",
            )
            existing_empresas = []
            if existing_raw:
                try:
                    existing_data = json.loads(existing_raw)
                    existing_empresas = existing_data.get("empresas", [])
                except (json.JSONDecodeError, TypeError):
                    pass

            normalized_empresa = _normalize_rut(rut_empresa)
            empresas = list(set(existing_empresas + [normalized_empresa]))

            value = json.dumps({
                "rut_titular": normalized_titular,
                "nombre_titular": nombre_titular,
                "pfx_b64": base64.b64encode(pfx_bytes).decode(),
                "password": password,
                "vence": vence.isoformat(),
                "empresas": empresas,
            })

            odoo_rpc.execute(
                "ir.config_parameter", "set_param", key, value,
            )
            # Update cert index
            self._update_cert_index(odoo_rpc)
            logger.info(f"Certificate saved to Odoo: {key}")
            return True
        except Exception as e:
            logger.error(f"Failed to save certificate to Odoo: {e}")
            return False

    def _update_cert_index(self, odoo_rpc) -> None:
        """Maintain an index of all cert param keys."""
        import json
        keys = [
            f"cuentax.cert.{rut_titular}"
            for rut_titular in self._certs
        ]
        odoo_rpc.execute(
            "ir.config_parameter", "set_param",
            "cuentax.cert._index", json.dumps(keys),
        )

    def restore_from_odoo(self) -> int:
        """Load all certificates from Odoo into memory. Returns count."""
        try:
            from app.adapters.odoo_rpc import odoo_rpc
            import base64
            import json

            index_raw = odoo_rpc.execute(
                "ir.config_parameter", "get_param",
                "cuentax.cert._index", "[]",
            )
            keys = json.loads(index_raw) if index_raw else []

            count = 0
            self._restoring = True
            for key in keys:
                try:
                    raw = odoo_rpc.execute(
                        "ir.config_parameter", "get_param", key, "",
                    )
                    if not raw:
                        continue
                    data = json.loads(raw)

                    pfx_bytes = base64.b64decode(data["pfx_b64"])
                    password = data["password"]
                    empresas = data.get("empresas", [])

                    # Load PFX for first empresa
                    first_empresa = empresas[0] if empresas else data["rut_titular"]
                    self.load_pfx(pfx_bytes, password, first_empresa)

                    # Associate remaining empresas
                    rut_titular = _normalize_rut(data["rut_titular"])
                    for extra_rut in empresas[1:]:
                        self._empresa_to_titular[_normalize_rut(extra_rut)] = rut_titular

                    count += 1
                    logger.info(
                        f"Restored cert: titular={data['rut_titular']}, "
                        f"empresas={empresas}"
                    )
                except Exception as e:
                    logger.error(f"Failed to restore cert key {key}: {e}")

            self._restoring = False
            logger.info(f"Restored {count} certificates from Odoo")
            return count

        except Exception as e:
            self._restoring = False
            logger.error(f"Failed to restore certificates from Odoo: {e}")
            return 0


certificate_service = CertificateService()
