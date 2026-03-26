"""
CUENTAX — DTE Endpoints (Sprint 2 — implementación completa)
Conecta: DTEEmissionService → DTEXMLGenerator → CertificateService → SII SOAP
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Literal
from app.services.dte_emission import dte_emission_service
from app.services.sii_soap_client import sii_soap_client
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


class ItemDTE(BaseModel):
    nombre: str
    cantidad: float = 1
    precio_unitario: float
    descuento_pct: float = 0
    exento: bool = False
    codigo: Optional[str] = None
    unidad: str = "UN"


class EmitirDTERequest(BaseModel):
    tipo_dte: Literal[33, 39, 41, 56, 61, 110, 111, 112, 113]
    rut_emisor: str
    razon_social_emisor: str
    giro_emisor: str
    direccion_emisor: Optional[str] = None
    comuna_emisor: Optional[str] = None
    actividad_economica: int = 620200
    rut_receptor: str
    razon_social_receptor: str
    giro_receptor: str
    direccion_receptor: Optional[str] = None
    email_receptor: Optional[str] = None
    items: list[ItemDTE]
    forma_pago: int = 1
    fecha_emision: Optional[str] = None
    fecha_vencimiento: Optional[str] = None
    observaciones: Optional[str] = None
    ref_tipo_doc: Optional[int] = None
    ref_folio: Optional[int] = None
    ref_fecha: Optional[str] = None
    ref_motivo: Optional[str] = None


class AnularDTERequest(BaseModel):
    tipo_original: int
    folio_original: int
    fecha_original: str
    rut_emisor: str
    razon_social_emisor: str
    giro_emisor: str
    rut_receptor: str
    razon_social_receptor: str
    giro_receptor: str
    motivo: str
    items: list[ItemDTE]  # Ítems del documento anulado


@router.post("/emit")
async def emit_dte(request: EmitirDTERequest):
    """Emite un DTE completo (genera XML, firma, envía al SII)."""
    payload = request.model_dump()
    # Convertir items a dicts simples
    payload["items"] = [item.model_dump() for item in request.items]

    result = dte_emission_service.emit(payload)

    if not result.get("success"):
        status_code = {
            "sin_certificado": 503,
            "sin_folio": 422,
            "error_validacion": 400,
        }.get(result.get("estado", ""), 502)
        raise HTTPException(status_code, detail=result)

    return result


@router.get("/status/{track_id}")
async def get_dte_status(track_id: str, rut_emisor: str):
    """Consulta el estado de un DTE enviado al SII por su track_id."""
    token = sii_soap_client.get_token()
    if not token:
        raise HTTPException(503, detail={"error": "sin_token", "message": "Sin token SII activo"})

    # TODO: implementar consulta real SOAP de estado
    # Por ahora retorna estado pendiente
    return {
        "track_id": track_id,
        "rut_emisor": rut_emisor,
        "estado": "EPR",
        "glosa": "En proceso de revisión",
        "nota": "Implementación SOAP de consulta estado en progreso",
    }


@router.post("/anular")
async def anular_dte(request: AnularDTERequest):
    """
    Anula un DTE emitiendo una Nota de Crédito (tipo 61).
    La NC referencia al documento original.
    """
    # Construir payload de NC que referencia al original
    nc_payload = {
        "tipo_dte": 61,  # Nota de Crédito
        "rut_emisor": request.rut_emisor,
        "razon_social_emisor": request.razon_social_emisor,
        "giro_emisor": request.giro_emisor,
        "rut_receptor": request.rut_receptor,
        "razon_social_receptor": request.razon_social_receptor,
        "giro_receptor": request.giro_receptor,
        "items": [item.model_dump() for item in request.items],
        "ref_tipo_doc": request.tipo_original,
        "ref_folio": request.folio_original,
        "ref_fecha": request.fecha_original,
        "ref_motivo": request.motivo,
    }

    result = dte_emission_service.emit(nc_payload)

    if not result.get("success"):
        raise HTTPException(422, detail=result)

    return {**result, "tipo_generado": "Nota de Crédito", "doc_original": request.folio_original}
