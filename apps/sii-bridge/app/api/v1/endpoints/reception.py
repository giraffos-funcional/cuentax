"""
DTE Reception — productive endpoints.

Cuando un proveedor envía una factura electrónica (EnvioDTE) a la casilla DTE,
hay que responder con:
  1. RecepcionDTE  (acuse de recibo automático del envelope)
  2. ResultadoDTE  (aceptación/rechazo comercial — Ley 19.983 art. 9°: 8 días)
  3. EnvioRecibos  (recepción de mercaderías/servicios)

Estos endpoints reusan dte_reception_service (mismos fixes que certificación
de Zyncro: Signature outer única, Caratula con NroDetalles, ISO-8859-1).
"""

from datetime import datetime
import logging

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.services.dte_reception import dte_reception_service

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB


class RecepcionRequest(BaseModel):
    rut_receptor: str            # Nuestra empresa (la que recibe)
    rut_emisor_envio: str        # Quien envía el EnvioDTE (proveedor o SII)
    dtes: list[dict]             # Lista de DTEs ya parseados (de /parse)


class ResultadoRequest(BaseModel):
    rut_receptor: str
    rut_emisor: str
    tipo_dte: int
    folio: int
    fecha_emision: str
    monto_total: int
    aceptado: bool = True
    glosa: str = ""


class EnvioRecibosRequest(BaseModel):
    rut_receptor: str
    rut_emisor_envio: str
    dtes: list[dict]


# ── /parse — Subir el EnvioDTE recibido y devolver el detalle parseado ──

@router.post("/parse")
async def reception_parse(file: UploadFile = File(...)):
    """
    Parsea un EnvioDTE recibido (upload .xml). Retorna el detalle de cada DTE
    contenido, listo para que el cliente decida aceptar/rechazar.
    """
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large")
    xml_text = content.decode("utf-8", errors="replace")
    return dte_reception_service.parse_envio(xml_text)


# ── /recepcion — Genera RecepcionDTE (acuse) ──

@router.post("/recepcion")
async def reception_acuse(req: RecepcionRequest):
    """Genera RecepcionDTE (acuse de recibo del envelope). Devuelve XML firmado."""
    try:
        xml = dte_reception_service.generate_recepcion_dte(
            rut_receptor=req.rut_receptor,
            rut_emisor_envio=req.rut_emisor_envio,
            dtes_recibidos=req.dtes,
        )
    except Exception as e:
        logger.error(f"Error generating RecepcionDTE: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {e}")
    return {"success": True, "xml": xml}


# ── /resultado — Aceptación o rechazo comercial por DTE ──

@router.post("/resultado")
async def reception_resultado(req: ResultadoRequest):
    """Genera ResultadoDTE (aceptación o rechazo comercial). Plazo SII: 8 días desde recepción."""
    try:
        xml = dte_reception_service.generate_resultado_dte(
            rut_receptor=req.rut_receptor,
            rut_emisor=req.rut_emisor,
            tipo_dte=req.tipo_dte,
            folio=req.folio,
            fecha_emision=req.fecha_emision,
            monto_total=req.monto_total,
            aceptado=req.aceptado,
            glosa=req.glosa,
        )
    except Exception as e:
        logger.error(f"Error generating ResultadoDTE: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {e}")
    return {
        "success": True,
        "xml": xml,
        "tipo_dte": req.tipo_dte,
        "folio": req.folio,
        "aceptado": req.aceptado,
        "fecha_respuesta": datetime.utcnow().isoformat() + "Z",
    }


# ── /envio-recibos — Recepción de mercaderías/servicios ──

@router.post("/envio-recibos")
async def reception_envio_recibos(req: EnvioRecibosRequest):
    """Genera EnvioRecibos (recepción de mercaderías). Acompaña al ResultadoDTE."""
    try:
        xml = dte_reception_service.generate_envio_recibos(
            rut_receptor=req.rut_receptor,
            rut_emisor_envio=req.rut_emisor_envio,
            dtes_recibidos=req.dtes,
        )
    except Exception as e:
        logger.error(f"Error generating EnvioRecibos: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {e}")
    return {"success": True, "xml": xml}
