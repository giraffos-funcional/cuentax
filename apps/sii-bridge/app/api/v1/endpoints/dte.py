"""
Endpoint de emisión de DTE (Documento Tributario Electrónico).
Implementación base — se expande en Sprint 2.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Literal
from app.services.certificate import certificate_service
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


class DTERequest(BaseModel):
    tipo_dte: Literal[33, 39, 41, 56, 61, 110, 111, 112, 113]
    """
    Tipos de DTE soportados:
    33  → Factura Electrónica
    39  → Boleta Electrónica
    41  → Boleta Electrónica No Afecta
    56  → Nota de Débito Electrónica
    61  → Nota de Crédito Electrónica
    110 → Factura de Exportación Electrónica
    111 → Liquidación Factura Exportación
    112 → Nota Débito Exportación
    113 → Nota Crédito Exportación
    """
    rut_emisor: str
    rut_receptor: str
    razon_social_receptor: str
    giro_receptor: str
    direccion_receptor: str
    items: list[dict]
    referencia_dte: int | None = None  # Para NC/ND que referencian otro DTE


class DTEResponse(BaseModel):
    success: bool
    folio: int | None = None
    track_id: str | None = None
    estado: str
    mensaje: str
    xml_firmado: str | None = None  # Base64 del XML firmado


@router.post("/emitir", response_model=DTEResponse)
async def emitir_dte(request: DTERequest):
    """
    Emite un Documento Tributario Electrónico.
    
    Flujo completo:
    1. Validar RUT emisor y receptor
    2. Obtener folio disponible (CAF)
    3. Generar XML según esquema SII
    4. Firmar XML con certificado empresa
    5. Enviar al SII via SOAP
    6. Retornar Track ID y estado
    
    ⚠️  Requiere certificado digital cargado para firma real.
    En modo sin certificado, retorna error descriptivo.
    """
    if not certificate_service.is_loaded:
        logger.warning(
            f"Intento de emisión DTE tipo {request.tipo_dte} sin certificado cargado"
        )
        raise HTTPException(
            status_code=503,
            detail={
                "error": "sin_certificado",
                "mensaje": (
                    "No hay certificado digital cargado. "
                    "Configura el certificado en Configuración → Certificado SII."
                ),
                "ambiente": settings.SII_AMBIENTE,
            },
        )

    # TODO Sprint 2: Implementar emisión completa
    # Por ahora retorna estructura base para testing inicial
    logger.info(
        f"📄 Solicitud DTE tipo {request.tipo_dte} para RUT {request.rut_receptor}"
    )
    
    raise HTTPException(
        status_code=501,
        detail={
            "error": "no_implementado",
            "mensaje": "La emisión DTE se implementa en Sprint 2. Estructura base lista.",
            "sprint": "Sprint 2 — Emisión DTE + CAF",
        },
    )
