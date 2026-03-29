"""
CUENTAX — Certification Wizard Endpoints
==========================================
Step-by-step wizard for the SII certification process.

Steps:
  1. POSTULACION — Manual (info + URLs)
  2. SET_PRUEBA  — Upload & parse SII test set, generate & send DTEs
  3. SIMULACION  — Send representative documents in parallel
  4. INTERCAMBIO — Receive DTEs from SII, send acuse de recibo
  5. MUESTRAS    — Generate PDFs with timbre PDF417
  6. DECLARACION — Manual (info + URL)

Each step tracks its own state in a session dict keyed by rut_emisor.
"""

import logging
from datetime import datetime
from enum import IntEnum
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query
from pydantic import BaseModel

from app.services.set_pruebas_parser import set_pruebas_parser, SetPruebasData
from app.services.dte_emission import dte_emission_service
from app.services.dte_reception import dte_reception_service
from app.services.pdf_generator import pdf_generator
from app.services.sii_soap_client import sii_soap_client

logger = logging.getLogger(__name__)
router = APIRouter()

# Max upload size: 2 MB
MAX_UPLOAD_BYTES = 2 * 1024 * 1024


# ── Step definitions ──────────────────────────────────────────

class Step(IntEnum):
    POSTULACION = 1
    SET_PRUEBA = 2
    SIMULACION = 3
    INTERCAMBIO = 4
    MUESTRAS = 5
    DECLARACION = 6


STEP_INFO = {
    Step.POSTULACION: {
        "nombre": "Postulación",
        "descripcion": "Registrar la empresa en el ambiente de certificación del SII",
        "manual": True,
        "url": "https://maullin.sii.cl/cvc/dte/pe_condiciones.html",
    },
    Step.SET_PRUEBA: {
        "nombre": "Set de Prueba",
        "descripcion": "Descargar set de pruebas del SII (factura y/o boleta), cargar, generar y enviar DTEs",
        "manual": False,
        "url": "https://maullin.sii.cl/cvc_cgi/dte/pe_generar",
    },
    Step.SIMULACION: {
        "nombre": "Simulación",
        "descripcion": "Enviar documentos representativos de la operación real",
        "manual": False,
        "url": None,
    },
    Step.INTERCAMBIO: {
        "nombre": "Intercambio de Información",
        "descripcion": "Recibir DTEs del SII y responder con acuse de recibo",
        "manual": False,
        "url": None,
    },
    Step.MUESTRAS: {
        "nombre": "Muestras de Impresión",
        "descripcion": "Generar PDFs con timbre electrónico PDF417 (máx 20 documentos)",
        "manual": False,
        "url": None,
    },
    Step.DECLARACION: {
        "nombre": "Declaración de Cumplimiento",
        "descripcion": "Firmar declaración en el portal SII para obtener autorización",
        "manual": True,
        "url": "https://maullin.sii.cl/cvc_cgi/dte/pe_avance7",
    },
}


# ── Session storage (per rut_emisor) ─────────────────────────

_sessions: dict[str, dict] = {}


def _get_session(rut_emisor: str) -> dict:
    """Get or create a certification session for a company."""
    if rut_emisor not in _sessions:
        _sessions[rut_emisor] = {
            "rut_emisor": rut_emisor,
            "current_step": Step.POSTULACION,
            "steps_completed": set(),
            "created_at": datetime.now().isoformat(),
            "set_pruebas_factura": None,
            "set_pruebas_boleta": None,
            "payloads_factura": None,
            "payloads_boleta": None,
            "last_batch_result": None,
            "intercambio_results": [],
            "muestras_generadas": 0,
        }
    return _sessions[rut_emisor]


# ── Request models ────────────────────────────────────────────

class EmisorData(BaseModel):
    rut_emisor: str
    razon_social: str
    giro: str
    direccion: str = ""
    comuna: str = ""
    ciudad: str = "Santiago"
    actividad_economica: int = 620200


class StepCompleteRequest(BaseModel):
    rut_emisor: str
    step: int


class ProcessRequest(BaseModel):
    rut_emisor: str
    fecha_emision: Optional[str] = None
    set_type: Optional[str] = "factura"


class InterceptRequest(BaseModel):
    rut_receptor: str
    rut_emisor_envio: str
    aceptar: bool = True
    glosa: str = ""


class PDFRequest(BaseModel):
    dte_data: dict
    ted_string: Optional[str] = None


# ── Wizard overview ───────────────────────────────────────────

