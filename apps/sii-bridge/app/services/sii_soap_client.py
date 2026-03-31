"""
CUENTAX SII Bridge — Cliente SOAP para el SII Chile
====================================================
Maneja la comunicación con los Web Services del SII.

Servicios WS implementados:
- getToken: Obtiene token de sesión SII usando el certificado digital
- sendBHE: Envío de Documentos Tributarios Electrónicos (DTE)
- getStatusBoleta: Consulta de estado de documentos

Referencia: https://palena.sii.cl/DTEWS/ (prod)
            https://maullin.sii.cl/DTEWS/ (cert)
"""

import logging
import base64
import hashlib
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
import zeep
from zeep.transports import Transport
import requests
from lxml import etree

from app.core.config import settings
from app.services.certificate import certificate_service

logger = logging.getLogger(__name__)


# ── WSDLs por servicio del SII ────────────────────────────────
SII_WSDLS = {
    "certificacion": {
        "auth":   "https://maullin.sii.cl/DTEWS/CrSeed.jws?WSDL",
        "token":  "https://maullin.sii.cl/DTEWS/GetTokenFromSeed.jws?WSDL",
        "upload": "https://maullin.sii.cl/cgi_dte/UPL/DTEUpload",
        "upload_status": "https://maullin.sii.cl/DTEWS/QueryEstUp.jws?WSDL",
        "status": "https://maullin.sii.cl/DTEWS/QueryEstDteAv.jws?WSDL",
        "boleta": "https://maullin.sii.cl/DTEWS/services/WSBoleta?WSDL",
    },
    "produccion": {
        "auth":   "https://palena.sii.cl/DTEWS/CrSeed.jws?WSDL",
        "token":  "https://palena.sii.cl/DTEWS/GetTokenFromSeed.jws?WSDL",
        "upload": "https://palena.sii.cl/cgi_dte/UPL/DTEUpload",
        "upload_status": "https://palena.sii.cl/DTEWS/QueryEstUp.jws?WSDL",
        "status": "https://palena.sii.cl/DTEWS/QueryEstDteAv.jws?WSDL",
        "boleta": "https://palena.sii.cl/DTEWS/services/WSBoleta?WSDL",
    },
}


