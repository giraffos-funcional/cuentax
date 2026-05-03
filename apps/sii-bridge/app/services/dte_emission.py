"""
CUENTAX — Servicio de Emisión DTE
====================================
Orquesta el flujo completo de emisión de un DTE:
1. Validar datos de entrada + RUT
2. Obtener folio (CAF)
3. Generar XML según esquema SII
4. Firmar XML con certificado
5. Enviar al SII via SOAP
6. Recibir TrackID + estado
7. Generar PDF (si se solicita)
"""

import base64
import logging
from datetime import date, datetime, timezone, timedelta

_CHILE_TZ = timezone(timedelta(hours=-4))
from decimal import Decimal
from typing import Optional
from lxml import etree

from app.services.dte_generator import DTEXMLGenerator, DTEDocumento, DTEEmisor, DTEReceptor, DTEItem, DscRcgGlobal
from app.services.caf_manager import caf_manager
from app.services.certificate import certificate_service
from app.services.sii_soap_client import sii_soap_client
from app.services.timbre_electronico import timbre_electronico_service
from app.utils.rut import validate_rut, format_rut, clean_rut
from app.utils.xml_safe import safe_fromstring
from app.core.config import settings

logger = logging.getLogger(__name__)


def _serialize_xml_iso8859(element: etree._Element) -> bytes:
    """
    Serialize lxml element to ISO-8859-1 bytes with double-quote XML declaration.

    lxml's etree.tostring uses single quotes (encoding='ISO-8859-1') which
    the SII's XML parser rejects with CHR-00001. This function produces the
    standard double-quote format: <?xml version="1.0" encoding="ISO-8859-1"?>

    Characters outside ISO-8859-1 range (like U+FFFD replacement chars from
    cert data) are converted to XML character references (&#NNN;).
    """
    xml_str = etree.tostring(element, encoding="unicode")
    # Replace known problematic characters before encoding
    xml_str = xml_str.replace("\ufffd", "")  # Remove replacement chars
    return (
        '<?xml version="1.0" encoding="ISO-8859-1"?>\n' + xml_str
    ).encode("iso-8859-1", errors="xmlcharrefreplace")