@router.get("/wizard")
async def wizard_overview(rut_emisor: str = Query(...)):
    """
    Get the full wizard state for a company.
    Shows all steps, which are completed, and the current step.
    """
    session = _get_session(rut_emisor)

    steps = []
    for step in Step:
        info = STEP_INFO[step]
        steps.append({
            "step": step.value,
            "nombre": info["nombre"],
            "descripcion": info["descripcion"],
            "manual": info["manual"],
            "url": info["url"],
            "completado": step in session["steps_completed"],
            "actual": step == session["current_step"],
        })

    return {
        "rut_emisor": rut_emisor,
        "current_step": session["current_step"],
        "steps": steps,
        "urls": {
            "avance": "https://maullin.sii.cl/cvc_cgi/dte/pe_avance1",
            "certificacion_dte": "https://maullin.sii.cl/cvc/dte/certificacion_dte.html",
        },
    }


@router.post("/wizard/complete-step")
async def complete_step(req: StepCompleteRequest):
    """
    Mark a manual step as completed (Postulación, Declaración).
    For automated steps, completion happens when the operation succeeds.
    """
    session = _get_session(req.rut_emisor)
    step = Step(req.step)

    if not STEP_INFO[step]["manual"]:
        raise HTTPException(
            status_code=400,
            detail=f"Step {step.name} is automated — complete it via its endpoint.",
        )

    session["steps_completed"].add(step)
    _advance_step(session)

    return {
        "success": True,
        "step_completed": step.name,
        "current_step": session["current_step"],
    }


# ── Step 2: Set de Prueba ────────────────────────────────────

@router.post("/wizard/set-prueba/upload")
async def upload_test_set(
    file: UploadFile = File(...),
    rut_emisor: str = Form(""),
    razon_social: str = Form(""),
    giro: str = Form(""),
    direccion: str = Form(""),
    comuna: str = Form(""),
    ciudad: str = Form("Santiago"),
    actividad_economica: str = Form("620200"),
    set_type: str = Query("factura", description="Type of test set: factura or boleta"),
):
    """
    Step 2a: Upload and parse the SII test set file.
    File must be < 2MB text file from https://maullin.sii.cl/cvc_cgi/dte/pe_generar
    Use set_type='factura' for invoice test set, set_type='boleta' for boleta test set.
    """
    if set_type not in ("factura", "boleta"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid set_type '{set_type}'. Must be 'factura' or 'boleta'.",
        )

    emisor_data = {
        "rut_emisor": rut_emisor,
        "razon_social": razon_social,
        "giro": giro,
        "direccion": direccion,
        "comuna": comuna,
        "ciudad": ciudad,
        "actividad_economica": int(actividad_economica) if actividad_economica else 620200,
    }

    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(content)} bytes). Max: {MAX_UPLOAD_BYTES} bytes.",
        )

    text = content.decode("utf-8", errors="replace")
    if not text.strip():
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        parsed = set_pruebas_parser.parse(text, emisor_data)
    except Exception as e:
        logger.error(f"Error parsing test set: {e}")
        raise HTTPException(status_code=400, detail=f"Error parsing test set: {e}")

    if not parsed.casos:
        raise HTTPException(
            status_code=400,
            detail="No test cases found in the file. Check the file format.",
        )

    # If rut_emisor was not provided, use the one from the parsed set
    if not rut_emisor and parsed.rut_emisor:
        rut_emisor = parsed.rut_emisor

    if not rut_emisor:
        raise HTTPException(status_code=400, detail="No se pudo determinar el RUT emisor")

    session = _get_session(rut_emisor)
    session[f"set_pruebas_{set_type}"] = parsed
    session[f"payloads_{set_type}"] = set_pruebas_parser.to_payloads(parsed)

    # Ensure all payloads have the correct rut_emisor
    for p in session[f"payloads_{set_type}"]:
        if not p.get("rut_emisor"):
            p["rut_emisor"] = rut_emisor

    return {
        "success": True,
        "set_type": set_type,
        "total_cases": len(parsed.casos),
        "emisor": {
            "rut": parsed.rut_emisor,
            "razon_social": parsed.razon_social_emisor,
        },
        "cases": [
            {
                "caso": c.caso,
                "tipo_dte": c.tipo_dte,
                "rut_receptor": c.rut_receptor,
                "razon_social_receptor": c.razon_social_receptor,
                "items_count": len(c.items),
                "tiene_referencia": c.referencia is not None,
            }
            for c in parsed.casos
        ],
        "next": "POST /certification/wizard/set-prueba/process to generate and send",
    }