class SIISoapClient:
    """
    Cliente SOAP para comunicación con el SII Chile.
    
    Flujo de autenticación SII:
    1. getSeed()      → Obtiene semilla temporal del SII
    2. signSeed()     → Firma la semilla con el certificado digital
    3. getToken()     → Envía semilla firmada, recibe token de sesión (2 horas de validez)
    4. Usar token en llamadas posteriores
    """

    # Retry configuration
    MAX_RETRIES = 3
    BACKOFF_DELAYS = [1, 3]  # seconds between retries (attempts 1→2, 2→3)
    CONNECTIVITY_CACHE_TTL = 60  # seconds

    def __init__(self):
        self._token: Optional[str] = None
        self._token_generated_at: Optional[datetime] = None
        self._ambiente = settings.SII_AMBIENTE
        self._wsdls = SII_WSDLS[self._ambiente]
        self._proxy_url = settings.SII_PROXY_URL or None
        self._connectivity_cache: Optional[dict] = None
        self._connectivity_cache_at: Optional[float] = None
        self._transport = Transport(
            timeout=30,
            operation_timeout=60,
            session=self._make_requests_session(),
        )
        if self._proxy_url:
            logger.info(f"SII SOAP proxy configured: {self._proxy_url}")

    def _make_requests_session(self) -> requests.Session:
        """Configura la sesión HTTP con headers del SII y proxy opcional."""
        session = requests.Session()
        session.headers.update({
            "User-Agent": "CUENTAX/1.0 (DTE SII Chile)",
            "Accept": "text/xml; charset=utf-8",
        })
        # Configure proxy for SII connectivity (e.g., proxy in Chile)
        if self._proxy_url:
            session.proxies = {
                "http": self._proxy_url,
                "https": self._proxy_url,
            }
            # Auth header for proxy ACL
            session.headers["X-Proxy-Token"] = "cuentax-sii-proxy-2024"
        return session

    def _request_with_retry(self, method: str, url: str, **kwargs) -> requests.Response:
        """
        HTTP request with exponential backoff and direct-connection fallback.

        Tries up to MAX_RETRIES attempts. On the last attempt, if a proxy is
        configured, retries WITHOUT the proxy as a direct-connection fallback.
        Raises the last exception if all attempts fail.
        """
        last_exception: Optional[Exception] = None

        for attempt in range(1, self.MAX_RETRIES + 1):
            is_last_attempt = attempt == self.MAX_RETRIES
            use_proxy = self._proxy_url and not is_last_attempt

            # Build proxies dict for this attempt
            if use_proxy:
                attempt_proxies = {"http": self._proxy_url, "https": self._proxy_url}
            else:
                attempt_proxies = None

            # Override proxies in kwargs for this attempt
            request_kwargs = {**kwargs, "proxies": attempt_proxies}

            try:
                if is_last_attempt and self._proxy_url:
                    logger.warning(
                        f"SII request attempt {attempt}/{self.MAX_RETRIES} — "
                        f"DIRECT connection fallback (no proxy) → {url}"
                    )
                elif attempt > 1:
                    logger.warning(
                        f"SII request attempt {attempt}/{self.MAX_RETRIES} — "
                        f"retrying → {url}"
                    )

                http_method = getattr(requests, method.lower())
                response = http_method(url, **request_kwargs)
                return response

            except Exception as exc:
                last_exception = exc
                logger.warning(
                    f"SII request attempt {attempt}/{self.MAX_RETRIES} failed: {exc}"
                )
                # Apply backoff delay before next attempt (not after the last one)
                if not is_last_attempt:
                    delay = self.BACKOFF_DELAYS[attempt - 1]
                    logger.info(f"Backing off {delay}s before next retry...")
                    time.sleep(delay)

        # All attempts exhausted — raise the last exception
        raise last_exception  # type: ignore[misc]

    def _extract_soap_return(self, soap_content: bytes, return_tag: str) -> Optional[str]:
        """Extract inner XML from a SOAP response return element.
        SII returns something like:
          <getSeedReturn xsi:type="xsd:string">&lt;?xml ...&gt;...&lt;/SII:RESPUESTA&gt;</getSeedReturn>
        We need the unescaped text content of that element.
        """
        import re
        try:
            root = etree.fromstring(soap_content)
            # Find the return element by local name
            for el in root.iter():
                local = etree.QName(el.tag).localname if isinstance(el.tag, str) else ''
                if local == return_tag and el.text:
                    logger.info(f"Found {return_tag} via etree, text length: {len(el.text)}")
                    return el.text.strip()
            
            # Fallback: use regex to find the content between tags
            content_str = soap_content.decode('utf-8', errors='replace')
            pattern = rf'<{return_tag}[^>]*>(.*?)</{return_tag}>'
            match = re.search(pattern, content_str, re.DOTALL)
            if match:
                import html
                raw = match.group(1)
                unescaped = html.unescape(raw)
                logger.info(f"Found {return_tag} via regex fallback, length: {len(unescaped)}")
                return unescaped.strip()
            
            # Log all tags for debugging
            tags = [etree.QName(el.tag).localname if isinstance(el.tag, str) else str(el.tag) for el in root.iter()]
            logger.error(f"'{return_tag}' not found. Available tags: {tags[:20]}")
            return None
        except Exception as e:
            logger.error(f"Error parsing SOAP return '{return_tag}': {e}")
            return None

    def _is_token_valid(self) -> bool:
        """Verifica si el token SII sigue vigente (válido 2 horas)."""
        if not self._token or not self._token_generated_at:
            return False
        elapsed = (datetime.now(timezone.utc) - self._token_generated_at).total_seconds()
        return elapsed < 6900  # 115 minutos (margen de 5 min antes de expirar)

    def get_token(self, force_refresh: bool = False, rut_emisor: Optional[str] = None) -> Optional[str]:
        """
        Obtiene un token de sesión válido del SII.
        Reutiliza el token vigente o genera uno nuevo si expiró.

        Requiere certificado digital cargado.

        Args:
            force_refresh: Force a new token even if cached one is valid
            rut_emisor: Company RUT to select certificate when multiple loaded

        Returns:
            Token de sesión SII o None si no tiene certificado
        """
        if not force_refresh and self._is_token_valid():
            logger.debug("Usando token SII en caché")
            return self._token

        if not certificate_service.is_loaded:
            logger.warning("⚠️  No hay certificado cargado — no se puede obtener token SII")
            return None

        try:
            # Paso 1: Obtener semilla
            seed = self._get_seed()
            if not seed:
                return None

            # Paso 2: Firmar la semilla con el certificado
            signed_seed_xml = self._sign_seed(seed, rut_emisor=rut_emisor)

            # Paso 3: Enviar semilla firmada y obtener token
            token = self._exchange_seed_for_token(signed_seed_xml)
            if token:
                self._token = token
                self._token_generated_at = datetime.now(timezone.utc)
                logger.info(f"✅ Token SII obtenido — Ambiente: {self._ambiente}")

            return token

        except Exception as e:
            logger.error(f"❌ Error obteniendo token SII: {e}")
            return None

    def _get_seed(self) -> Optional[str]:
        """
        Paso 1: Llama a CrSeed del SII para obtener una semilla temporal.
        Uses raw SOAP over HTTP (works reliably through proxy).
        """
        import re
        try:
            soap_body = '<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><getSeed/></soapenv:Body></soapenv:Envelope>'
            endpoint = self._wsdls["auth"].replace("?WSDL", "")
            proxies = {"http": self._proxy_url, "https": self._proxy_url} if self._proxy_url else None

            resp = self._request_with_retry(
                "post",
                endpoint,
                data=soap_body,
                headers={"Content-Type": "text/xml; charset=utf-8", "SOAPAction": '""'},
                proxies=proxies,
                timeout=30,
            )

            if resp.status_code != 200:
                logger.error(f"SII getSeed HTTP {resp.status_code}: {resp.text[:200]}")
                return None

            # Extract inner XML from SOAP response
            inner_xml = self._extract_soap_return(resp.content, "getSeedReturn")
            if not inner_xml:
                logger.error(f"No getSeedReturn in SII response: {resp.text[:300]}")
                return None

            # Extract SEMILLA value with regex (avoids SII namespace issues)
            match = re.search(r'<SEMILLA>(\d+)</SEMILLA>', inner_xml)
            if not match:
                logger.error(f"No SEMILLA in inner XML: {inner_xml[:200]}")
                return None

            seed = match.group(1)
            logger.info(f"✅ Semilla SII obtenida: {seed[:10]}...")
            return seed

        except Exception as e:
            logger.error(f"Error obteniendo semilla SII: {e}")
            return None

    def _sign_seed(self, seed: str, rut_emisor: Optional[str] = None) -> str:
        """
        Paso 2: Construye y firma el XML de la semilla manualmente.

        Uses Python's cryptography library directly (NOT signxml) to build
        the XMLDSig signature. This gives full control over the XML output
        format, which is critical because SII's Java parser is very strict
        about namespace handling and element structure.

        Ported from the working scripts/send_to_sii.py implementation.

        Args:
            seed: SII seed value
            rut_emisor: Company RUT to select certificate (needed when multiple loaded)
        """
        from cryptography.hazmat.primitives import hashes as crypto_hashes
        from cryptography.hazmat.primitives import serialization as crypto_serial
        from cryptography.hazmat.primitives.asymmetric import padding as crypto_padding

        XMLDSIG_NS = "http://www.w3.org/2000/09/xmldsig#"
        C14N_ALG = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"

        # Resolve certificate for this emisor
        private_key, certificate = certificate_service._resolve_cert(rut_emisor)

        # 1. Build seed XML
        seed_xml = etree.fromstring(
            f"<getToken><item><Semilla>{seed}</Semilla></item></getToken>".encode()
        )

        # 2. Canonicalize the seed XML and compute SHA1 digest
        c14n_bytes = etree.tostring(seed_xml, method="c14n", exclusive=False, with_comments=False)
        digest_value = base64.b64encode(hashlib.sha1(c14n_bytes).digest()).decode()

        # 3. Build SignedInfo (with xmlns on the element — required for C14N).
        #    Must include Transforms/enveloped-signature to match the final output.
        signed_info_xml = (
            f'<SignedInfo xmlns="{XMLDSIG_NS}">'
            f'<CanonicalizationMethod Algorithm="{C14N_ALG}"/>'
            f'<SignatureMethod Algorithm="{XMLDSIG_NS}rsa-sha1"/>'
            f'<Reference URI="">'
            f'<Transforms>'
            f'<Transform Algorithm="{XMLDSIG_NS}enveloped-signature"/>'
            f'</Transforms>'
            f'<DigestMethod Algorithm="{XMLDSIG_NS}sha1"/>'
            f'<DigestValue>{digest_value}</DigestValue>'
            f'</Reference>'
            f'</SignedInfo>'
        )

        # 4. Canonicalize SignedInfo and sign with RSA-SHA1
        signed_info_c14n = etree.tostring(
            etree.fromstring(signed_info_xml.encode()), method="c14n"
        )
        sig_bytes = private_key.sign(
            signed_info_c14n,
            crypto_padding.PKCS1v15(),
            crypto_hashes.SHA1(),
        )
        sig_b64 = base64.b64encode(sig_bytes).decode()

        # 5. Get base64-encoded DER certificate
        cert_b64 = base64.b64encode(
            certificate.public_bytes(crypto_serial.Encoding.DER)
        ).decode()

        # 6. Get RSA public key components for RSAKeyValue
        #    Some SII endpoints require RSAKeyValue in KeyInfo alongside X509Data.
        pub_key = certificate.public_key()
        pub_numbers = pub_key.public_numbers()
        modulus_bytes = pub_numbers.n.to_bytes((pub_numbers.n.bit_length() + 7) // 8, 'big')
        exponent_bytes = pub_numbers.e.to_bytes((pub_numbers.e.bit_length() + 7) // 8, 'big')
        modulus_b64 = base64.b64encode(modulus_bytes).decode()
        exponent_b64 = base64.b64encode(exponent_bytes).decode()

        # 7. Build ENTIRE output as raw string — NO lxml serialization.
        #    lxml can alter namespace declarations during tree manipulation,
        #    which confuses SII's rigid Java XML parser.
        #    Include both RSAKeyValue and X509Data, plus Transforms with
        #    enveloped-signature — matching the format from SII official docs.
        result = (
            f'<getToken>'
            f'<item><Semilla>{seed}</Semilla></item>'
            f'<Signature xmlns="{XMLDSIG_NS}">'
            f'<SignedInfo>'
            f'<CanonicalizationMethod Algorithm="{C14N_ALG}"/>'
            f'<SignatureMethod Algorithm="{XMLDSIG_NS}rsa-sha1"/>'
            f'<Reference URI="">'
            f'<Transforms>'
            f'<Transform Algorithm="{XMLDSIG_NS}enveloped-signature"/>'
            f'</Transforms>'
            f'<DigestMethod Algorithm="{XMLDSIG_NS}sha1"/>'
            f'<DigestValue>{digest_value}</DigestValue>'
            f'</Reference>'
            f'</SignedInfo>'
            f'<SignatureValue>{sig_b64}</SignatureValue>'
            f'<KeyInfo>'
            f'<KeyValue>'
            f'<RSAKeyValue>'
            f'<Modulus>{modulus_b64}</Modulus>'
            f'<Exponent>{exponent_b64}</Exponent>'
            f'</RSAKeyValue>'
            f'</KeyValue>'
            f'<X509Data>'
            f'<X509Certificate>{cert_b64}</X509Certificate>'
            f'</X509Data>'
            f'</KeyInfo>'
            f'</Signature>'
            f'</getToken>'
        )

        logger.info(f"Seed signed manually (pure string). Length: {len(result)}")
        return result

    def _exchange_seed_for_token(self, signed_seed_xml: str) -> Optional[str]:
        """
        Paso 3: Envía la semilla firmada al SII y recibe el token de sesión.
        Uses raw SOAP over HTTP (works reliably through proxy).
        """
        import re
        try:
            # Wrap signed seed XML in SOAP envelope
            soap_body = f"""<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <getToken>
      <pszXml><![CDATA[{signed_seed_xml}]]></pszXml>
    </getToken>
  </soapenv:Body>
</soapenv:Envelope>"""

            endpoint = self._wsdls["token"].replace("?WSDL", "")
            proxies = {"http": self._proxy_url, "https": self._proxy_url} if self._proxy_url else None

            resp = self._request_with_retry(
                "post",
                endpoint,
                data=soap_body.encode("utf-8"),
                headers={
                    "Content-Type": "text/xml; charset=utf-8",
                    "SOAPAction": '""',
                },
                proxies=proxies,
                timeout=30,
            )

            if resp.status_code != 200:
                logger.error(f"SII getToken HTTP {resp.status_code}: {resp.text[:200]}")
                return None

            # SII returns the token as escaped XML inside getTokenReturn
            inner_xml = self._extract_soap_return(resp.content, "getTokenReturn")
            if not inner_xml:
                logger.error(f"No getTokenReturn in SII response: {resp.text[:300]}")
                return None

            # Check ESTADO first
            estado_match = re.search(r'<ESTADO>(\d+)</ESTADO>', inner_xml)
            if estado_match and estado_match.group(1) != "00":
                glosa_match = re.search(r'<GLOSA>(.*?)</GLOSA>', inner_xml)
                logger.error(f"SII rechazó semilla. Estado: {estado_match.group(1)}, Glosa: {glosa_match.group(1) if glosa_match else 'N/A'}")
                return None

            # Extract TOKEN
            token_match = re.search(r'<TOKEN>([^<]+)</TOKEN>', inner_xml)
            if not token_match:
                logger.error(f"No TOKEN in inner XML: {inner_xml[:200]}")
                return None

            return token_match.group(1).strip()

        except Exception as e:
            logger.error(f"Error intercambiando semilla por token SII: {e}")
            return None

    def query_upload_status(self, rut_company: str, track_id: str, token: Optional[str] = None) -> dict:
        """
        Query the status of an upload by Track ID via SII QueryEstUp service.

        Args:
            rut_company: Company RUT (e.g. "76753753-0")
            track_id: Track ID from DTEUpload response
            token: SII session token (uses cached if not provided)

        Returns:
            {"track_id": str, "estado": str, "glosa": str, "raw_xml": str}
        """
        import re
        from app.utils.rut import format_rut

        if not token:
            token = self.get_token()
        if not token:
            return {"track_id": track_id, "estado": "ERROR", "glosa": "Sin token SII"}

        rut_fmt = format_rut(rut_company, dots=False)
        parts = rut_fmt.split("-")
        rut_num = parts[0]
        rut_dv = parts[1] if len(parts) > 1 else "0"

        soap_body = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">'
            '<soapenv:Body>'
            '<getEstUp xmlns="http://DefaultNamespace">'
            f'<RutCompany>{rut_num}</RutCompany>'
            f'<DvCompany>{rut_dv}</DvCompany>'
            f'<TrackId>{track_id}</TrackId>'
            f'<Token>{token}</Token>'
            '</getEstUp>'
            '</soapenv:Body>'
            '</soapenv:Envelope>'
        )

        endpoint = self._wsdls["upload_status"].replace("?WSDL", "")
        proxies = {"http": self._proxy_url, "https": self._proxy_url} if self._proxy_url else None

        try:
            resp = self._request_with_retry(
                "post",
                endpoint,
                data=soap_body.encode("utf-8"),
                headers={"Content-Type": "text/xml; charset=utf-8", "SOAPAction": '""'},
                proxies=proxies,
                timeout=30,
            )

            if resp.status_code != 200:
                return {
                    "track_id": track_id,
                    "estado": "HTTP_ERROR",
                    "glosa": f"HTTP {resp.status_code}: {resp.text[:200]}",
                }

            inner_xml = self._extract_soap_return(resp.content, "getEstUpReturn")
            if not inner_xml:
                # Try raw response parsing
                inner_xml = resp.text

            logger.info(f"QueryEstUp response for {track_id}: {inner_xml[:500]}")

            # Extract status fields
            estado = ""
            glosa = ""

            est_match = re.search(r'<ESTADO>([^<]+)</ESTADO>', inner_xml)
            if not est_match:
                est_match = re.search(r'<EST_MEC>([^<]+)</EST_MEC>', inner_xml)
            if est_match:
                estado = est_match.group(1).strip()

            glosa_match = re.search(r'<GLOSA_ERR>([^<]*)</GLOSA_ERR>', inner_xml)
            if glosa_match:
                glosa = glosa_match.group(1).strip()

            if not glosa:
                glosa_match = re.search(r'<GLOSA>([^<]*)</GLOSA>', inner_xml)
                if glosa_match:
                    glosa = glosa_match.group(1).strip()

            # Also extract NUM_ATENCION if present
            num_atencion = ""
            na_match = re.search(r'<NUM_ATENCION>([^<]+)</NUM_ATENCION>', inner_xml)
            if na_match:
                num_atencion = na_match.group(1).strip()

            return {
                "track_id": track_id,
                "estado": estado or "UNKNOWN",
                "glosa": glosa,
                "num_atencion": num_atencion,
                "raw_xml": inner_xml[:1000],
            }

        except Exception as e:
            logger.error(f"Error querying upload status for {track_id}: {e}")
            return {"track_id": track_id, "estado": "ERROR", "glosa": str(e)}

    def check_connectivity(self) -> dict:
        """
        Verifica conectividad con el SII.
        Útil para el health check y la pantalla de Configuración.
        Intenta obtener una semilla real como prueba de conectividad.

        Results are cached for CONNECTIVITY_CACHE_TTL seconds to avoid
        hammering SII on frequent health-check polls.
        """
        # Return cached result if still fresh
        if (
            self._connectivity_cache is not None
            and self._connectivity_cache_at is not None
            and (time.monotonic() - self._connectivity_cache_at) < self.CONNECTIVITY_CACHE_TTL
        ):
            logger.debug("Returning cached SII connectivity result")
            # Update token_vigente in cached result (cheap local check)
            self._connectivity_cache["token_vigente"] = self._is_token_valid()
            return self._connectivity_cache

        result = {
            "ambiente": self._ambiente,
            "wsdl_auth": self._wsdls["auth"],
            "conectado": False,
            "token_vigente": self._is_token_valid(),
            "error": None,
            "proxy": self._proxy_url or "none",
        }

        try:
            # Try to actually get a seed — this is the real connectivity test
            seed = self._get_seed()
            if seed:
                result["conectado"] = True
                result["semilla_ok"] = True
                self._connectivity_cache = result
                self._connectivity_cache_at = time.monotonic()
                return result
            else:
                result["seed_error"] = "seed returned None (no exception)"
        except Exception as e:
            logger.debug(f"Seed test failed: {e}")
            result["seed_error"] = str(e)

        try:
            # Fallback: check if WSDL endpoint responds at all
            proxies = {"http": self._proxy_url, "https": self._proxy_url} if self._proxy_url else None
            response = self._request_with_retry(
                "get",
                self._wsdls["auth"],
                timeout=15,
                allow_redirects=True,
                proxies=proxies,
            )
            result["conectado"] = response.status_code < 500
            result["http_status"] = response.status_code
            if not result["conectado"]:
                result["error"] = f"SII respondió con HTTP {response.status_code}"
        except Exception as e:
            result["error"] = str(e)
            logger.warning(f"SII no alcanzable: {e}")

        self._connectivity_cache = result
        self._connectivity_cache_at = time.monotonic()
        return result


# Singleton
sii_soap_client = SIISoapClient()
