"""Health + SII Connectivity Endpoint"""
from fastapi import APIRouter
from app.services.certificate import certificate_service
from app.services.sii_soap_client import sii_soap_client

router = APIRouter()

@router.get("")
async def health():
    return {"status": "ok", "service": "cuentax-sii-bridge", "version": "1.0.0"}

@router.get("/sii")
async def sii_connectivity():
    """Verifica conectividad con el SII y estado del token."""
    cert = certificate_service.get_status()
    token = sii_soap_client.get_token()
    return {
        "conectado": token is not None,
        "token_vigente": token is not None,
        "ambiente": sii_soap_client._ambiente,
        "certificado": cert,
    }