@router.post("/wizard/set-prueba/process")
async def process_test_set(req: ProcessRequest):
    """
    Step 2b: Generate, sign, and send all DTEs from the test set to SII.
    Requires: certificate + CAFs loaded, test set uploaded.
    Use set_type='factura' or 'boleta' to process the corresponding test set.
    """
    set_type = req.set_type or "factura"
    if set_type not in ("factura", "boleta"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid set_type '{set_type}'. Must be 'factura' or 'boleta'.",
        )

    # Find the session — use provided rut_emisor, or search for any session with payloads
    rut_emisor = req.rut_emisor
    if not rut_emisor or rut_emisor == "auto":
        # Find any session that has the requested payloads loaded
        for session_rut, sess in _sessions.items():
            if sess.get(f"payloads_{set_type}"):
                rut_emisor = session_rut
                break

    if not rut_emisor:
        raise HTTPException(
            status_code=400,
            detail="No se pudo determinar el RUT emisor. Sube un set de pruebas primero.",
        )

    session = _get_session(rut_emisor)

    payloads_key = f"payloads_{set_type}"
    if not session.get(payloads_key):
        raise HTTPException(
            status_code=400,
            detail=f"No {set_type} test set loaded. Upload first via /wizard/set-prueba/upload?set_type={set_type}",
        )

    payloads = session[payloads_key]

    # Ensure all payloads have the correct rut_emisor (may be empty if JWT had no RUT at upload time)
    for p in payloads:
        if not p.get("rut_emisor") or p["rut_emisor"] == "auto":
            p["rut_emisor"] = rut_emisor
        if req.fecha_emision:
            p["fecha_emision"] = req.fecha_emision

    try:
        result = dte_emission_service.emit_batch(payloads)
        session["last_batch_result"] = result
    except Exception as e:
        logger.error(f"Error processing {set_type} test set: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing: {e}")

    # Mark SET_PRUEBA as complete when at least one set has been processed successfully
    if result.get("success"):
        session["steps_completed"].add(Step.SET_PRUEBA)
        _advance_step(session)

    return {
        **result,
        "set_type": set_type,
        "current_step": session["current_step"],
    }


# ── Step 3: Simulación ───────────────────────────────────────