class DTEEmissionService:
    """
    Servicio de alto nivel para emisión de DTEs.
    Orquesta todos los subsistemas.
    """

    def __init__(self):
        self.generator = DTEXMLGenerator()

    def emit(self, payload: dict) -> dict:
        """
        Emite un único DTE envuelto en EnvioDTE/EnvioBOLETA.

        Wrapper sobre emit_batch para garantizar que la emisión productiva use el
        mismo envelope certificado por SII (Caratula con NroDetalles, Signature
        outer única, ISO-8859-1) en lugar de subir un <DTE> desnudo.

        Args:
            payload: Diccionario con todos los datos del DTE

        Returns:
            {
                "success": bool,
                "folio": int | None,
                "track_id": str | None,
                "estado": str,
                "mensaje": str,
                "xml_firmado_b64": str | None  # EnvioDTE/EnvioBOLETA serializado
            }
        """
        batch_result = self.emit_batch([payload])

        primer = (batch_result.get("resultados") or [{}])[0]
        return {
            "success": batch_result.get("success", False),
            "folio": primer.get("folio"),
            "track_id": batch_result.get("track_id"),
            "estado": batch_result.get("estado", "error"),
            "mensaje": batch_result.get("mensaje", ""),
            # The "DTE firmado" is now the full EnvioDTE envelope. Downstream
            # consumers (PDF generator, libros) already handle envelopes.
            "xml_firmado_b64": batch_result.get("xml_envio_b64"),
        }

    def emit_batch(self, payloads: list[dict], known_folios: dict[int, int] | None = None) -> dict:
        """
        Emit multiple DTEs in a single EnvioDTE envelope.

        Used for:
        - SII certification test set
        - Batch emission of production DTEs

        Args:
            payloads: List of DTE payload dicts (same format as emit())

        Returns:
            {
                "success": bool,
                "total": int,
                "emitidos": int,
                "errores": list[dict],
                "track_id": str | None,
                "estado": str,
                "xml_envio_b64": str | None,
                "resultados": list[dict]
            }
        """
        if not payloads:
            return {"success": False, "estado": "error", "mensaje": "No payloads provided"}

        rut_emisor = payloads[0]["rut_emisor"]

        # Verify certificate
        if not certificate_service.is_loaded_for(rut_emisor):
            return {
                "success": False,
                "estado": "sin_certificado",
                "mensaje": f"No hay certificado para {rut_emisor}",
            }

        # Pre-flight folio availability check. emit_batch is supposed to be
        # all-or-nothing, but consume_folio() commits each folio as it goes.
        # If the caller asks for more folios of a tipo than the CAF has free,
        # the first N succeed and the rest error with "No folio" — but those
        # N folios are already burnt. The caller retries the whole batch and
        # burns the next N, snowballing folio exhaustion.
        # Counting folios needed per tipo and aborting upfront when any tipo
        # is short stops that bleed without altering the consume contract.
        from collections import Counter
        from app.services.caf_manager import caf_manager
        needed = Counter(p.get("tipo_dte") for p in payloads if p.get("tipo_dte"))
        ambiente_default = ""
        try:
            from app.core.config import settings
            ambiente_default = settings.SII_AMBIENTE
        except Exception:
            pass
        insuf: list[dict] = []
        for tipo, qty in needed.items():
            try:
                caf_manager._load_from_disk_for(rut_emisor, int(tipo), ambiente_default)
            except Exception:
                pass
            cafs = caf_manager._cafs.get((rut_emisor, int(tipo), ambiente_default), [])
            disp = sum(c.folios_disponibles for c in cafs)
            if disp < qty:
                insuf.append({"tipo_dte": int(tipo), "necesarios": qty, "disponibles": disp})
        if insuf:
            return {
                "success": False,
                "estado": "folios_insuficientes",
                "total": len(payloads),
                "emitidos": 0,
                "errores": [{"tipo_dte": x["tipo_dte"], "error": f"Folios insuficientes: necesarios {x['necesarios']}, disponibles {x['disponibles']}"} for x in insuf],
                "mensaje": "Pre-flight: folios insuficientes para emitir el batch completo. No se consumieron folios.",
                "resultados": [],
            }

        # Build unsigned DTEs (with TED but no signature yet)
        unsigned_dtes: list[dict] = []
        resultados: list[dict] = []
        errores: list[dict] = []

        # Track caso_sub -> folio mapping for NC/ND reference resolution
        # Pre-populate with known folios from previous submissions
        caso_sub_to_folio: dict[int, int] = dict(known_folios) if known_folios else {}

        for i, payload in enumerate(payloads):
            try:
                # Resolve NC/ND references: set ref_folio from previously emitted case
                if payload.get("_ref_caso_sub") is not None:
                    ref_sub = payload["_ref_caso_sub"]
                    if ref_sub in caso_sub_to_folio:
                        payload["ref_folio"] = caso_sub_to_folio[ref_sub]
                        logger.info(
                            f"Resolved ref_folio for caso sub {payload.get('_caso_sub')}: "
                            f"ref to sub {ref_sub} → folio {payload['ref_folio']}"
                        )
                    else:
                        logger.warning(
                            f"Cannot resolve ref_folio: sub {ref_sub} not yet emitted"
                        )
                # Set ref_fecha to fecha_emision if not provided
                if payload.get("ref_tipo_doc") and not payload.get("ref_fecha"):
                    payload["ref_fecha"] = payload.get(
                        "fecha_emision", datetime.now(_CHILE_TZ).date().strftime("%Y-%m-%d")
                    )

                result = self._build_unsigned_dte(payload)
                if result["success"]:
                    unsigned_dtes.append(result)
                    # Track folio by caso_sub for reference resolution
                    caso_sub = payload.get("_caso_sub")
                    if caso_sub is not None:
                        caso_sub_to_folio[caso_sub] = result["folio"]
                    resultados.append({
                        "caso": i + 1,
                        "tipo_dte": payload["tipo_dte"],
                        "folio": result["folio"],
                        "estado": "firmado",
                        "monto_neto": result.get("monto_neto", 0),
                        "monto_exe": result.get("monto_exe", 0),
                        "monto_iva": result.get("monto_iva", 0),
                        "monto_total": result.get("monto_total", 0),
                        "rut_receptor": payload.get("rut_receptor", ""),
                        "razon_social_receptor": payload.get("razon_social_receptor", ""),
                    })
                else:
                    errores.append({
                        "caso": i + 1,
                        "tipo_dte": payload["tipo_dte"],
                        "error": result["mensaje"],
                    })
            except Exception as e:
                errores.append({
                    "caso": i + 1,
                    "tipo_dte": payload.get("tipo_dte", "?"),
                    "error": str(e),
                })

        # Fail entirely if ANY DTE had errors — never send partial EnvioDTE
        if errores:
            return {
                "success": False,
                "total": len(payloads),
                "emitidos": 0,
                "errores": errores,
                "estado": "error",
                "mensaje": f"{len(errores)} DTE(s) con error. No se envía nada para evitar envíos parciales.",
            }

        if not unsigned_dtes:
            return {
                "success": False,
                "total": len(payloads),
                "emitidos": 0,
                "errores": errores,
                "estado": "error",
                "mensaje": "No DTEs could be generated",
            }

        # Get RUT of the certificate holder (the person sending)
        rut_envia = self._get_rut_envia(rut_emisor)

        # Build envelope with UNSIGNED DTEs first, then sign each DTE
        # in the tree context. This ensures inclusive C14N produces
        # consistent bytes at both signing and verification time
        # (ancestor namespaces like xmlns:xsi are in scope).
        #
        # Use EnvioBOLETA for boleta-only batches (tipo 39/41),
        # EnvioDTE for everything else.
        try:
            unsigned_elements = [d["unsigned_element"] for d in unsigned_dtes]
            all_boletas = all(
                d["tipo_dte"] in (39, 41) for d in unsigned_dtes
            )
            if all_boletas:
                envio_xml = self.generator.generate_envio_boleta(
                    signed_dtes=unsigned_elements,
                    rut_emisor=rut_emisor,
                    rut_envia=rut_envia,
                    ambiente=settings.SII_AMBIENTE,
                )
                envelope_type = "EnvioBOLETA"
            else:
                envio_xml = self.generator.generate_envio_dte(
                    signed_dtes=unsigned_elements,
                    rut_emisor=rut_emisor,
                    rut_envia=rut_envia,
                    ambiente=settings.SII_AMBIENTE,
                )
                envelope_type = "EnvioDTE"

            # Sign each DTE in the tree context (ancestor namespaces match)
            for dte_info in unsigned_dtes:
                doc_id = f"DTE-T{dte_info['tipo_dte']}F{dte_info['folio']}"
                dte_el = dte_info["unsigned_element"]
                certificate_service.sign_xml(
                    dte_el, rut_emisor=rut_emisor, target_id=doc_id
                )

            # Sign the envelope — Signature appended as child of
            # EnvioDTE/EnvioBOLETA, Reference URI → SetDTE ID ("SetDoc")
            certificate_service.sign_xml(
                envio_xml, rut_emisor=rut_emisor, target_id="SetDoc"
            )

            envio_bytes = _serialize_xml_iso8859(envio_xml)
        except Exception as e:
            logger.error(f"Error building {envelope_type}: {e}")
            return {
                "success": False,
                "total": len(payloads),
                "emitidos": len(unsigned_dtes),
                "errores": errores,
                "estado": "error_envio",
                "mensaje": f"DTEs generados pero error en {envelope_type}: {e}",
            }

        # Send to SII
        track_id = None
        estado = "firmado"
        mensaje = f"{envelope_type} con {len(unsigned_dtes)} DTEs generado y firmado"

        token = sii_soap_client.get_token(rut_emisor=rut_emisor)
        if not token:
            # Retry with force refresh — cached token may have expired
            logger.info("Token not available, retrying with force_refresh...")
            token = sii_soap_client.get_token(force_refresh=True, rut_emisor=rut_emisor)

        send_response_raw = None
        if token:
            try:
                send_result = self._send_to_sii(envio_bytes, rut_emisor, token)
                track_id = send_result.get("track_id")
                send_response_raw = send_result.get("response_raw")
                estado = "enviado" if track_id else "error_envio"
                mensaje = send_result.get("mensaje", "")
                if not track_id:
                    mensaje += f" | SII status: {send_result.get('status')} | response: {send_response_raw}"
            except Exception as e:
                logger.error(f"Error sending {envelope_type} to SII: {e}")
                estado = "error_envio"
                mensaje = f"{envelope_type} firmado pero error al enviar: {e}"
        else:
            logger.warning(f"No SII token after retry — {envelope_type} signed but not sent")
            estado = "firmado_sin_envio"
            mensaje = (
                f"DTEs firmados pero NO enviados al SII\n\n"
                f"{len(unsigned_dtes)}/{len(payloads)} DTEs fueron generados y firmados correctamente, "
                f"pero no se pudieron enviar al SII porque no hay token de sesión activo.\n\n"
                f"Para resolver esto:\n"
                f"1. Verifica que el certificado digital esté cargado\n"
                f"2. Verifica que la conexión SII diga \"Conectado\" en el panel inferior\n"
                f"3. Vuelve a subir el archivo del set y procésalo de nuevo"
            )

        return {
            "success": track_id is not None,
            "total": len(payloads),
            "emitidos": len(unsigned_dtes),
            "errores": errores,
            "track_id": track_id,
            "estado": estado,
            "mensaje": mensaje,
            "xml_envio_b64": base64.b64encode(envio_bytes).decode(),
            "resultados": resultados,
        }

    def _build_unsigned_dte(self, payload: dict) -> dict:
        """Build DTE with TED but WITHOUT signing. Returns unsigned element."""
        tipo_dte = payload["tipo_dte"]
        rut_emisor = payload["rut_emisor"]

        validation_error = self._validate_payload(payload)
        if validation_error:
            return {"success": False, "mensaje": validation_error}

        folio = caf_manager.get_next_folio(rut_emisor, tipo_dte)
        if not folio:
            return {"success": False, "mensaje": f"No folio for tipo {tipo_dte}"}

        doc = self._build_dte_document(payload, folio)
        xml_element = self.generator.generate(doc)

        # Calculate totals for result metadata
        totales = self.generator._calculate_totals(doc)

        # Add TED (but don't sign yet — signing must happen after
        # the DTE is placed in the EnvioDTE tree so that inclusive C14N
        # produces the same bytes at both signing and verification time)
        xml_element = self._add_ted(xml_element, doc, rut_emisor)

        return {
            "success": True,
            "folio": folio,
            "tipo_dte": tipo_dte,
            "unsigned_element": xml_element,
            "monto_neto": totales.get("neto", 0),
            "monto_exe": totales.get("exento", 0),
            "monto_iva": totales.get("iva", 0),
            "monto_total": totales.get("total", 0),
        }

    def _build_and_sign_single_dte(self, payload: dict) -> dict:
        """Build, add TED, and sign a single DTE. Returns the signed element.
        Used for single-DTE emission where EnvioDTE context is known."""
        result = self._build_unsigned_dte(payload)
        if not result["success"]:
            return result

        tipo_dte = result["tipo_dte"]
        folio = result["folio"]
        xml_element = result["unsigned_element"]
        rut_emisor = payload["rut_emisor"]

        # Sign DTE — Reference URI must point to Documento's ID
        doc_id = f"DTE-T{tipo_dte}F{folio}"
        signed_xml = certificate_service.sign_xml(
            xml_element, rut_emisor=rut_emisor, target_id=doc_id
        )

        return {
            "success": True,
            "folio": folio,
            "signed_element": signed_xml,
            "monto_neto": result.get("monto_neto", 0),
            "monto_exe": result.get("monto_exe", 0),
            "monto_iva": result.get("monto_iva", 0),
            "monto_total": result.get("monto_total", 0),
        }

    def _add_ted(self, dte_element: etree._Element, doc: DTEDocumento, rut_emisor: str) -> etree._Element:
        """
        Add TED (Timbre Electrónico Digital) to the Documento element.

        Uses generate_ted_signed() which builds DD as plain-text strings
        (no lxml, no xmlns) to avoid namespace contamination from ancestor
        elements. The FRMT is computed over clean DD bytes.
        """
        caf_data = caf_manager.get_caf(rut_emisor, doc.tipo_dte, folio=doc.folio)
        if not caf_data:
            logger.warning(f"No CAF for TED generation (tipo={doc.tipo_dte}), skipping TED")
            return dte_element

        # Calculate total for TED
        totales = self.generator._calculate_totals(doc)

        # Find the Documento element inside the DTE
        documento = dte_element.find(".//{http://www.sii.cl/SiiDte}Documento")
        if documento is None:
            documento = dte_element.find(".//Documento")
        if documento is None:
            logger.warning("Could not find Documento element for TED insertion")
            return dte_element

        try:
            ted = timbre_electronico_service.generate_ted_signed(
                rut_emisor=doc.emisor.rut,
                tipo_dte=doc.tipo_dte,
                folio=doc.folio,
                fecha_emision=doc.fecha_emision,
                rut_receptor=doc.receptor.rut,
                razon_social_receptor=doc.receptor.razon_social,
                monto_total=totales["total"],
                item1_nombre=doc.items[0].nombre if doc.items else "Item",
                caf_data=caf_data,
            )
            documento.append(ted)

            # Add TmstFirma (timestamp of DTE signature)
            SII_DTE_NS = "http://www.sii.cl/SiiDte"
            tmst = etree.SubElement(documento, f"{{{SII_DTE_NS}}}TmstFirma")
            tmst.text = datetime.now(_CHILE_TZ).strftime("%Y-%m-%dT%H:%M:%S")

        except Exception as e:
            raise ValueError(f"TED generation failed (tipo={doc.tipo_dte} folio={doc.folio}): {e}") from e

        return dte_element

    def _get_rut_envia(self, rut_emisor: str) -> str:
        """Get the RUT of the certificate holder (the person sending).
        Returns formatted RUT with dash (e.g. '76753753-0'), as required by SII.
        """
        normalized = clean_rut(rut_emisor)
        # Look up the titular RUT from the certificate service
        rut_titular = certificate_service._empresa_to_titular.get(normalized)
        if rut_titular:
            # rut_titular is stored normalized (no dash). Format it properly.
            return format_rut(rut_titular, dots=False)
        # Fallback: use emisor RUT, formatted without dots
        return format_rut(rut_emisor, dots=False)

    def _validate_payload(self, p: dict) -> Optional[str]:
        """Valida el payload del DTE. Returns mensaje de error o None."""
        if not validate_rut(p.get("rut_emisor", "")):
            return f"RUT emisor inválido: {p.get('rut_emisor')}"
        if not validate_rut(p.get("rut_receptor", "")):
            return f"RUT receptor inválido: {p.get('rut_receptor')}"
        if not p.get("items"):
            return "Al menos un ítem es requerido"
        # Allow precio=0 for: text corrections (CodRef=2) and documents
        # that reference text corrections (e.g. ND that voids a text-correction NC)
        allows_zero_price = p.get("ref_cod_ref") == 2 or any(
            Decimal(str(item.get("precio_unitario", 0))) == 0 for item in p["items"]
            if p.get("tipo_dte") in (56, 61)  # NC/ND only
        )
        for item in p["items"]:
            if not allows_zero_price and Decimal(str(item.get("precio_unitario", 0))) <= 0:
                return f"Precio unitario debe ser mayor a 0: {item}"
        return None

    def _build_dte_document(self, p: dict, folio: int) -> DTEDocumento:
        emisor = DTEEmisor(
            rut=format_rut(p["rut_emisor"], dots=False),
            razon_social=p["razon_social_emisor"],
            giro=p["giro_emisor"],
            direccion=p.get("direccion_emisor", ""),
            comuna=p.get("comuna_emisor", ""),
            ciudad=p.get("ciudad_emisor", "Santiago"),
            actividad_economica=p.get("actividad_economica", 620200),
        )
        receptor = DTEReceptor(
            rut=format_rut(p["rut_receptor"], dots=False),
            razon_social=p["razon_social_receptor"],
            giro=p["giro_receptor"],
            direccion=p.get("direccion_receptor", ""),
            comuna=p.get("comuna_receptor", ""),
            ciudad=p.get("ciudad_receptor", "Santiago"),
            email=p.get("email_receptor"),
            ref_tipo_doc=p.get("ref_tipo_doc"),
            ref_folio=p.get("ref_folio"),
            ref_fecha=p.get("ref_fecha"),
            ref_cod_ref=p.get("ref_cod_ref"),
            ref_motivo=p.get("ref_motivo"),
        )
        items = [
            DTEItem(
                nombre=it["nombre"],
                cantidad=Decimal(str(it.get("cantidad", 1))),
                precio_unitario=Decimal(str(it["precio_unitario"])),
                descuento_pct=Decimal(str(it.get("descuento_pct", 0))),
                exento=it.get("exento", False),
                codigo=it.get("codigo"),
                unidad=it.get("unidad", "UN"),
            )
            for it in p["items"]
        ]
        descuentos = [
            DscRcgGlobal(
                tipo_mov=d["tipo_mov"],
                glosa=d.get("glosa", ""),
                tipo_valor=d.get("tipo_valor", "%"),
                valor=Decimal(str(d["valor"])),
                ind_exe=d.get("ind_exe", 0),
            )
            for d in p.get("descuentos_globales", [])
        ]
        return DTEDocumento(
            tipo_dte=p["tipo_dte"],
            folio=folio,
            fecha_emision=p.get("fecha_emision", datetime.now(_CHILE_TZ).date().strftime("%Y-%m-%d")),
            emisor=emisor,
            receptor=receptor,
            items=items,
            forma_pago=p.get("forma_pago", 1),
            fecha_vencimiento=p.get("fecha_vencimiento"),
            observaciones=p.get("observaciones"),
            descuentos_globales=descuentos,
            set_prueba_folio=p.get("_set_prueba_folio"),
            set_prueba_caso=p.get("_set_prueba_caso"),
        )

    def _send_to_sii(self, xml_bytes: bytes, rut_emisor: str, token: str) -> dict:
        """Envía el DTE al SII via HTTP multipart upload (cgi_dte/UPL/DTEUpload)."""
        import re
        import requests as req

        # rutCompany = the company issuing DTEs
        company_parts = format_rut(rut_emisor, dots=False).split("-")
        company_num = company_parts[0]
        company_dv = company_parts[1] if len(company_parts) > 1 else "0"

        # rutSender = the person sending (certificate holder), NOT the company
        rut_envia = self._get_rut_envia(rut_emisor)
        sender_parts = rut_envia.split("-")
        sender_num = sender_parts[0]
        sender_dv = sender_parts[1] if len(sender_parts) > 1 else "0"

        endpoint = sii_soap_client._wsdls["upload"]
        proxy_url = sii_soap_client._proxy_url
        proxies = {"http": proxy_url, "https": proxy_url} if proxy_url else None

        logger.info(
            f"Enviando DTE al SII: endpoint={endpoint}, "
            f"sender={sender_num}-{sender_dv}, company={company_num}-{company_dv}"
        )

        # SII expects HTTP multipart form upload with these fields:
        #   rutSender, dvSender = person with certificate (who is sending)
        #   rutCompany, dvCompany = company that issued the DTEs
        #   archivo (file) = XML envelope
        # Cookie: TOKEN=<sii_token> (token obtained with sender's certificate)
        resp = req.post(
            endpoint,
            files={
                "archivo": ("envio_dte.xml", xml_bytes, "text/xml; charset=ISO-8859-1"),
            },
            data={
                "rutSender": sender_num,
                "dvSender": sender_dv,
                "rutCompany": company_num,
                "dvCompany": company_dv,
            },
            headers={
                # SII maullin filters non-browser User-Agents — use a browser-like UA
                "User-Agent": "Mozilla/4.0 (compatible; PROG 1.0; Windows NT 5.0; YComp 5.0.2.4)",
                "Cookie": f"TOKEN={token}",
            },
            proxies=proxies,
            timeout=60,
        )

        if resp.status_code != 200:
            raise Exception(f"SII uploadDTE HTTP {resp.status_code}: {resp.text[:300]}")

        response_text = resp.text
        logger.info(f"SII uploadDTE response ({len(response_text)} bytes): {response_text[:2000]}")

        return self._parse_upload_response(response_text)

    @staticmethod
    def _parse_upload_response(response_text: str) -> dict:
        """
        Parse SII DTEUpload HTML/XML response.

        Detects error responses (STATUS != 0, error codes like SCH-*, CHR-*, etc.)
        to avoid false positive TRACKID matches from error HTML.
        """
        import re

        # First, check for error indicators in the response
        is_error = False
        error_detail = None

        # Check for STATUS tag — STATUS 0 = success, anything else = error
        status_match = re.search(r'<STATUS>(\d+)</STATUS>', response_text, re.IGNORECASE)
        status = status_match.group(1) if status_match else None
        if not status:
            status_match = re.search(r'STATUS\s*:\s*(\d+)', response_text, re.IGNORECASE)
            status = status_match.group(1) if status_match else None

        if status and status != "0":
            is_error = True

        # Check for known SII error codes in response
        error_code_match = re.search(
            r'(SCH-\d+|CHR-\d+|SRV-\d+|AUT-\d+|FIR-\d+|CRT-\d+|RUT-\d+|DOC-\d+)',
            response_text, re.IGNORECASE
        )
        if error_code_match:
            is_error = True
            error_detail = error_code_match.group(1)

        # Check for error keywords in response
        if re.search(r'(?:ERROR|RECHAZADO|INVALIDO|INVALID)', response_text, re.IGNORECASE):
            # Only flag as error if there's no TRACKID/Identificador (some success responses have warnings)
            has_id = (
                re.search(r'<TRACKID>\d+</TRACKID>', response_text, re.IGNORECASE)
                or re.search(r'Identificador de env[^:]*:\s*<strong>\d+</strong>', response_text, re.IGNORECASE)
                or re.search(r'RECIBIDO', response_text, re.IGNORECASE)
            )
            if not has_id:
                is_error = True

        # Parse track ID only if no error detected
        track_id = None
        if not is_error:
            # XML-style: <TRACKID>12345</TRACKID>
            track_match = re.search(r'<TRACKID>(\d+)</TRACKID>', response_text, re.IGNORECASE)
            if track_match:
                track_id = track_match.group(1)

            if not track_id:
                # Text format: "TRACKID : 12345"
                track_match = re.search(r'TRACKID\s*:\s*(\d+)', response_text, re.IGNORECASE)
                if track_match:
                    track_id = track_match.group(1)

            if not track_id:
                # "Número de Envío: 12345" or "Identificador de envío : <strong>12345</strong>"
                track_match = re.search(
                    r'(?:mero de Env|NUMERO ENVIO|Identificador de env)\D*?(\d{5,})',
                    response_text, re.IGNORECASE,
                )
                if track_match:
                    track_id = track_match.group(1)
        else:
            # Even in error case, check if there's a genuine TRACKID tag
            # (STATUS != 0 but TRACKID present = upload accepted with warnings)
            track_match = re.search(r'<TRACKID>(\d+)</TRACKID>', response_text, re.IGNORECASE)
            if track_match:
                candidate = track_match.group(1)
                # Only accept if it looks like a real track ID (> 5 digits, not an error code)
                if len(candidate) >= 5:
                    track_id = candidate
                    is_error = False  # Override: SII accepted it

        mensaje = f"Track ID: {track_id}" if track_id else "Sin Track ID en respuesta"
        if is_error and error_detail:
            mensaje = f"SII error: {error_detail} — {response_text[:200]}"
        elif is_error:
            mensaje = f"SII rejected upload — {response_text[:300]}"

        return {
            "track_id": track_id,
            "status": status,
            "is_error": is_error,
            "error_detail": error_detail,
            "mensaje": mensaje,
            "response_raw": response_text[:2000],
        }


dte_emission_service = DTEEmissionService()
