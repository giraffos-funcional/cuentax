"""Endpoint de salud detallado del SII Bridge."""

from fastapi import APIRouter
from app.core.config import settings
from app.services.certificate import certificate_service

router = APIRouter()


@router.get("/detailed")
async def health_detailed():
    """
    Health check detallado con estado de todos los subsistemas.
    Usado por monitoring y el Dashboard de admin.
    """
    return {
        "status": "ok",
        "service": "sii-bridge",
        "version": settings.APP_VERSION,
        "ambiente": settings.SII_AMBIENTE,
        "subsystems": {
            "certificate": {
                "loaded": certificate_service.is_loaded,
                "status": "ok" if certificate_service.is_loaded else "no_certificate",
                "message": (
                    "Certificado cargado y listo"
                    if certificate_service.is_loaded
                    else "Sin certificado — modo mock activo"
                ),
            },
            "sii_endpoint": {
                "url": settings.SII_BASE_URL,
                "ambiente": settings.SII_AMBIENTE,
            },
        },
    }
