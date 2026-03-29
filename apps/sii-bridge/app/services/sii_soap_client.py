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
        "upload": "https://maullin.sii.cl/DTEWS/services/MipagoDte?WSDL",
        "status": "https://maullin.sii.cl/DTEWS/QueryEstDteAv.jws?WSDL",
        "boleta": "https://maullin.sii.cl/DTEWS/services/WSBoleta?WSDL",
    },
    "produccion": {
        "auth":   "https://palena.sii.cl/DTEWS/CrSeed.jws?WSDL",
        "token":  "https://palena.sii.cl/DTEWS/GetTokenFromSeed.jws?WSDL",
        "upload": "https://palena.sii.cl/DTEWS/services/MipagoDte?WSDL",
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

    def __init__(self):
        self._token: Optional[str] = None
        self._token_generated_at: Optional[datetime] = None
        self._ambiente = settings.SII_AMBIENTE
        self._wsdls = SII_WSDLS[self._ambiente]
        self._proxy_url = settings.SII_PROXY_URL or None
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

    def _is_token_valid(self) -> bool:
        """Verifica si el token SII sigue vigente (válido 2 horas)."""
        if not self._token or not self._token_generated_at:
            return False
        elapsed = (datetime.now(timezone.utc) - self._token_generated_at).total_seconds()
        return elapsed < 6900  # 115 minutos (margen de 5 min antes de expirar)

    def get_token(self, force_refresh: bool = False) -> Optional[str]:
        """
        Obtiene un token de sesión válido del SII.
        Reutiliza el token vigente o genera uno nuevo si expiró.
        
        Requiere certificado digital cargado.
        
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
            signed_seed_xml = self._sign_seed(seed)

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
        La semilla tiene vigencia de pocos minutos.
        """
        try:
            client = zeep.Client(self._wsdls["auth"], transport=self._transport)
            response = client.service.getSeed()

            # Parsear la respuesta XML
            root = etree.fromstring(response.encode() if isinstance(response, str) else response)
            seed_element = root.find(".//{http://DefaultNamespace}SEMILLA") or \
                           root.find(".//SEMILLA") or \
                           root.find(".//semilla")

            if seed_element is None or not seed_element.text:
                logger.error(f"No se encontró semilla en respuesta SII: {response}")
                return None

            seed = seed_element.text.strip()
            logger.debug(f"Semilla SII obtenida: {seed[:10]}...")
            return seed

        except Exception as e:
            logger.error(f"Error obteniendo semilla SII: {e}")
            return None

    def _sign_seed(self, seed: str) -> str:
        """
        Paso 2: Construye y firma el XML de la semilla.
        El SII requiere un XML específico con la semilla y firma digital.
        """
        # Construir XML de semilla según formato SII
        seed_xml = etree.fromstring(f"""
        <getToken>
            <item>
                <Semilla>{seed}</Semilla>
            </item>
        </getToken>
        """.strip())

        # Firmar con certificado de la empresa
        signed_xml = certificate_service.sign_xml(seed_xml)

        # Serializar a string
        return etree.tostring(signed_xml, encoding="unicode", xml_declaration=False)

    def _exchange_seed_for_token(self, signed_seed_xml: str) -> Optional[str]:
        """
        Paso 3: Envía la semilla firmada al SII y recibe el token de sesión.
        """
        try:
            client = zeep.Client(self._wsdls["token"], transport=self._transport)
            response = client.service.getToken(signed_seed_xml)

            # Parsear respuesta
            root = etree.fromstring(response.encode() if isinstance(response, str) else response)

            token_element = root.find(".//{http://DefaultNamespace}TOKEN") or \
                            root.find(".//TOKEN") or \
                            root.find(".//token")

            estado_element = root.find(".//ESTADO") or root.find(".//estado")

            if estado_element is not None and estado_element.text.strip() != "00":
                glosa = root.find(".//GLOSA") or root.find(".//glosa")
                logger.error(f"SII rechazó semilla. Estado: {estado_element.text}, Glosa: {glosa.text if glosa is not None else 'N/A'}")
                return None

            if token_element is None or not token_element.text:
                logger.error(f"No se encontró TOKEN en respuesta SII: {response}")
                return None

            return token_element.text.strip()

        except Exception as e:
            logger.error(f"Error intercambiando semilla por token SII: {e}")
            return None

    def check_connectivity(self) -> dict:
        """
        Verifica conectividad con el SII.
        Útil para el health check y la pantalla de Configuración.
        Intenta obtener una semilla real como prueba de conectividad.
        """
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
                return result
        except Exception as e:
            logger.debug(f"Seed test failed: {e}")
            result["seed_error"] = str(e)

        try:
            # Fallback: check if WSDL endpoint responds at all
            proxies = {"http": self._proxy_url, "https": self._proxy_url} if self._proxy_url else None
            response = requests.get(
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

        return result


# Singleton
sii_soap_client = SIISoapClient()
