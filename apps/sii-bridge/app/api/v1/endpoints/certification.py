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
from datetime import date, datetime, timezone, timedelta

_CHILE_TZ = timezone(timedelta(hours=-4))
from decimal import Decimal
from enum import IntEnum
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query
from pydantic import BaseModel

from app.services.set_pruebas_parser import set_pruebas_parser, SetPruebasData
from app.services.dte_emission import dte_emission_service
from app.services.dte_reception import dte_reception_service
from app.services.libro_emission import libro_emission_service
from app.services.pdf_generator import pdf_generator
from app.services.sii_soap_client import sii_soap_client
from app.services.certificate import certificate_service
from app.services.caf_manager import caf_manager

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
            "created_at": datetime.now(_CHILE_TZ).isoformat(),
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
    only_cases: Optional[list[int]] = None  # 1-indexed case sub-numbers to process (e.g. [6] for case 4756304-6)
    known_folios: Optional[dict[str, int]] = None  # caso_sub -> folio from previous submissions
    dry_run: Optional[bool] = False  # Validate payloads and compute totals without consuming folios or sending


class InterceptRequest(BaseModel):
    rut_receptor: str
    rut_emisor_envio: str
    aceptar: bool = True
    glosa: str = ""


class PDFRequest(BaseModel):
    dte_data: dict
    ted_string: Optional[str] = None


class LibrosRequest(BaseModel):
    rut_emisor: str
    periodo: Optional[str] = None  # "YYYY-MM", defaults to current month
    fecha_emision: Optional[str] = None  # date for compras docs, defaults to today
    # Optional inline data — when session was lost (e.g. after deploy)
    resultados: Optional[list[dict]] = None
    raw_test_set_path: Optional[str] = None  # path to test set file on server
    tipo_envio: Optional[str] = "TOTAL"  # TOTAL | RECTIFICA — use RECTIFICA when a prior TOTAL exists for period
    envio_dte_xml_b64: Optional[str] = None  # explicit EnvioDTE XML to use (overrides session batch_result)


# ── Prerequisites check ───────────────────────────────────────

