"""
Giraffos SII Bridge — Main FastAPI Application
===============================================
Puente entre el BFF Node.js y los servicios del SII Chile.
Maneja: firma XML, envío SOAP, gestión CAF, validación RUT.

Autor: Equipo Giraffos (Marcus, David, Victor)
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
import os

from app.core.config import settings
from app.core.logging import setup_logging
from app.api.v1.router import api_router

# ── Configurar logging estructurado ──────────────────────────
setup_logging()
logger = logging.getLogger(__name__)


# ── Lifecycle ─────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup y shutdown del servidor."""
    logger.info(f"🚀 SII Bridge arrancando — Ambiente: {settings.SII_AMBIENTE}")
    logger.info(f"   Versión: {settings.APP_VERSION}")
    
    # Validar configuración crítica al arranque
    if settings.SII_AMBIENTE == "produccion" and not settings.SII_CERT_PATH:
        raise RuntimeError("❌ Certificado digital requerido para ambiente producción")
    
    yield
    
    logger.info("🔴 SII Bridge cerrando...")


# ── App ───────────────────────────────────────────────────────
app = FastAPI(
    title="Giraffos SII Bridge",
    description="API interna para comunicación con el SII Chile. Firma XML, envío DTE, gestión CAF.",
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/docs" if settings.PYTHON_ENV != "production" else None,
    redoc_url="/redoc" if settings.PYTHON_ENV != "production" else None,
)

# ── CORS (solo orígenes internos en producción) ───────────────
ALLOWED_ORIGINS = (
    ["*"]
    if settings.PYTHON_ENV == "development"
    else [settings.BFF_URL]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ── Rutas ─────────────────────────────────────────────────────
app.include_router(api_router, prefix="/api/v1")


# ── Health Check ──────────────────────────────────────────────
@app.get("/health", tags=["System"])
async def health_check():
    """Health check para Docker y load balancer."""
    return {
        "status": "ok",
        "service": "sii-bridge",
        "version": settings.APP_VERSION,
        "ambiente": settings.SII_AMBIENTE,
    }
