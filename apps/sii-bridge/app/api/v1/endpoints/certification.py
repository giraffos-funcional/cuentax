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
from app.services import session_store

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
#
# session_store on disk is the single source of truth. uvicorn runs multiple
# workers each with separate process memory; persisting after every mutation
# avoids cross-worker drift. See app/services/session_store.py.


def _default_session(rut_emisor: str) -> dict:
    return {
        "rut_emisor": rut_emisor,
        "current_step": Step.POSTULACION,
        "steps_completed": set(),
        "created_at": datetime.now(_CHILE_TZ).isoformat(),
        "payloads_factura": None,
        "payloads_boleta": None,
        "last_batch_result": None,
        "intercambio_results": [],
        "muestras_generadas": 0,
    }


def _get_session(rut_emisor: str) -> dict:
    """Load session from disk (or default if missing). Caller must call _save_session
    after mutating to persist."""
    persisted = session_store.load(rut_emisor)
    if not persisted:
        return _default_session(rut_emisor)

    base = _default_session(rut_emisor)
    base.update(persisted)
    cs = base.get("current_step")
    if isinstance(cs, int):
        try:
            base["current_step"] = Step(cs)
        except ValueError:
            base["current_step"] = Step.POSTULACION
    return base


def _save_session(rut_emisor: str, session: dict) -> None:
    """Persist the session snapshot to disk (best-effort, never raises)."""
    snapshot = dict(session)
    cs = snapshot.get("current_step")
    if hasattr(cs, "value"):
        snapshot["current_step"] = int(cs)
    sc = snapshot.get("steps_completed")
    if isinstance(sc, set):
        snapshot["steps_completed"] = sorted(int(s) if hasattr(s, "value") else s for s in sc)
    session_store.save(rut_emisor, snapshot)


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