@router.get("/prerequisites")
async def check_prerequisites(rut_emisor: str = Query("")):
    """
    Check all prerequisites needed before processing test sets.
    Returns status of: certificate, CAFs, SII connectivity, and empresa config.
    """
    # 1. Certificate check
    cert_loaded = False
    cert_info = None
    if rut_emisor:
        cert_loaded = certificate_service.is_loaded_for(rut_emisor)
    # Also check if ANY certificate is loaded
    any_cert = bool(certificate_service._certs)
    if any_cert and not cert_loaded:
        # Certificate loaded for a different RUT — get the loaded ones
        loaded_ruts = list(certificate_service._empresa_to_titular.keys())
        cert_info = {"loaded_for": loaded_ruts}

    # 2. CAF check — check for each required DTE type (certification ambiente only)
    caf_factura_types = [33, 56, 61]  # Factura, ND, NC
    caf_boleta_types = [39]  # Boleta
    all_caf_types = caf_factura_types + caf_boleta_types

    cafs_loaded = {}
    for tipo in all_caf_types:
        caf = None
        if rut_emisor:
            caf = caf_manager.get_caf(rut_emisor, tipo, ambiente="certificacion")
        # If not found by rut_emisor, search all loaded CAFs for this type in certification
        if not caf:
            for (rut, t, amb), caf_list in caf_manager._cafs.items():
                if t == tipo and amb == "certificacion" and caf_list:
                    caf = next((c for c in caf_list if c.folios_disponibles > 0), caf_list[0])
                    break
        cafs_loaded[tipo] = {
            "loaded": caf is not None,
            "folio_desde": caf.folio_desde if caf else None,
            "folio_hasta": caf.folio_hasta if caf else None,
            "folios_disponibles": caf.folios_disponibles if caf else 0,
            "rut_empresa": caf.rut_empresa if caf else None,
        }

    cafs_for_factura = all(cafs_loaded[t]["loaded"] for t in [33, 61])  # Min: 33 + 61
    cafs_for_boleta = cafs_loaded[39]["loaded"]

    # 3. SII connectivity
    sii_conn = sii_soap_client.check_connectivity()

    # 4. Token
    token_ok = sii_soap_client._is_token_valid()

    # 5. Overall readiness
    ready_factura = (cert_loaded or any_cert) and cafs_for_factura
    ready_boleta = (cert_loaded or any_cert) and cafs_for_boleta

    tipo_labels = {
        33: "Factura Electrónica",
        39: "Boleta Electrónica",
        41: "Boleta No Afecta",
        56: "Nota de Débito",
        61: "Nota de Crédito",
    }

    return {
        "rut_emisor": rut_emisor or None,
        "certificado": {
            "ok": cert_loaded or any_cert,
            "loaded_for_rut": cert_loaded,
            "any_loaded": any_cert,
            "info": cert_info,
        },
        "cafs": {
            str(tipo): {**info, "label": tipo_labels.get(tipo, f"Tipo {tipo}")}
            for tipo, info in cafs_loaded.items()
        },
        "cafs_ready_factura": cafs_for_factura,
        "cafs_ready_boleta": cafs_for_boleta,
        "sii": {
            "conectado": sii_conn.get("conectado", False),
            "ambiente": sii_conn.get("ambiente", "certificacion"),
            "token_vigente": token_ok,
        },
        "ready_factura": ready_factura,
        "ready_boleta": ready_boleta,
        "ready": ready_factura or ready_boleta,
    }


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

    # SII test set files are ISO-8859-1 encoded (Latin-1).
    # Try ISO-8859-1 first; fall back to UTF-8 for user-uploaded files.
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("iso-8859-1")
    if not text.strip():
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        if set_type == "boleta":
            parsed = set_pruebas_parser.parse_boleta(text, emisor_data)
        else:
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
    if set_type == "boleta":
        session[f"payloads_{set_type}"] = set_pruebas_parser.boleta_to_payloads(parsed)
    else:
        session[f"payloads_{set_type}"] = set_pruebas_parser.to_payloads(parsed)
    # Store raw content for libro de compras parsing later
    session["raw_test_set_content"] = text

    # Ensure all payloads have the correct rut_emisor
    for p in session[f"payloads_{set_type}"]:
        if not p.get("rut_emisor"):
            p["rut_emisor"] = rut_emisor

    # Invalidate prior batch + libro results so we don't mix a stale SET's
    # DTEs with this newly-uploaded SET's raw_test_set_content.
    session["last_batch_result"] = None
    session.pop("libro_ventas_result", None)
    session.pop("libro_compras_result", None)
    logger.info(
        f"Invalidated last_batch_result and libro_*_result for {rut_emisor} "
        f"after uploading new {set_type} SET"
    )

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
    payloads_key = f"payloads_{set_type}"

    # Strategy 1: Try the provided rut_emisor directly
    session = None
    if rut_emisor and rut_emisor != "auto":
        candidate = _sessions.get(rut_emisor)
        if candidate and candidate.get(payloads_key):
            session = candidate

    # Strategy 2: If no session found (or no payloads), search all sessions
    if not session:
        for session_rut, sess in _sessions.items():
            if sess.get(payloads_key):
                rut_emisor = session_rut
                session = sess
                logger.info(f"Found {set_type} payloads in session for {session_rut} (requested: {req.rut_emisor})")
                break

    if not session or not session.get(payloads_key):
        raise HTTPException(
            status_code=400,
            detail=f"No {set_type} test set loaded. Upload first via /wizard/set-prueba/upload?set_type={set_type}",
        )

    payloads = session[payloads_key]

    # Filter by only_cases if specified (1-indexed case sub-numbers)
    if req.only_cases:
        payloads = [
            p for p in payloads
            if p.get("_caso_sub") in req.only_cases
        ]
        if not payloads:
            raise HTTPException(
                status_code=400,
                detail=f"No payloads match only_cases={req.only_cases}. "
                f"Available _caso_sub values: {[p.get('_caso_sub') for p in session[payloads_key]]}",
            )
        logger.info(f"Filtered to {len(payloads)} payloads for cases {req.only_cases}")

    # Parse known_folios keys to int (JSON keys are always strings)
    known_folios_int = None
    if req.known_folios:
        known_folios_int = {int(k): v for k, v in req.known_folios.items()}

    # Ensure all payloads have the correct rut_emisor (may be empty if JWT had no RUT at upload time)
    for p in payloads:
        if not p.get("rut_emisor") or p["rut_emisor"] == "auto":
            p["rut_emisor"] = rut_emisor
        if req.fecha_emision:
            p["fecha_emision"] = req.fecha_emision

    # ── Dry-run mode: validate without consuming folios or sending ──
    if req.dry_run:
        dry_results = []
        folio_needs = {}  # tipo_dte -> count needed
        for i, p in enumerate(payloads):
            tipo = p["tipo_dte"]
            folio_needs[tipo] = folio_needs.get(tipo, 0) + 1
            caso_sub = p.get("_caso_sub", i + 1)
            ref_sub = p.get("_ref_caso_sub")
            ref_resolved = (
                ref_sub in (known_folios_int or {})
                or ref_sub is None
                or (ref_sub is not None and any(
                    pp.get("_caso_sub") == ref_sub
                    for pp in payloads
                ))
            )
            dry_results.append({
                "caso": i + 1,
                "caso_sub": caso_sub,
                "tipo_dte": tipo,
                "rut_receptor": p.get("rut_receptor", ""),
                "items": len(p.get("items", [])),
                "ref_caso_sub": ref_sub,
                "ref_resolved": ref_resolved,
                "descuentos": [
                    {"nombre": it.get("nombre", ""), "descuento_pct": it.get("descuento_pct", 0)}
                    for it in p.get("items", []) if it.get("descuento_pct")
                ],
            })

        # Check folio availability
        folio_status = {}
        for tipo, needed in folio_needs.items():
            caf_list = caf_manager._cafs.get((rut_emisor, tipo, "certificacion"), [])
            available = sum(c.folios_disponibles for c in caf_list) if caf_list else 0
            folio_status[tipo] = {
                "needed": needed,
                "available": available,
                "ok": available >= needed,
            }

        all_folios_ok = all(f["ok"] for f in folio_status.values())
        all_refs_ok = all(r["ref_resolved"] for r in dry_results)

        return {
            "dry_run": True,
            "success": all_folios_ok and all_refs_ok,
            "total_dtes": len(payloads),
            "folio_status": folio_status,
            "all_folios_ok": all_folios_ok,
            "all_refs_ok": all_refs_ok,
            "cases": dry_results,
            "set_type": set_type,
            "mensaje": "✅ Listo para enviar" if (all_folios_ok and all_refs_ok) else "❌ Faltan folios o referencias sin resolver",
        }

    try:
        result = dte_emission_service.emit_batch(payloads, known_folios=known_folios_int)
        session["last_batch_result"] = result
    except Exception as e:
        logger.error(f"Error processing {set_type} test set: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing: {e}")

    # Mark SET_PRUEBA as complete when DTEs were generated and signed
    # (even if SII send failed — signed XMLs are stored for later resubmission)
    emitidos = result.get("emitidos", 0)
    has_track = result.get("track_id") is not None
    estado = result.get("estado", "")

    if has_track or emitidos > 0:
        session["steps_completed"].add(Step.SET_PRUEBA)
        _advance_step(session)
        # Enrich result with advancement info
        if not has_track and emitidos > 0:
            result["warning"] = (
                f"{emitidos} DTEs firmados correctamente pero no enviados al SII "
                f"(sin token de sesión). Los XMLs firmados están guardados para reenvío."
            )
            result["success"] = True  # Mark as success for wizard advancement

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
        "timestamp": datetime.now(_CHILE_TZ).isoformat(),
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


