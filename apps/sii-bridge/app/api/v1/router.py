"""Routers API v1 del SII Bridge."""

from fastapi import APIRouter

from app.api.v1.endpoints import health, rut, certificate, dte

api_router = APIRouter()

api_router.include_router(health.router, prefix="/health", tags=["Health"])
api_router.include_router(rut.router, prefix="/rut", tags=["RUT"])
api_router.include_router(certificate.router, prefix="/certificate", tags=["Certificado"])
api_router.include_router(dte.router, prefix="/dte", tags=["DTE"])
