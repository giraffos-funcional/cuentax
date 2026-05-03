"""
CUENTAX — DTE Endpoints (Sprint 2 — implementación completa)
Conecta: DTEEmissionService → DTEXMLGenerator → CertificateService → SII SOAP
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional, Literal
from app.services.dte_emission import dte_emission_service
from app.services.pdf_generator import DTEPDFGenerator
from app.services.sii_soap_client import sii_soap_client
from app.utils.dte_xml_extract import extract_first
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


class ItemDTE(BaseModel):
    nombre: str
    cantidad: float = 1
    precio_unitario: float
    descuento_pct: float = 0
    exento: bool = False
    codigo: Optional[str] = None
    unidad: str = "UN"


class DscRcgGlobalDTE(BaseModel):
    tipo_mov: str = "D"  # D=Descuento, R=Recargo
    glosa: str = ""
    tipo_valor: str = "%"  # "%" or "$"
    valor: float
    ind_exe: int = 0  # 0=afecto, 1=exento


class EmitirDTERequest(BaseModel):
    tipo_dte: Literal[33, 39, 41, 56, 61, 110, 111, 112, 113]
    rut_emisor: str
    razon_social_emisor: str
    giro_emisor: str
    direccion_emisor: Optional[str] = None
    comuna_emisor: Optional[str] = None
    ciudad_emisor: Optional[str] = None
    actividad_economica: int = 620200
    rut_receptor: str
    razon_social_receptor: str
    giro_receptor: str
    direccion_receptor: Optional[str] = None
    comuna_receptor: Optional[str] = None
    ciudad_receptor: Optional[str] = None
    contacto_receptor: Optional[str] = None
    email_receptor: Optional[str] = None
    items: list[ItemDTE]
    descuentos_globales: list[DscRcgGlobalDTE] = []
    forma_pago: int = 1
    fecha_emision: Optional[str] = None
    fecha_vencimiento: Optional[str] = None
    observaciones: Optional[str] = None
    ref_tipo_doc: Optional[int] = None
    ref_folio: Optional[int] = None
    ref_fecha: Optional[str] = None
    ref_motivo: Optional[str] = None


class AnularDTERequest(BaseModel):
    tipo_original: int
    folio_original: int
    fecha_original: str
    rut_emisor: str
    razon_social_emisor: str
    giro_emisor: str
    rut_receptor: str
    razon_social_receptor: str
    giro_receptor: str
    motivo: str
    items: list[ItemDTE]  # Ítems del documento anulado


@router.post("/emit")
async def emit_dte(request: EmitirDTERequest):
    """Emite un DTE completo (genera XML, firma, envía al SII)."""
    payload = request.model_dump()
    payload["items"] = [item.model_dump() for item in request.items]
    payload["descuentos_globales"] = [d.model_dump() for d in request.descuentos_globales]

    result = dte_emission_service.emit(payload)

    if not result.get("success"):
        status_code = {
            "sin_certificado": 503,
            "sin_folio": 422,
            "error_validacion": 400,
        }.get(result.get("estado", ""), 502)
        raise HTTPException(status_code, detail=result)

    return result


@router.get("/status/{track_id}")
async def get_dte_status(track_id: str, rut_emisor: str):
    """Consulta el estado de un envío al SII por su track_id usando QueryEstUp."""
    result = sii_soap_client.query_upload_status(rut_company=rut_emisor, track_id=track_id)
    return {
        "track_id": track_id,
        "rut_emisor": rut_emisor,
        "estado": result.get("estado", "UNKNOWN"),
        "glosa": result.get("glosa", ""),
        "num_atencion": result.get("num_atencion", ""),
        "raw_xml": result.get("raw_xml", ""),
    }


@router.get("/status/{track_id}/detail")
async def get_dte_advance(track_id: str, rut_emisor: str):
    """Get per-DTE details from a track using QueryEstDteAv. Shows rejection codes."""
    result = sii_soap_client.query_dte_advance(rut_company=rut_emisor, track_id=track_id)
    return result


class QueryDteStatusRequest(BaseModel):
    rut_emisor: str
    rut_receptor: str
    tipo_dte: int
    folio: int
    fecha_emision: str
    monto_total: int


class QueryDteBatchRequest(BaseModel):
    rut_emisor: str
    dtes: list[QueryDteStatusRequest]


@router.post("/status/dte")
async def get_individual_dte_status(request: QueryDteStatusRequest):
    """
    Query the status of a specific DTE using SII QueryEstDte service.

    Returns per-document rejection reason (codigo rechazo / glosa).
    IMPORTANT: monto_total must match the DTE's MntTotal EXACTLY.
    """
    result = sii_soap_client.query_dte_status(
        rut_consultante=request.rut_emisor,
        rut_company=request.rut_emisor,
        rut_receptor=request.rut_receptor,
        tipo_dte=request.tipo_dte,
        folio=request.folio,
        fecha_emision=request.fecha_emision,
        monto_total=request.monto_total,
    )
    return {
        "rut_emisor": request.rut_emisor,
        "rut_receptor": request.rut_receptor,
        **result,
    }


@router.post("/status/dte/batch")
async def get_batch_dte_status(request: QueryDteBatchRequest):
    """
    Query the status of multiple DTEs in one call.

    Useful after emit_batch to check per-document rejection reasons.
    Each DTE requires the exact monto_total from emission.
    """
    results = []
    for dte in request.dtes:
        result = sii_soap_client.query_dte_status(
            rut_consultante=request.rut_emisor,
            rut_company=request.rut_emisor,
            rut_receptor=dte.rut_receptor,
            tipo_dte=dte.tipo_dte,
            folio=dte.folio,
            fecha_emision=dte.fecha_emision,
            monto_total=dte.monto_total,
        )
        results.append({
            "rut_receptor": dte.rut_receptor,
            **result,
        })

    accepted = sum(1 for r in results if r.get("estado") == "DOK")
    rejected = sum(1 for r in results if r.get("estado") not in ("DOK", "UNKNOWN", "ERROR"))

    return {
        "rut_emisor": request.rut_emisor,
        "total": len(results),
        "accepted": accepted,
        "rejected": rejected,
        "results": results,
    }


class PDFFromXMLRequest(BaseModel):
    xml_b64: str
    tipo_dte: Optional[int] = None  # informational; extracted from XML if absent


@router.post("/pdf")
async def generate_dte_pdf(request: PDFFromXMLRequest):
    """
    Genera el PDF de un DTE a partir de su XML firmado (EnvioDTE o DTE bare).
    Aplica timbre electrónico PDF417 desde el TED del XML.
    """
    extracted = extract_first(request.xml_b64)
    if not extracted:
        raise HTTPException(400, detail="No <Documento> found in XML")
    dte_data, ted_string = extracted

    pdf_bytes = DTEPDFGenerator().generate(dte_data, ted_string=ted_string)
    folio = dte_data.get("folio", 0)
    tipo = dte_data.get("tipo_dte", request.tipo_dte or 0)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="dte_{tipo}_{folio}.pdf"'},
    )


@router.post("/anular")
async def anular_dte(request: AnularDTERequest):
    """
    Anula un DTE emitiendo una Nota de Crédito (tipo 61).
    La NC referencia al documento original.
    """
    # Construir payload de NC que referencia al original
    nc_payload = {
        "tipo_dte": 61,  # Nota de Crédito
        "rut_emisor": request.rut_emisor,
        "razon_social_emisor": request.razon_social_emisor,
        "giro_emisor": request.giro_emisor,
        "rut_receptor": request.rut_receptor,
        "razon_social_receptor": request.razon_social_receptor,
        "giro_receptor": request.giro_receptor,
        "items": [item.model_dump() for item in request.items],
        "ref_tipo_doc": request.tipo_original,
        "ref_folio": request.folio_original,
        "ref_fecha": request.fecha_original,
        "ref_motivo": request.motivo,
    }

    result = dte_emission_service.emit(nc_payload)

    if not result.get("success"):
        raise HTTPException(422, detail=result)

    return {**result, "tipo_generado": "Nota de Crédito", "doc_original": request.folio_original}
