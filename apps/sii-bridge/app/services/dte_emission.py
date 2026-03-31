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
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from lxml import etree

from app.services.dte_generator import DTEXMLGenerator, DTEDocumento, DTEEmisor, DTEReceptor, DTEItem
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
    """
    xml_str = etree.tostring(element, encoding="unicode")
    return (
        '<?xml version="1.0" encoding="ISO-8859-1"?>\n' + xml_str
    ).encode("iso-8859-1")


class DTEEmissionService:
    """
    Servicio de alto nivel para emisión de DTEs.
    Orquesta todos los subsistemas.
    """

    def __init__(self):
        self.generator = DTEXMLGenerator()

    def emit(self, payload: dict) -> dict:
        """
        Emite un DTE completo.
        
        Args:
            payload: Diccionario con todos los datos del DTE
            
        Returns:
            {
                "success": bool,
                "folio": int,
                "track_id": str | None,
                "estado": str,
                "mensaje": str,
                "xml_firmado_b64": str | None
            }
        """
        tipo_dte = payload["tipo_dte"]
        rut_emisor = payload["rut_emisor"]

        # 1. Validaciones
        validation_error = self._validate_payload(payload)
        if validation_error:
            return {"success": False, "estado": "error_validacion", "mensaje": validation_error}

        # 2. Verificar certificado para este emisor
        if not certificate_service.is_loaded_for(rut_emisor):
            return {
                "success": False,
                "estado": "sin_certificado",
                "mensaje": (
                    f"No hay certificado digital asociado a la empresa {rut_emisor}. "
                    "Carga un certificado o asocia la empresa en Configuración → Certificado SII."
                ),
            }

        # 3. Obtener folio
        folio = caf_manager.get_next_folio(rut_emisor, tipo_dte)
        if not folio:
            return {
                "success": False,
                "estado": "sin_folio",
                "mensaje": f"No hay folios disponibles para tipo DTE {tipo_dte}. Carga un CAF.",
            }

        # 4. Construir objeto DTEDocumento
        try:
            doc = self._build_dte_document(payload, folio)
        except Exception as e:
            return {"success": False, "estado": "error_datos", "mensaje": str(e)}

        # 5. Generar XML + TED + Firmar
        try:
            xml_element = self.generator.generate(doc)
            # Add TED (Timbre Electrónico Digital) before signing
            xml_element = self._add_ted(xml_element, doc, rut_emisor)
            # Sign the DTE (Documento level)
            signed_xml = certificate_service.sign_xml(xml_element, rut_emisor=rut_emisor)
            xml_bytes = _serialize_xml_iso8859(signed_xml)
        except Exception as e:
            logger.error(f"Error generando/firmando XML: {e}")
            return {"success": False, "estado": "error_firma", "mensaje": f"Error de firma: {e}"}

        # 6. Enviar al SII (solo si hay token)
        track_id = None
        estado = "firmado"
        mensaje = "DTE generado y firmado. Envío al SII pendiente de token."

        token = sii_soap_client.get_token(rut_emisor=rut_emisor)
        if token:
            try:
                send_result = self._send_to_sii(xml_bytes, rut_emisor, token)
                track_id = send_result.get("track_id")
                estado   = "enviado" if track_id else "error_envio"
                mensaje  = send_result.get("mensaje", "")
            except Exception as e:
                logger.error(f"Error enviando al SII: {e}")
                estado  = "error_envio"
                mensaje = f"DTE firmado pero error al enviar: {e}"
        else:
            logger.warning("Sin token SII — DTE firmado pero no enviado")

        return {
            "success": track_id is not None or estado == "firmado",
            "folio": folio,
            "track_id": track_id,
            "estado": estado,
            "mensaje": mensaje,
            "xml_firmado_b64": base64.b64encode(xml_bytes).decode() if xml_bytes else None,
        }

    def emit_batch(self, payloads: list[dict]) -> dict:
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

        # Build and sign each DTE individually
        signed_dtes: list[etree._Element] = []
        resultados: list[dict] = []
        errores: list[dict] = []

        for i, payload in enumerate(payloads):
            try:
                result = self._build_and_sign_single_dte(payload)
                if result["success"]:
                    signed_dtes.append(result["signed_element"])
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

        if not signed_dtes:
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

        # Build EnvioDTE envelope
        try:
            envio_xml = self.generator.generate_envio_dte(
                signed_dtes=signed_dtes,
                rut_emisor=rut_emisor,
                rut_envia=rut_envia,
                ambiente=settings.SII_AMBIENTE,
            )
            # Sign the SetDTE element
            set_dte = envio_xml.find(".//{http://www.sii.cl/SiiDte}SetDTE")
            if set_dte is None:
                set_dte = envio_xml.find(".//SetDTE")
            if set_dte is not None:
                certificate_service.sign_xml(set_dte, rut_emisor=rut_emisor)

            envio_bytes = _serialize_xml_iso8859(envio_xml)
        except Exception as e:
            logger.error(f"Error building EnvioDTE: {e}")
            return {
                "success": False,
                "total": len(payloads),
                "emitidos": len(signed_dtes),
                "errores": errores,
                "estado": "error_envio",
                "mensaje": f"DTEs firmados pero error en EnvioDTE: {e}",
            }

        # Send to SII
        track_id = None
        estado = "firmado"
        mensaje = f"EnvioDTE con {len(signed_dtes)} DTEs generado y firmado"

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
                logger.error(f"Error sending EnvioDTE to SII: {e}")
                estado = "error_envio"
                mensaje = f"EnvioDTE firmado pero error al enviar: {e}"
        else:
            logger.warning("No SII token after retry — EnvioDTE signed but not sent")
            estado = "firmado_sin_envio"
            mensaje = (
                f"DTEs firmados pero NO enviados al SII\n\n"
                f"{len(signed_dtes)}/{len(payloads)} DTEs fueron generados y firmados correctamente, "
                f"pero no se pudieron enviar al SII porque no hay token de sesión activo.\n\n"
                f"Para resolver esto:\n"
                f"1. Verifica que el certificado digital esté cargado\n"
                f"2. Verifica que la conexión SII diga \"Conectado\" en el panel inferior\n"
                f"3. Vuelve a subir el archivo del set y procésalo de nuevo"
            )

        return {
            "success": track_id is not None,
            "total": len(payloads),
            "emitidos": len(signed_dtes),
            "errores": errores,
            "track_id": track_id,
            "estado": estado,
            "mensaje": mensaje,
            "xml_envio_b64": base64.b64encode(envio_bytes).decode(),
            "resultados": resultados,
        }

    def _build_and_sign_single_dte(self, payload: dict) -> dict:
        """Build, add TED, and sign a single DTE. Returns the signed element."""
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

        # Add TED
        xml_element = self._add_ted(xml_element, doc, rut_emisor)

        # Sign DTE
        signed_xml = certificate_service.sign_xml(xml_element, rut_emisor=rut_emisor)

        return {
            "success": True,
            "folio": folio,
            "signed_element": signed_xml,
            "monto_neto": totales.get("neto", 0),
            "monto_exe": totales.get("exento", 0),
            "monto_iva": totales.get("iva", 0),
            "monto_total": totales.get("total", 0),
        }

    def _add_ted(self, dte_element: etree._Element, doc: DTEDocumento, rut_emisor: str) -> etree._Element:
        """Add TED (Timbre Electrónico Digital) to the Documento element."""
        caf_data = caf_manager.get_caf(rut_emisor, doc.tipo_dte)
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
            ted = timbre_electronico_service.generate_ted(
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
            tmst = etree.SubElement(documento, "TmstFirma")
            tmst.text = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")

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
        for item in p["items"]:
            if Decimal(str(item.get("precio_unitario", 0))) <= 0:
                return f"Precio unitario debe ser mayor a 0: {item}"
        return None

    def _build_dte_document(self, p: dict, folio: int) -> DTEDocumento:
        emisor = DTEEmisor(
            rut=format_rut(p["rut_emisor"]),
            razon_social=p["razon_social_emisor"],
            giro=p["giro_emisor"],
            direccion=p.get("direccion_emisor", ""),
            comuna=p.get("comuna_emisor", ""),
            ciudad=p.get("ciudad_emisor", "Santiago"),
            actividad_economica=p.get("actividad_economica", 620200),
        )
        receptor = DTEReceptor(
            rut=format_rut(p["rut_receptor"]),
            razon_social=p["razon_social_receptor"],
            giro=p["giro_receptor"],
            direccion=p.get("direccion_receptor", ""),
            comuna=p.get("comuna_receptor", ""),
            ciudad=p.get("ciudad_receptor", "Santiago"),
            email=p.get("email_receptor"),
            ref_tipo_doc=p.get("ref_tipo_doc"),
            ref_folio=p.get("ref_folio"),
            ref_fecha=p.get("ref_fecha"),
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
        return DTEDocumento(
            tipo_dte=p["tipo_dte"],
            folio=folio,
            fecha_emision=p.get("fecha_emision", date.today().strftime("%Y-%m-%d")),
            emisor=emisor,
            receptor=receptor,
            items=items,
            forma_pago=p.get("forma_pago", 1),
            fecha_vencimiento=p.get("fecha_vencimiento"),
            observaciones=p.get("observaciones"),
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
                "archivo": ("envio_dte.xml", xml_bytes, "text/xml"),
            },
            data={
                "rutSender": sender_num,
                "dvSender": sender_dv,
                "rutCompany": company_num,
                "dvCompany": company_dv,
            },
            headers={
                "User-Agent": "CUENTAX/1.0 (DTE SII Chile)",
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
            # Only flag as error if there's no TRACKID tag (some success responses have warnings)
            if not re.search(r'<TRACKID>\d+</TRACKID>', response_text, re.IGNORECASE):
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
                # "Número de Envío: 12345" — require at least 5 digits to avoid matching error codes
                track_match = re.search(
                    r'(?:mero de Env|NUMERO ENVIO)\D*(\d{5,})',
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