@router.post("/wizard/simulacion/send")
async def simulacion_send(payloads: list[dict]):
    """
    Step 3: Send representative documents for simulation.
    Same as batch emission but marks the simulation step.
    """
    if not payloads:
        raise HTTPException(status_code=400, detail="No payloads provided")

    rut_emisor = payloads[0].get("rut_emisor", "")
    session = _get_session(rut_emisor)

    try:
        result = dte_emission_service.emit_batch(payloads)
        session["last_batch_result"] = result
    except Exception as e:
        logger.error(f"Error in simulation: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    if result.get("success"):
        session["steps_completed"].add(Step.SIMULACION)
        _advance_step(session)

    return {
        **result,
        "current_step": session["current_step"],
    }


# ── Step 4: Intercambio ──────────────────────────────────────

@router.post("/wizard/intercambio/receive")
async def intercambio_receive(
    rut_receptor: str = Query(..., description="Our company RUT"),
    file: UploadFile = File(...),
):
    """
    Step 4a: Receive and parse an EnvioDTE from the SII or third party.
    """
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large")

    xml_text = content.decode("utf-8", errors="replace")
    result = dte_reception_service.parse_envio(xml_text)

    session = _get_session(rut_receptor)
    session["intercambio_results"].append({
        "timestamp": datetime.now().isoformat(),
        "parsed": result,
    })

    return result


@router.post("/wizard/intercambio/respond")
async def intercambio_respond(req: InterceptRequest):
    """
    Step 4b: Generate acuse de recibo + acceptance/rejection for received DTEs.
    """
    session = _get_session(req.rut_receptor)
    last_intercambio = session.get("intercambio_results", [])

    if not last_intercambio:
        raise HTTPException(
            status_code=400,
            detail="No DTEs received. Upload an EnvioDTE first.",
        )

    parsed = last_intercambio[-1]["parsed"]
    if not parsed.get("success"):
        raise HTTPException(status_code=400, detail="Last received EnvioDTE had errors")

    # Generate RecepcionDTE (acuse de recibo)
    try:
        recepcion_xml = dte_reception_service.generate_recepcion_dte(
            rut_receptor=req.rut_receptor,
            rut_emisor_envio=req.rut_emisor_envio,
            dtes_recibidos=parsed["dtes"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating RecepcionDTE: {e}")

    # Generate ResultadoDTE for each received DTE
    resultados = []
    for dte in parsed["dtes"]:
        try:
            resultado_xml = dte_reception_service.generate_resultado_dte(
                rut_receptor=req.rut_receptor,
                rut_emisor=dte["rut_emisor"],
                tipo_dte=dte["tipo_dte"],
                folio=dte["folio"],
                fecha_emision=dte["fecha_emision"],
                monto_total=dte["monto_total"],
                aceptado=req.aceptar,
                glosa=req.glosa,
            )
            resultados.append({
                "tipo_dte": dte["tipo_dte"],
                "folio": dte["folio"],
                "aceptado": req.aceptar,
                "xml": resultado_xml,
            })
        except Exception as e:
            resultados.append({
                "tipo_dte": dte["tipo_dte"],
                "folio": dte["folio"],
                "error": str(e),
            })

    all_ok = all("xml" in r for r in resultados)
    if all_ok:
        session["steps_completed"].add(Step.INTERCAMBIO)
        _advance_step(session)

    return {
        "success": all_ok,
        "recepcion_xml": recepcion_xml,
        "resultados": resultados,
        "current_step": session["current_step"],
    }


# ── Step 5: Muestras de Impresión ────────────────────────────

@router.post("/wizard/muestras/generate-pdf")
async def generate_muestra_pdf(req: PDFRequest):
    """
    Step 5: Generate a PDF for a DTE with timbre electrónico PDF417.
    Call this for each document (max 20 for certification).
    """
    try:
        pdf_bytes = pdf_generator.generate(req.dte_data, req.ted_string)
    except Exception as e:
        logger.error(f"Error generating PDF: {e}")
        raise HTTPException(status_code=500, detail=f"Error generating PDF: {e}")

    import base64

    rut_emisor = req.dte_data.get("emisor", {}).get("rut", "")
    if rut_emisor:
        session = _get_session(rut_emisor)
        session["muestras_generadas"] += 1
        if session["muestras_generadas"] >= 1:
            session["steps_completed"].add(Step.MUESTRAS)
            _advance_step(session)

    return {
        "success": True,
        "pdf_b64": base64.b64encode(pdf_bytes).decode(),
        "size_bytes": len(pdf_bytes),
    }


# ── Status & utilities ────────────────────────────────────────

@router.get("/status")
async def certification_status(rut_emisor: str = Query(...)):
    """Get certification status for a company including SII connectivity."""
    session = _get_session(rut_emisor)
    sii_conn = sii_soap_client.check_connectivity()

    return {
        "rut_emisor": rut_emisor,
        "current_step": session["current_step"],
        "steps_completed": [s.value for s in session["steps_completed"]],
        "set_factura_cargado": session["set_pruebas_factura"] is not None,
        "set_boleta_cargado": session["set_pruebas_boleta"] is not None,
        "total_cases_factura": len(session["set_pruebas_factura"].casos) if session["set_pruebas_factura"] else 0,
        "total_cases_boleta": len(session["set_pruebas_boleta"].casos) if session["set_pruebas_boleta"] else 0,
        "ultimo_resultado": session["last_batch_result"],
        "muestras_generadas": session["muestras_generadas"],
        "sii": sii_conn,
        "urls": {
            "postulacion": "https://maullin.sii.cl/cvc/dte/pe_condiciones.html",
            "generar_set": "https://maullin.sii.cl/cvc_cgi/dte/pe_generar",
            "avance": "https://maullin.sii.cl/cvc_cgi/dte/pe_avance1",
            "certificacion": "https://maullin.sii.cl/cvc/dte/certificacion_dte.html",
            "declaracion": "https://maullin.sii.cl/cvc_cgi/dte/pe_avance7",
        },
    }


@router.get("/sii-check")
async def sii_connectivity_check():
    """Quick SII connectivity and token check."""
    conn = sii_soap_client.check_connectivity()
    token_ok = sii_soap_client.get_token() is not None
    return {**conn, "token_obtenido": token_ok}


@router.post("/wizard/reset")
async def reset_wizard(rut_emisor: str = Query(...)):
    """Reset the certification wizard for a company."""
    if rut_emisor in _sessions:
        del _sessions[rut_emisor]
    return {"success": True, "mensaje": f"Wizard reset for {rut_emisor}"}


# ── Internal helpers ──────────────────────────────────────────

def _advance_step(session: dict):
    """Advance to the next incomplete step."""
    for step in Step:
        if step not in session["steps_completed"]:
            session["current_step"] = step
            return
    session["current_step"] = Step.DECLARACION
