"""
CUENTAX — Endpoints Sprint 2-5
Registra todos los nuevos endpoints en el router v1.
"""

from fastapi import APIRouter
from app.api.v1.endpoints import health, rut, certificate, dte
from app.api.v1.endpoints import caf, webhooks, public_api, certification

api_router = APIRouter()

api_router.include_router(health.router,          prefix="/health",          tags=["Health"])
api_router.include_router(rut.router,             prefix="/rut",             tags=["RUT"])
api_router.include_router(certificate.router,     prefix="/certificate",     tags=["Certificado"])
api_router.include_router(dte.router,             prefix="/dte",             tags=["DTE"])
api_router.include_router(caf.router,             prefix="/caf",             tags=["CAF — Folios"])
api_router.include_router(certification.router,   prefix="/certification",   tags=["Certificación SII"])
api_router.include_router(webhooks.router,        prefix="/webhooks",        tags=["Webhooks"])
api_router.include_router(public_api.router,      prefix="/v1",              tags=["API Pública"])
