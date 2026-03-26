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

import logging
from datetime import date
from decimal import Decimal
from typing import Optional
from lxml import etree

from app.services.dte_generator import DTEXMLGenerator, DTEDocumento, DTEEmisor, DTEReceptor, DTEItem
from app.services.caf_manager import caf_manager
from app.services.certificate import certificate_service
from app.services.sii_soap_client import sii_soap_client
from app.utils.rut import validate_rut, format_rut

logger = logging.getLogger(__name__)


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

        # 2. Verificar certificado
        if not certificate_service.is_loaded:
            return {
                "success": False,
                "estado": "sin_certificado",
                "mensaje": "No hay certificado digital cargado. Configura el certificado en Configuración → Certificado SII.",
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

        # 5. Generar + Firmar XML
        try:
            xml_element = self.generator.generate(doc)
            signed_xml = certificate_service.sign_xml(xml_element)
            xml_bytes   = etree.tostring(signed_xml, encoding="UTF-8", xml_declaration=True)
        except Exception as e:
            logger.error(f"Error generando/firmando XML: {e}")
            return {"success": False, "estado": "error_firma", "mensaje": f"Error de firma: {e}"}

        # 6. Enviar al SII (solo si hay token)
        track_id = None
        estado = "firmado"
        mensaje = "DTE generado y firmado. Envío al SII pendiente de token."

        token = sii_soap_client.get_token()
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

        import base64
        return {
            "success": track_id is not None or estado == "firmado",
            "folio": folio,
            "track_id": track_id,
            "estado": estado,
            "mensaje": mensaje,
            "xml_firmado_b64": base64.b64encode(xml_bytes).decode() if xml_bytes else None,
        }

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
        """Envía el DTE al SII via SOAP."""
        import zeep
        from zeep.transports import Transport

        rut_parts = rut_emisor.replace(".", "").split("-")
        rut_num = rut_parts[0]

        wsdl_url = sii_soap_client._wsdls["upload"]
        Transport_ = Transport(timeout=30)
        client = zeep.Client(wsdl_url, transport=Transport_)

        # El SII espera el archivo adjunto como base64
        import base64
        xml_b64 = base64.b64encode(xml_bytes).decode()

        response = client.service.uploadDTE(
            rutSender=rut_num,
            dvSender=rut_parts[1] if len(rut_parts) > 1 else "0",
            rutCompany=rut_num,
            dvCompany=rut_parts[1] if len(rut_parts) > 1 else "0",
            archivo=xml_b64,
            token=token,
        )

        # Parsear respuesta SII
        from lxml import etree as et
        root = et.fromstring(response.encode() if isinstance(response, str) else response)
        track_id_el = root.find(".//TRACKID") or root.find(".//trackid")
        track_id = track_id_el.text.strip() if track_id_el is not None else None

        return {
            "track_id": track_id,
            "mensaje": f"Track ID: {track_id}" if track_id else "Sin Track ID en respuesta",
            "response_raw": response[:500] if isinstance(response, str) else str(response)[:500],
        }


dte_emission_service = DTEEmissionService()
