"""
CUENTAX — API Pública (Sprint 5)
API REST para integraciones con sistemas de terceros.
Autenticada con API Keys (X-API-Key header).
"""
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from app.services.dte_emission import dte_emission_service

router = APIRouter()

# En producción: verificar API key contra DB/Redis
DEMO_API_KEY = "cuentax_test_key_12345"

def require_api_key(x_api_key: str = Header(..., alias="X-API-Key")):
    if x_api_key != DEMO_API_KEY:
        raise HTTPException(401, detail={"error": "invalid_api_key", "message": "API Key inválida"})
    return x_api_key

class DTERequest(BaseModel):
    tipo_dte: int
    rut_emisor: str
    razon_social_emisor: str
    giro_emisor: str
    rut_receptor: str
    razon_social_receptor: str
    giro_receptor: str
    items: list[dict]
    forma_pago: int = 1
    observaciones: Optional[str] = None

@router.post("/dte/emitir")
async def public_emit_dte(request: DTERequest, x_api_key: str = Header(..., alias="X-API-Key")):
    """
    **API Pública** — Emite un DTE desde sistemas externos.
    
    Requiere header: `X-API-Key: <tu_api_key>`
    
    Retorna el folio asignado, track_id del SII, y el XML firmado en base64.
    """
    require_api_key(x_api_key)
    result = dte_emission_service.emit(request.model_dump())
    if not result["success"]:
        raise HTTPException(422, detail=result)
    return result

@router.get("/dte/{folio}/status")
async def get_dte_status(folio: int, rut_empresa: str, x_api_key: str = Header(..., alias="X-API-Key")):
    """Consulta el estado de un DTE en el SII."""
    require_api_key(x_api_key)
    # TODO: Implementar consulta estado real al SII
    return {"folio": folio, "estado": "aceptado", "track_id": "T001234"}
