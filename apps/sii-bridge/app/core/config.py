"""
Configuración centralizada del SII Bridge.
Usa pydantic-settings para validar y tipar todas las variables de entorno.
"""

from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Literal


class Settings(BaseSettings):
    # App
    APP_VERSION: str = "0.1.0"
    PYTHON_ENV: Literal["development", "staging", "production"] = "development"

    # SII Chile
    SII_AMBIENTE: Literal["certificacion", "produccion"] = "certificacion"
    SII_RUT_EMPRESA: str = ""
    SII_RUT_CERT: str = "90000000-6"  # RUT certificador del SII

    # URLs SII por ambiente
    SII_URL_CERT: str = "https://maullin.sii.cl"
    SII_URL_PROD: str = "https://palena.sii.cl"
    SII_WSDL_CERT: str = "https://maullin.sii.cl/DTEWS/"
    SII_WSDL_PROD: str = "https://palena.sii.cl/DTEWS/"

    # Resolución SII (producción)
    SII_RESOLUCION_FECHA: str = ""  # e.g. "2024-01-15"
    SII_RESOLUCION_NUMERO: int = 0  # e.g. 80

    # Resolución SII (certificación — assigned by SII when company postulates)
    SII_CERT_RESOLUCION_FECHA: str = "2026-03-28"  # Zyncro SPA — per SII registration

    # Certificado Digital
    SII_CERT_PATH: str = ""
    SII_CERT_PASSWORD: str = ""

    # Odoo 18
    ODOO_URL: str = "http://odoo:8069"
    ODOO_DB: str = "giraffos_sii"
    ODOO_USERNAME: str = "admin"
    ODOO_PASSWORD: str = "admin"

    # Redis
    REDIS_URL: str = "redis://redis:6379"

    # BFF (para CORS en producción)
    BFF_URL: str = "http://bff:4000"

    # Server
    PORT: int = 8001

    # SII Proxy (optional — proxy in Chile for SII SOAP calls)
    # e.g. "http://s1.cl.giraffos.com:3128"
    SII_PROXY_URL: str = ""

    @property
    def SII_BASE_URL(self) -> str:
        """URL base del SII según el ambiente configurado."""
        return self.SII_URL_PROD if self.SII_AMBIENTE == "produccion" else self.SII_URL_CERT
    
    @property
    def SII_WSDL_URL(self) -> str:
        """URL del WSDL del SII según el ambiente configurado."""
        return self.SII_WSDL_PROD if self.SII_AMBIENTE == "produccion" else self.SII_WSDL_CERT

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