class LibrosRequest(BaseModel):
    rut_emisor: str
    periodo: Optional[str] = None  # "YYYY-MM", defaults to current month
    fecha_emision: Optional[str] = None  # date for compras docs, defaults to today
    tipo_envio: Optional[str] = "TOTAL"  # TOTAL | RECTIFICA | AJUSTE
    only_lc: Optional[bool] = False  # skip LV generation (LV already REVISADO CONFORME)
    only_lv: Optional[bool] = False  # skip LC generation (LC already REVISADO CONFORME)


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
    _save_session(req.rut_emisor, session)

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
    set_type: str = Query("factura", description="Type of test set: factura or boleta"),
):
    """
    Step 2a: Upload and parse the SII test set file.
    File must be < 2MB text file from https://maullin.sii.cl/cvc_cgi/dte/pe_generar
    Use set_type='factura' for invoice test set, set_type='boleta' for boleta test set.

    Emisor data (razon_social, giro, dirección, etc.) viene del archivo del SII parseado;
    no se envía desde el cliente.
    """
    if set_type not in ("factura", "boleta"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid set_type '{set_type}'. Must be 'factura' or 'boleta'.",
        )

    emisor_data = {"rut_emisor": rut_emisor}

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
    _save_session(rut_emisor, session)

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

    # The UI always knows the real rut_emisor (from auth + empresa config).
    rut_emisor = req.rut_emisor
    if not rut_emisor or rut_emisor == "auto":
        raise HTTPException(status_code=400, detail="rut_emisor requerido")
    payloads_key = f"payloads_{set_type}"
    session = _get_session(rut_emisor)
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

    _save_session(rut_emisor, session)

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
    _save_session(rut_emisor, session)

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
    _save_session(rut_receptor, session)

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

    # Generate ResultadoDTE only for DTEs whose RUTRecep matches us. The
    # Set de Intercambio del SII includes a DTE addressed to a different
    # RUT; we must NOT emit a commercial response for that one — only flag
    # it as "RUT no corresponde" in the RecepcionDTE (already handled in
    # generate_recepcion_dte).
    resultados = []
    for dte in parsed["dtes"]:
        if (dte.get("rut_receptor") or "").strip() != req.rut_receptor.strip():
            resultados.append({
                "tipo_dte": dte["tipo_dte"],
                "folio": dte["folio"],
                "skipped": True,
                "reason": "RUT receptor no corresponde — no se emite ResultadoDTE",
            })
            continue
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

    # Generate EnvioRecibos (Recepción de Mercaderías) for DTEs addressed
    # to us — second file the SII certification expects in Paso 4.
    try:
        envio_recibos_xml = dte_reception_service.generate_envio_recibos(
            rut_receptor=req.rut_receptor,
            rut_emisor_envio=req.rut_emisor_envio,
            dtes_recibidos=parsed["dtes"],
        )
    except Exception as e:
        envio_recibos_xml = None
        logger.error(f"Error generating EnvioRecibos: {e}")

    all_ok = all(("xml" in r) or r.get("skipped") for r in resultados)
    if all_ok:
        session["steps_completed"].add(Step.INTERCAMBIO)
        _advance_step(session)
    _save_session(req.rut_receptor, session)

    return {
        "success": all_ok,
        "recepcion_xml": recepcion_xml,
        "envio_recibos_xml": envio_recibos_xml,
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
        _save_session(rut_emisor, session)

    return {
        "success": True,
        "pdf_b64": base64.b64encode(pdf_bytes).decode(),
        "size_bytes": len(pdf_bytes),
    }


@router.post("/wizard/muestras/generate-bulk")
async def generate_muestras_bulk(
    rut_emisor: str = Query(..., description="RUT emisor whose session holds the signed EnvioDTE"),
    folios: Optional[str] = Query(
        None,
        description="Comma-separated folio list to include (e.g. '1,2,3'). Omit to generate PDFs for ALL documents in the last batch.",
    ),
):
    """
    Step 5 (bulk): Generate PDFs for every signed DTE in the last batch result.

    Input:
      * ``rut_emisor`` — locates the session.
      * ``folios`` (optional) — filter to a subset by folio number.

    Flow:
      1. Pull ``last_batch_result.xml_envio_b64`` from the session (disk-backed).
      2. Parse the ``EnvioDTE`` envelope.
      3. For each inner ``<Documento>``:
           - extract ``TED`` as a serialized string for the PDF417 barcode,
           - project the DTE XML into the dict shape ``pdf_generator.generate``
             expects (emisor/receptor/items/totales/referencia),
           - render a PDF.
      4. Return one ``{tipo_dte, folio, pdf_b64, size_bytes}`` per document.

    Rationale:
      SII certification Paso 5 (Muestras Impresas) needs a printed PDF for
      every DTE of the SET Básico. Calling ``/generate-pdf`` N times forces
      the client to already hold the parsed DTE data; this endpoint works
      directly from the signed envelope the bridge already has so no client
      state is required.
    """
    session = _get_session(rut_emisor)
    batch = session.get("last_batch_result") or {}
    envio_b64 = batch.get("xml_envio_b64")
    if not envio_b64:
        raise HTTPException(
            status_code=400,
            detail=(
                "No signed EnvioDTE in session for this rut_emisor. Run "
                "/wizard/set-prueba/process first, or restore session state."
            ),
        )

    import base64
    from lxml import etree

    try:
        envio_bytes = base64.b64decode(envio_b64)
        # EnvioDTE is serialized in ISO-8859-1 by sii-bridge; lxml handles the
        # encoding declaration inside the payload, so we parse bytes directly.
        root = etree.fromstring(envio_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cannot parse EnvioDTE: {e}")

    wanted: Optional[set[int]] = None
    if folios:
        try:
            wanted = {int(f.strip()) for f in folios.split(",") if f.strip()}
        except ValueError:
            raise HTTPException(status_code=400, detail="folios must be comma-separated integers")

    pdfs: list[dict] = []
    errors: list[dict] = []

    for doc_node, extract in _iter_documentos(root):
        try:
            dte_data, ted_string, tipo_dte, folio = extract()
            if wanted is not None and folio not in wanted:
                continue
            pdf_bytes = pdf_generator.generate(dte_data, ted_string)
            pdfs.append({
                "tipo_dte": tipo_dte,
                "folio": folio,
                "pdf_b64": base64.b64encode(pdf_bytes).decode(),
                "size_bytes": len(pdf_bytes),
            })
        except Exception as e:
            logger.error(f"bulk PDF error on documento: {e}")
            errors.append({"error": str(e)})

    # Mark MUESTRAS complete once we have produced at least one PDF.
    if pdfs:
        session["muestras_generadas"] = session.get("muestras_generadas", 0) + len(pdfs)
        session["steps_completed"].add(Step.MUESTRAS)
        _advance_step(session)
        _save_session(rut_emisor, session)

    return {
        "success": len(errors) == 0,
        "total": len(pdfs),
        "pdfs": pdfs,
        "errors": errors,
        "current_step": session["current_step"],
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

    # Try session first, then fall back to inline data. _get_session reads
    # from disk so multi-worker uvicorn doesn't drift.
    session = None
    batch_result = {}
    raw_content = None

    if rut_emisor and rut_emisor != "auto":
        session = _get_session(rut_emisor)

    # Fallback: scan persisted sessions for one with a prior batch_result.
    # Covers the case where the caller didn't know the rut and sent "auto".
    if not session or not session.get("raw_test_set_content"):
        for session_rut, sess in session_store.load_all().items():
            if sess.get("last_batch_result") or sess.get("raw_test_set_content"):
                rut_emisor = session_rut
                session = _get_session(session_rut)
                break

    if session:
        batch_result = session.get("last_batch_result") or {}
        raw_content = session.get("raw_test_set_content")

    if not raw_content:
        raise HTTPException(
            status_code=400,
            detail="No test set content available. Upload via /wizard/set-prueba/upload first.",
        )

    # AJUSTE can be sent empty (zero-totals envelope for re-submission)
    _tipo_envio_early = (req.tipo_envio or "TOTAL").upper()
    if not batch_result and _tipo_envio_early != "AJUSTE" and not req.only_lc:
        raise HTTPException(
            status_code=400,
            detail="No batch results available. Process the SET via /wizard/set-prueba/process first.",
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
    # Priority: EnvioDTE XML from batch > session resultados
    xml_b64 = batch_result.get("xml_envio_b64")
    resultado_ventas = None
    if req.only_lc:
        # Skip LV entirely — used when LV already REVISADO CONFORME at SII
        pass
    elif xml_b64:
        resultado_ventas = libro_emission_service.emit_libro_ventas(
            envio_dte_xml_b64=xml_b64,
            rut_emisor=rut_emisor,
            periodo=periodo,
            folio_notificacion=folio_ventas,
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
    resultado_compras = None
    if not req.only_lv:
        # For AJUSTE we still submit the full parsed detalles when the SET is
        # known — AJUSTE is a *corrected* libro, not a zero-totals envelope.
        # We only fall back to empty detalles when we truly have no data to
        # reconstruct the period from.
        if tipo_envio_libros == "AJUSTE" and not compras_entries:
            _compras_entries = []
        else:
            _compras_entries = compras_entries
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
    if session is not None:
        if resultado_ventas is not None:
            session["libro_ventas_result"] = resultado_ventas
        if resultado_compras is not None:
            session["libro_compras_result"] = resultado_compras
        _save_session(session.get("rut_emisor") or rut_emisor, session)

    overall_success = (
        (resultado_ventas is None or resultado_ventas.get("success"))
        and (resultado_compras is None or resultado_compras.get("success"))
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

    # Case counts derive from the persisted payloads (single source of truth).
    payloads_factura = session.get("payloads_factura") or []
    payloads_boleta = session.get("payloads_boleta") or []
    set_factura_cargado = bool(payloads_factura)
    set_boleta_cargado = bool(payloads_boleta)
    total_factura = len(payloads_factura)
    total_boleta = len(payloads_boleta)

    return {
        "rut_emisor": rut_emisor,
        "current_step": session["current_step"],
        "steps_completed": [s.value for s in session["steps_completed"]],
        "set_factura_cargado": set_factura_cargado,
        "set_boleta_cargado": set_boleta_cargado,
        "total_cases_factura": total_factura,
        "total_cases_boleta": total_boleta,
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


@router.post("/wizard/reset")
async def reset_wizard(rut_emisor: str = Query(...)):
    """Reset the certification wizard for a company.

    Clears both the in-memory cache and the persisted snapshot so a reset is
    not silently undone by the next restart.
    """
    session_store.delete(rut_emisor)
    return {"success": True, "mensaje": f"Wizard reset for {rut_emisor}"}


# ── Internal helpers ──────────────────────────────────────────

def _advance_step(session: dict):
    """Advance to the next incomplete step."""
    for step in Step:
        if step not in session["steps_completed"]:
            session["current_step"] = step
            return
    session["current_step"] = Step.DECLARACION


# ── EnvioDTE → PDF projection helpers ─────────────────────────
#
# The signed envelope holds every field /muestras/generate-pdf needs; these
# helpers extract a (dte_data, ted_string, tipo_dte, folio) tuple per Documento.
# We use localname comparisons instead of fixed XPaths so we do not care about
# whether the default SII namespace is declared on the root, Documento or both
# (real envelopes from SOAP roundtrips sometimes strip it on inner nodes).

def _iter_documentos(root):
    """Yield (documento_node, extractor_callable) tuples.

    The extractor is lazy so we can filter by folio before paying parse cost.
    """
    from lxml import etree  # local import to keep module import lean

    def _lname(el) -> str:
        return etree.QName(el.tag).localname if isinstance(el.tag, str) else ""

    def _find(parent, name: str):
        if parent is None:
            return None
        for child in parent:
            if _lname(child) == name:
                return child
        return None

    def _find_all(parent, name: str) -> list:
        if parent is None:
            return []
        return [c for c in parent if _lname(c) == name]

    def _text(parent, name: str, default: str = "") -> str:
        el = _find(parent, name)
        if el is None or el.text is None:
            return default
        return el.text.strip()

    def _int(parent, name: str, default: int = 0) -> int:
        raw = _text(parent, name, "")
        try:
            return int(raw)
        except (TypeError, ValueError):
            return default

    for dte_wrapper in _find_all(root, "SetDTE") + [root]:
        # SII EnvioDTE has this shape:
        #   <EnvioDTE><SetDTE><DTE><Documento>...</Documento></DTE>...</SetDTE></EnvioDTE>
        # We accept any depth by walking every <DTE> in the tree.
        pass

    from lxml import etree as _etree  # noqa: F401 — already imported above

    for dte_node in [el for el in root.iter() if _lname(el) == "DTE"]:
        documento = _find(dte_node, "Documento")
        if documento is None:
            continue

        def make_extractor(doc_el):
            def _extract():
                encab = _find(doc_el, "Encabezado")
                id_doc = _find(encab, "IdDoc")
                emisor = _find(encab, "Emisor")
                receptor = _find(encab, "Receptor")
                totales = _find(encab, "Totales")

                tipo_dte = _int(id_doc, "TipoDTE")
                folio = _int(id_doc, "Folio")

                # Detalle → items[]
                items: list[dict] = []
                for det in _find_all(doc_el, "Detalle"):
                    items.append({
                        "nombre": _text(det, "NmbItem"),
                        "cantidad": _int(det, "QtyItem") or 1,
                        "precio_unitario": _int(det, "PrcItem"),
                        "monto_item": _int(det, "MontoItem"),
                        "exento": _int(det, "IndExe") == 1,
                    })

                # Referencia (optional, for NC/ND)
                ref_el = _find(doc_el, "Referencia")
                referencia = None
                if ref_el is not None:
                    referencia = {
                        "tipo_doc": _text(ref_el, "TpoDocRef"),
                        "folio": _text(ref_el, "FolioRef"),
                        "fecha": _text(ref_el, "FchRef"),
                        "razon": _text(ref_el, "RazonRef"),
                    }

                dte_data = {
                    "tipo_dte": tipo_dte,
                    "folio": folio,
                    "fecha_emision": _text(id_doc, "FchEmis"),
                    "emisor": {
                        "rut": _text(emisor, "RUTEmisor"),
                        "razon_social": (
                            _text(emisor, "RznSoc")
                            or _text(emisor, "RznSocEmisor")
                        ),
                        "giro": (
                            _text(emisor, "GiroEmis")
                            or _text(emisor, "GiroEmisor")
                        ),
                        "direccion": _text(emisor, "DirOrigen"),
                        "comuna": _text(emisor, "CmnaOrigen"),
                        "ciudad": _text(emisor, "CiudadOrigen"),
                    },
                    "receptor": {
                        "rut": _text(receptor, "RUTRecep"),
                        "razon_social": _text(receptor, "RznSocRecep"),
                        "giro": _text(receptor, "GiroRecep"),
                        "direccion": _text(receptor, "DirRecep"),
                        "comuna": _text(receptor, "CmnaRecep"),
                        "ciudad": _text(receptor, "CiudadRecep"),
                    },
                    "items": items,
                    "totales": {
                        "neto": _int(totales, "MntNeto"),
                        "iva": _int(totales, "IVA"),
                        "exento": _int(totales, "MntExe"),
                        "total": _int(totales, "MntTotal"),
                    },
                }
                if referencia:
                    dte_data["referencia"] = referencia

                # Serialize TED as a compact string for the PDF417 encoder.
                ted_el = _find(doc_el, "TED")
                ted_string = None
                if ted_el is not None:
                    ted_string = _etree.tostring(
                        ted_el, encoding="unicode", xml_declaration=False
                    )

                return dte_data, ted_string, tipo_dte, folio

            return _extract

        yield documento, make_extractor(documento)
