"""
CUENTAX — SII Bridge FastAPI Main App
"""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
import logging

# Sentry — optional, only active when SENTRY_DSN is set
SENTRY_DSN = os.getenv("SENTRY_DSN", "")
if SENTRY_DSN:
    import sentry_sdk
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment=os.getenv("SII_AMBIENTE", "development"),
        release=f"cuentax-sii-bridge@1.0.0",
        traces_sample_rate=0.1,
    )
    logging.getLogger(__name__).info("Sentry initialized")
else:
    logging.getLogger(__name__).info("Sentry DSN not configured — error tracking disabled")

from app.api.v1.endpoints import (
    health, certificate, dte, caf, webhooks, public_api, certification
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
app.include_router(certification.router, prefix=f"{PREFIX}/certification", tags=["Certificación SII"])
app.include_router(public_api.router,  prefix=f"{PREFIX}/v1",           tags=["API Pública"])

@app.on_event("startup")
async def startup():
    logger.info("🚀 CUENTAX SII Bridge iniciado — http://0.0.0.0:8000/docs")

    # Restore persisted data from Odoo
    try:
        from app.adapters.odoo_rpc import odoo_rpc
        if odoo_rpc.ping():
            logger.info("Odoo reachable — restoring CAFs and certificates...")
            from app.services.caf_manager import caf_manager
            from app.services.certificate import certificate_service
            caf_count = caf_manager.restore_from_odoo()
            cert_count = certificate_service.restore_from_odoo()
            logger.info(
                f"Restored from Odoo: {caf_count} CAFs, {cert_count} certificates"
            )
        else:
            logger.warning("Odoo not reachable — starting with empty state")
    except Exception as e:
        logger.error(f"Failed to restore from Odoo on startup: {e}")
