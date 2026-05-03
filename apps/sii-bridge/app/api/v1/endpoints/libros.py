"""
Libros LV/LC — productive endpoints.

Genera y envía Libro de Ventas (IEV) y Libro de Compras (IEC) al SII para
empresas en producción.

Diferencia clave con el endpoint del wizard (`/certification/wizard/libros/generate`):
- folio_notificacion es **parametrizable** (en cert era hardcoded 1/2)
- Recibe los datos directamente desde el caller (BFF), no desde session_store

Reusa libro_emission_service con todos los fixes del cert
(Caratula NroDetalles, ISO-8859-1, Reference="SetDoc").
"""

from datetime import datetime
import logging
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.libro_emission import libro_emission_service

logger = logging.getLogger(__name__)
router = APIRouter()

_CHILE_TZ = ZoneInfo("America/Santiago")


class LibroVentasRequest(BaseModel):
    rut_emisor: str
    periodo: Optional[str] = None  # "YYYY-MM"
    folio_notificacion: str        # Número de notificación del SII (productive: real)
    tipo_envio: str = "TOTAL"      # TOTAL | RECTIFICA | AJUSTE
    # One of these must be provided:
    envio_dte_xml_b64: Optional[str] = None  # EnvioDTE base64 (preferred)
    resultados: Optional[list[dict]] = None  # Or per-DTE results from emit_batch
    fecha_emision: Optional[str] = None  # Required when using resultados


class LibroComprasRequest(BaseModel):
    rut_emisor: str
    periodo: Optional[str] = None
    folio_notificacion: str
    tipo_envio: str = "TOTAL"
    compras_entries: list[dict]    # Detalles parseados desde DTEs recibidos
    fct_prop: Optional[str] = None  # Factor de proporcionalidad (cuando aplica)
    fecha_emision: Optional[str] = None


# ── /ventas ────────────────────────────────────────────────────

@router.post("/ventas")
async def emitir_libro_ventas(req: LibroVentasRequest):
    """Genera y envía el Libro de Ventas (IEV) al SII."""
    periodo = req.periodo or datetime.now(_CHILE_TZ).strftime("%Y-%m")
    fecha_emision = req.fecha_emision or datetime.now(_CHILE_TZ).strftime("%Y-%m-%d")

    if req.envio_dte_xml_b64:
        result = libro_emission_service.emit_libro_ventas(
            envio_dte_xml_b64=req.envio_dte_xml_b64,
            rut_emisor=req.rut_emisor,
            periodo=periodo,
            folio_notificacion=req.folio_notificacion,
            tipo_envio=req.tipo_envio,
        )
    elif req.resultados:
        result = libro_emission_service.emit_libro_ventas_from_resultados(
            resultados=req.resultados,
            rut_emisor=req.rut_emisor,
            periodo=periodo,
            folio_notificacion=req.folio_notificacion,
            fecha_doc=fecha_emision,
            tipo_envio=req.tipo_envio,
        )
    elif req.tipo_envio.upper() == "AJUSTE":
        # AJUSTE with no detalles = zero-totals adjustment envelope
        result = libro_emission_service.emit_libro_ventas_from_resultados(
            resultados=[],
            rut_emisor=req.rut_emisor,
            periodo=periodo,
            folio_notificacion=req.folio_notificacion,
            fecha_doc=fecha_emision,
            tipo_envio=req.tipo_envio,
        )
    else:
        raise HTTPException(
            status_code=400,
            detail="Provide envio_dte_xml_b64 or resultados (or use tipo_envio=AJUSTE)",
        )

    if not result.get("success"):
        logger.warning(f"Libro Ventas no exitoso: {result.get('mensaje')}")
    return result


# ── /compras ───────────────────────────────────────────────────

@router.post("/compras")
async def emitir_libro_compras(req: LibroComprasRequest):
    """Genera y envía el Libro de Compras (IEC) al SII."""
    periodo = req.periodo or datetime.now(_CHILE_TZ).strftime("%Y-%m")
    fecha_emision = req.fecha_emision or datetime.now(_CHILE_TZ).strftime("%Y-%m-%d")

    result = libro_emission_service.emit_libro_compras(
        compras_entries=req.compras_entries,
        rut_emisor=req.rut_emisor,
        periodo=periodo,
        folio_notificacion=req.folio_notificacion,
        fct_prop=req.fct_prop,
        fecha_doc=fecha_emision,
        tipo_envio=req.tipo_envio,
    )
    if not result.get("success"):
        logger.warning(f"Libro Compras no exitoso: {result.get('mensaje')}")
    return result