# ── Libros de Compras y Ventas ───────────────────────────────

@router.post("/wizard/libros/generate")
async def generate_libros(req: LibrosRequest):
    """
    Generate and send both Libro de Ventas (IEV) and Libro de Compras (IEC)
    to the SII for certification.

    Requires:
    - Test set uploaded and processed (set basico DTEs emitted)
    - Test set file content available in session (for compras parsing)

    The endpoint:
    1. Builds Libro de Ventas from the batch_result (EnvioDTE XML)
    2. Parses Libro de Compras entries from the test set file
    3. Generates, signs, and sends both to SII
    4. Returns both track IDs
    """
    rut_emisor = req.rut_emisor
    periodo = req.periodo or datetime.now(_CHILE_TZ).date().strftime("%Y-%m")
    fecha_emision = req.fecha_emision or datetime.now(_CHILE_TZ).date().strftime("%Y-%m-%d")

    # Try session first, then fall back to inline data
    session = None
    batch_result = {}
    raw_content = None

    if rut_emisor and rut_emisor != "auto":
        candidate = _sessions.get(rut_emisor)
        if candidate:
            session = candidate

    # Fallback: search all sessions
    if not session:
        for session_rut, sess in _sessions.items():
            if sess.get("last_batch_result"):
                rut_emisor = session_rut
                session = sess
                break

    if session:
        batch_result = session.get("last_batch_result") or {}
        raw_content = session.get("raw_test_set_content")

    # Fall back to inline data when session is lost (e.g. after deploy)
    inline_resultados = req.resultados
    if req.raw_test_set_path:
        import os
        if os.path.exists(req.raw_test_set_path):
            with open(req.raw_test_set_path, "r", encoding="latin-1") as f:
                raw_content = f.read()

    if not raw_content:
        raise HTTPException(
            status_code=400,
            detail=(
                "No test set content available. Either upload via "
                "/wizard/set-prueba/upload or pass raw_test_set_path"
            ),
        )

    # AJUSTE can be sent empty (zero-totals envelope for re-submission)
    _tipo_envio_early = (req.tipo_envio or "TOTAL").upper()
    if not batch_result and not inline_resultados and _tipo_envio_early != "AJUSTE":
        raise HTTPException(
            status_code=400,
            detail=(
                "No batch results available. Either process via "
                "/wizard/set-prueba/process or pass resultados inline"
            ),
        )

    # Parse libro de compras data from the test set file
    compras_data = set_pruebas_parser.parse_libro_compras(raw_content)

    # Per SII certification instructions ("Instructivo SET PRUEBAS DTE", section
    # III/IV): FolioNotificacion is the LITERAL value 1 for Libro de Ventas and
    # 2 for Libro de Compras — NOT the SET number from the test set file.
    # Using the SET number causes LRH (Descuadrado) on LV and LNC on LC.
    folio_ventas = "1"
    folio_compras = "2"
    fct_prop = compras_data.get("fct_prop")
    compras_entries = compras_data["entries"]

    if not compras_data.get("folio_notificacion_ventas"):
        raise HTTPException(
            status_code=400,
            detail="Could not find SET LIBRO DE VENTAS section in test set file",
        )

    tipo_envio_libros = req.tipo_envio or "TOTAL"

    # AJUSTE allows empty libros (zero-totals adjustment)
    if not compras_entries and tipo_envio_libros != "AJUSTE":
        raise HTTPException(
            status_code=400,
            detail="No compras entries found in SET LIBRO DE COMPRAS section",
        )

    # 1. Generate and send Libro de Ventas
    # Priority: explicit request XML > EnvioDTE XML from batch > inline resultados > session resultados
    xml_b64 = req.envio_dte_xml_b64 or batch_result.get("xml_envio_b64")
    if xml_b64:
        resultado_ventas = libro_emission_service.emit_libro_ventas(
            envio_dte_xml_b64=xml_b64,
            rut_emisor=rut_emisor,
            periodo=periodo,
            folio_notificacion=folio_ventas,
            tipo_envio=tipo_envio_libros,
        )
    elif inline_resultados:
        resultado_ventas = libro_emission_service.emit_libro_ventas_from_resultados(
            resultados=inline_resultados,
            rut_emisor=rut_emisor,
            periodo=periodo,
            folio_notificacion=folio_ventas,
            fecha_doc=fecha_emision,
            tipo_envio=tipo_envio_libros,
        )
    elif batch_result.get("resultados"):
        resultado_ventas = libro_emission_service.emit_libro_ventas_from_resultados(
            resultados=batch_result["resultados"],
            rut_emisor=rut_emisor,
            periodo=periodo,
            folio_notificacion=folio_ventas,
            fecha_doc=fecha_emision,
            tipo_envio=tipo_envio_libros,
        )
    elif tipo_envio_libros == "AJUSTE":
        # AJUSTE with no detalles = zero-totals adjustment envelope
        resultado_ventas = libro_emission_service.emit_libro_ventas_from_resultados(
            resultados=[],
            rut_emisor=rut_emisor,
            periodo=periodo,
            folio_notificacion=folio_ventas,
            fecha_doc=fecha_emision,
            tipo_envio=tipo_envio_libros,
        )
    else:
        raise HTTPException(
            status_code=400,
            detail="No EnvioDTE XML or resultados found",
        )

    # 2. Generate and send Libro de Compras
    # For empty AJUSTE (zero-totals re-send), force empty detalles
    _compras_entries = [] if (tipo_envio_libros == "AJUSTE" and not inline_resultados and not batch_result) else compras_entries
    resultado_compras = libro_emission_service.emit_libro_compras(
        compras_entries=_compras_entries,
        rut_emisor=rut_emisor,
        periodo=periodo,
        folio_notificacion=folio_compras,
        fct_prop=fct_prop,
        fecha_doc=fecha_emision,
        tipo_envio=tipo_envio_libros,
    )

    # Store results in session
    session["libro_ventas_result"] = resultado_ventas
    session["libro_compras_result"] = resultado_compras

    overall_success = resultado_ventas.get("success") and resultado_compras.get(
        "success"
    )

    return {
        "success": overall_success,
        "periodo": periodo,
        "libro_ventas": resultado_ventas,
        "libro_compras": resultado_compras,
        "folio_notificacion_ventas": folio_ventas,
        "folio_notificacion_compras": folio_compras,
        "fct_prop": str(fct_prop) if fct_prop else None,
        "compras_entries_count": len(compras_entries),
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
