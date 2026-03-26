"""
CUENTAX — SII Bridge FastAPI Main App
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
import logging

from app.api.v1.endpoints import (
    health, certificate, dte, caf, webhooks, public_api
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="CUENTAX SII Bridge",
    description="Servicio de integración SII Chile — DTEs, firma XML, CAF, tokens",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PREFIX = "/api/v1"

app.include_router(health.router,      prefix=f"{PREFIX}/health",      tags=["Health"])
app.include_router(certificate.router, prefix=f"{PREFIX}/certificate",  tags=["Certificado"])
app.include_router(dte.router,         prefix=f"{PREFIX}/dte",          tags=["DTE"])
app.include_router(caf.router,         prefix=f"{PREFIX}/caf",          tags=["CAF"])
app.include_router(webhooks.router,    prefix=f"{PREFIX}/webhooks",     tags=["Webhooks"])
app.include_router(public_api.router,  prefix=f"{PREFIX}/v1",           tags=["API Pública"])

@app.on_event("startup")
async def startup():
    logger.info("🚀 CUENTAX SII Bridge iniciado — http://0.0.0.0:8000/docs")
