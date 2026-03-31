"""
CUENTAX — Servicio de Emision Libro de Compras/Ventas
=======================================================
Orquesta el flujo completo de generacion y envio de Libros al SII:

1. Construir LibroData desde DTEs emitidos (ventas) o parsed compras
2. Generar XML via libro_generator
3. Firmar EnvioLibro via certificate_service
4. Enviar al SII via DTEUpload
5. Retornar track_id

Libro de Ventas (IEV): Built from the EnvioDTE XML of the set basico.
Libro de Compras (IEC): Built from parsed compras entries in the test set.
"""

import base64
import logging
import re
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from lxml import etree

from app.services.libro_generator import LibroXMLGenerator, LibroData, LibroDetalle
from app.services.certificate import certificate_service
from app.services.sii_soap_client import sii_soap_client
from app.utils.rut import format_rut, clean_rut
from app.core.config import settings

logger = logging.getLogger(__name__)

SII_DTE_NS = "http://www.sii.cl/SiiDte"
IVA_RATE = Decimal("0.19")

# Mapping from paper/electronic document names to SII tipo_doc codes
COMPRA_TIPO_DOC_MAP = {
    "FACTURA": 30,
    "FACTURA ELECTRONICA": 33,
    "NOTA DE CREDITO": 60,
    "NOTA DE CREDITO ELECTRONICA": 61,
    "FACTURA DE COMPRA ELECTRONICA": 46,
    "NOTA DE DEBITO": 55,
    "NOTA DE DEBITO ELECTRONICA": 56,
    "FACTURA EXENTA ELECTRONICA": 34,
}

# Document types that are credit notes (amounts subtract in totals)
NOTA_CREDITO_TIPOS = {60, 61}


class LibroEmissionService:
    """
    High-level service for generating, signing, and sending
    Libro de Compras and Libro de Ventas to the SII.
    """

    def __init__(self):
        self.generator = LibroXMLGenerator()

    # ── Public API ───────────────────────────────────────────────

    def emit_libro_ventas(
        self,
        envio_dte_xml_b64: str,
        rut_emisor: str,
        periodo: str,
        folio_notificacion: str,
    ) -> dict:
        """
        Generate and send Libro de Ventas from an EnvioDTE XML.

        Args:
            envio_dte_xml_b64: Base64-encoded EnvioDTE XML (from batch emission)
            rut_emisor: RUT of the issuing company
            periodo: Tax period "YYYY-MM"
            folio_notificacion: SII notification folio (from SET LIBRO DE VENTAS header)

        Returns:
            Result dict with track_id, xml_b64, etc.
        """
        try:
            detalles = self._extract_detalles_from_envio_dte(envio_dte_xml_b64)
        except Exception as e:
            logger.error(f"Error extracting detalles from EnvioDTE: {e}")
            return {
                "success": False,
                "tipo": "VENTA",
                "estado": "error",
                "mensaje": f"Error parsing EnvioDTE XML: {e}",
            }

        if not detalles:
            return {
                "success": False,
                "tipo": "VENTA",
                "estado": "error",
                "mensaje": "No DTE documents found in EnvioDTE XML",
            }

        rut_envia = self._get_rut_envia(rut_emisor)

        libro_data = LibroData(
            tipo_operacion="VENTA",
            rut_emisor_libro=format_rut(rut_emisor, dots=False),
            rut_envia=rut_envia,
            periodo_tributario=periodo,
            fch_resol="2014-08-22",
            nro_resol="0",
            tipo_libro="ESPECIAL",
            tipo_envio="TOTAL",
            folio_notificacion=folio_notificacion,
            detalles=detalles,
        )

        return self._generate_sign_send(libro_data, rut_emisor)

    def emit_libro_ventas_from_resultados(
        self,
        resultados: list[dict],
        rut_emisor: str,
        periodo: str,
        folio_notificacion: str,
        fecha_doc: str = "",
    ) -> dict:
        """
        Generate and send Libro de Ventas from batch emission resultados.

        This is an alternative to emit_libro_ventas() when the EnvioDTE XML
        is not available (e.g., SET BASICO already submitted in prior session).

        Each resultado dict has: caso, tipo_dte, folio, monto_neto, monto_exe,
        monto_iva, monto_total, rut_receptor, razon_social_receptor
        """
        if not fecha_doc:
            from datetime import date as _date
            fecha_doc = _date.today().strftime("%Y-%m-%d")

        detalles = []
        for r in resultados:
            tipo_dte = r.get("tipo_dte", 0)
            folio = r.get("folio", 0)
            if not tipo_dte or not folio:
                continue

            mnt_neto = r.get("monto_neto", 0)
            mnt_exe = r.get("monto_exe", 0)
            mnt_iva = r.get("monto_iva", 0)
            mnt_total = r.get("monto_total", 0)

            es_nc = tipo_dte in (61,)

            detalles.append(LibroDetalle(
                tipo_doc=tipo_dte,
                nro_doc=folio,
                tasa_imp=Decimal("19") if mnt_neto else Decimal("0"),
                fch_doc=fecha_doc,
                rut_doc=r.get("rut_receptor", "66666666-6"),
                rzn_soc=r.get("razon_social_receptor", "Receptor Prueba"),
                mnt_exe=mnt_exe,
                mnt_neto=mnt_neto,
                mnt_iva=mnt_iva,
                mnt_total=mnt_total,
                es_nota_credito=es_nc,
            ))

        if not detalles:
            return {
                "success": False,
                "tipo": "VENTA",
                "estado": "error",
                "mensaje": "No DTEs found in resultados",
            }

        rut_envia = self._get_rut_envia(rut_emisor)

        libro_data = LibroData(
            tipo_operacion="VENTA",
            rut_emisor_libro=format_rut(rut_emisor, dots=False),
            rut_envia=rut_envia,
            periodo_tributario=periodo,
            fch_resol="2014-08-22",
            nro_resol="0",
            tipo_libro="ESPECIAL",
            tipo_envio="TOTAL",
            folio_notificacion=folio_notificacion,
            detalles=detalles,
        )

        return self._generate_sign_send(libro_data, rut_emisor)

    def emit_libro_compras(
        self,
        compras_entries: list[dict],
        rut_emisor: str,
        periodo: str,
        folio_notificacion: str,
        fct_prop: Optional[Decimal] = None,
        fecha_doc: Optional[str] = None,
    ) -> dict:
        """
        Generate and send Libro de Compras from parsed compras entries.

        Args:
            compras_entries: List of dicts with compras data from parser
            rut_emisor: RUT of the issuing company
            periodo: Tax period "YYYY-MM"
            folio_notificacion: SII notification folio
            fct_prop: Factor de proporcionalidad for IVA uso comun
            fecha_doc: Date for documents (defaults to today)

        Returns:
            Result dict with track_id, xml_b64, etc.
        """
        if not fecha_doc:
            fecha_doc = date.today().strftime("%Y-%m-%d")

        detalles = self._build_compras_detalles(compras_entries, fecha_doc, rut_emisor)

        if not detalles:
            return {
                "success": False,
                "tipo": "COMPRA",
                "estado": "error",
                "mensaje": "No compras entries to process",
            }

        rut_envia = self._get_rut_envia(rut_emisor)

        libro_data = LibroData(
            tipo_operacion="COMPRA",
            rut_emisor_libro=format_rut(rut_emisor, dots=False),
            rut_envia=rut_envia,
            periodo_tributario=periodo,
            fch_resol="2014-08-22",
            nro_resol="0",
            tipo_libro="ESPECIAL",
            tipo_envio="TOTAL",
            folio_notificacion=folio_notificacion,
            detalles=detalles,
            fct_prop=fct_prop,
        )

        return self._generate_sign_send(libro_data, rut_emisor)

    # ── Internal: Generate, Sign, Send ───────────────────────────

    def _generate_sign_send(self, libro_data: LibroData, rut_emisor: str) -> dict:
        """Generate XML, sign, and send to SII."""
        tipo = libro_data.tipo_operacion

        # 1. Generate XML
        try:
            libro_xml = self.generator.generate(libro_data)
        except Exception as e:
            logger.error(f"Error generating Libro {tipo} XML: {e}")
            return {
                "success": False,
                "tipo": tipo,
                "estado": "error_generacion",
                "mensaje": f"Error generating XML: {e}",
            }

        # 2. Sign the EnvioLibro element (inner element with ID="SetDoc")
        try:
            envio_libro = libro_xml.find(
                ".//{%s}EnvioLibro" % SII_DTE_NS
            )
            if envio_libro is None:
                envio_libro = libro_xml.find(".//EnvioLibro")
            if envio_libro is None:
                raise ValueError("EnvioLibro element not found in generated XML")

            certificate_service.sign_xml(envio_libro, rut_emisor=rut_emisor)
            xml_bytes = etree.tostring(
                libro_xml, encoding="ISO-8859-1", xml_declaration=True
            )
        except Exception as e:
            logger.error(f"Error signing Libro {tipo}: {e}")
            return {
                "success": False,
                "tipo": tipo,
                "estado": "error_firma",
                "mensaje": f"Error signing: {e}",
            }

        # 3. Send to SII
        track_id = None
        estado = "firmado"
        mensaje = f"Libro de {tipo.title()} generado y firmado"

        token = sii_soap_client.get_token(rut_emisor=rut_emisor)
        if not token:
            logger.info("Token not available for libro, retrying with force_refresh...")
            token = sii_soap_client.get_token(
                force_refresh=True, rut_emisor=rut_emisor
            )

        send_response_raw = None
        if token:
            try:
                send_result = self._send_to_sii(xml_bytes, rut_emisor, token)
                track_id = send_result.get("track_id")
                send_response_raw = send_result.get("response_raw")
                estado = "enviado" if track_id else "error_envio"
                mensaje = send_result.get("mensaje", "")
                if not track_id:
                    mensaje += (
                        f" | SII status: {send_result.get('status')}"
                        f" | response: {send_response_raw}"
                    )
            except Exception as e:
                logger.error(f"Error sending Libro {tipo} to SII: {e}")
                estado = "error_envio"
                mensaje = f"Libro firmado pero error al enviar: {e}"
        else:
            logger.warning(f"No SII token for Libro {tipo}")
            estado = "firmado_sin_envio"
            mensaje = (
                f"Libro de {tipo.title()} firmado pero NO enviado (sin token SII)"
            )

        xml_b64 = base64.b64encode(xml_bytes).decode()

        return {
            "success": track_id is not None,
            "tipo": tipo,
            "track_id": track_id,
            "estado": estado,
            "mensaje": mensaje,
            "xml_b64": xml_b64,
            "total_detalles": len(libro_data.detalles),
            "periodo": libro_data.periodo_tributario,
            "folio_notificacion": libro_data.folio_notificacion,
        }

    # ── Internal: Extract from EnvioDTE ──────────────────────────

    def _extract_detalles_from_envio_dte(
        self, envio_dte_xml_b64: str
    ) -> list[LibroDetalle]:
        """
        Parse the EnvioDTE XML and extract per-DTE data
        as LibroDetalle entries for the Libro de Ventas.
        """
        xml_bytes = base64.b64decode(envio_dte_xml_b64)
        root = etree.fromstring(xml_bytes)

        detalles = []
        # Find all DTE elements
        dtes = root.findall(".//{%s}DTE" % SII_DTE_NS)
        if not dtes:
            dtes = root.findall(".//DTE")

        for dte in dtes:
            try:
                det = self._parse_dte_for_libro(dte)
                if det:
                    detalles.append(det)
            except Exception as e:
                logger.warning(f"Error parsing DTE for libro: {e}")

        logger.info(
            f"Extracted {len(detalles)} detalles from EnvioDTE for Libro de Ventas"
        )
        return detalles

    def _parse_dte_for_libro(self, dte: etree._Element) -> Optional[LibroDetalle]:
        """Extract LibroDetalle from a single DTE element."""
        ns = SII_DTE_NS

        def _find_text(parent, tag):
            el = parent.find(f".//{{{ns}}}{tag}")
            if el is None:
                el = parent.find(f".//{tag}")
            return el.text.strip() if el is not None and el.text else ""

        tipo_dte = int(_find_text(dte, "TipoDTE") or "0")
        if not tipo_dte:
            return None

        folio = int(_find_text(dte, "Folio") or "0")
        fecha = _find_text(dte, "FchEmis")
        rut_receptor = _find_text(dte, "RUTRecep")
        rzn_soc = _find_text(dte, "RznSocRecep")

        mnt_neto = int(_find_text(dte, "MntNeto") or "0")
        mnt_exe = int(_find_text(dte, "MntExe") or "0")
        mnt_iva = int(_find_text(dte, "IVA") or "0")
        mnt_total = int(_find_text(dte, "MntTotal") or "0")

        es_nc = tipo_dte in (61,)

        return LibroDetalle(
            tipo_doc=tipo_dte,
            nro_doc=folio,
            tasa_imp=Decimal("19") if mnt_neto else Decimal("0"),
            fch_doc=fecha,
            rut_doc=rut_receptor,
            rzn_soc=rzn_soc,
            mnt_exe=mnt_exe,
            mnt_neto=mnt_neto,
            mnt_iva=mnt_iva,
            mnt_total=mnt_total,
            es_nota_credito=es_nc,
        )

    # ── Internal: Build Compras Detalles ─────────────────────────

    def _build_compras_detalles(
        self,
        entries: list[dict],
        fecha_doc: str,
        rut_emisor: str,
    ) -> list[LibroDetalle]:
        """
        Build LibroDetalle list from parsed compras entries.

        Each entry dict has:
            tipo_doc_nombre: str (e.g. "FACTURA", "FACTURA ELECTRONICA")
            folio: int
            observaciones: str
            mnt_exe: int
            mnt_afecto: int
        """
        detalles = []

        for entry in entries:
            tipo_nombre = entry["tipo_doc_nombre"].upper().strip()
            tipo_doc = COMPRA_TIPO_DOC_MAP.get(tipo_nombre)
            if tipo_doc is None:
                logger.warning(
                    f"Unknown compra document type: '{tipo_nombre}', skipping"
                )
                continue

            folio = entry["folio"]
            mnt_exe = entry.get("mnt_exe", 0)
            mnt_afecto = entry.get("mnt_afecto", 0)
            observaciones = entry.get("observaciones", "").upper()

            # Calculate IVA from monto afecto
            mnt_neto = mnt_afecto
            mnt_iva = int(
                (Decimal(str(mnt_afecto)) * IVA_RATE).quantize(
                    Decimal("1"), rounding=ROUND_HALF_UP
                )
            )
            mnt_total = mnt_neto + mnt_iva + mnt_exe

            es_nc = tipo_doc in NOTA_CREDITO_TIPOS

            # Determine IVA classification based on observaciones
            iva_propio = 0
            iva_uso_comun = 0
            iva_ret_total = 0
            iva_no_retenido = 0

            if "RETENCION TOTAL" in observaciones or "RETENCI" in observaciones:
                # Factura de compra con retencion total del IVA
                iva_ret_total = mnt_iva
                iva_no_retenido = 0
            elif "USO COMUN" in observaciones:
                # IVA uso comun
                iva_uso_comun = mnt_iva
            elif "ENTREGA GRATUITA" in observaciones:
                # Entrega gratuita: IVA goes to no retenido (no credit)
                iva_no_retenido = mnt_iva
            elif "CREDITO" in observaciones or "GIRO" in observaciones:
                # Regular purchase with right to credit
                iva_propio = mnt_iva
            elif "DESCUENTO" in observaciones:
                # NC por descuento: same classification as original
                iva_propio = mnt_iva
            else:
                # Default: IVA propio
                iva_propio = mnt_iva

            # For emisor's compras, the RUT is the supplier (we use a generic one for cert)
            rut_proveedor = "55555555-5"

            detalles.append(
                LibroDetalle(
                    tipo_doc=tipo_doc,
                    nro_doc=folio,
                    tasa_imp=Decimal("19") if mnt_neto else Decimal("0"),
                    fch_doc=fecha_doc,
                    rut_doc=rut_proveedor,
                    rzn_soc="Proveedor Prueba",
                    mnt_exe=mnt_exe,
                    mnt_neto=mnt_neto,
                    mnt_iva=mnt_iva,
                    mnt_total=mnt_total,
                    iva_propio=iva_propio,
                    iva_uso_comun=iva_uso_comun,
                    iva_ret_total=iva_ret_total,
                    iva_no_retenido=iva_no_retenido,
                    es_nota_credito=es_nc,
                )
            )

        logger.info(f"Built {len(detalles)} compras detalles")
        return detalles

    # ── Internal: Send to SII ────────────────────────────────────

    def _send_to_sii(
        self, xml_bytes: bytes, rut_emisor: str, token: str
    ) -> dict:
        """Send the Libro XML to SII via HTTP multipart upload (DTEUpload)."""
        import requests as req
        from app.services.dte_emission import DTEEmissionService

        # rutCompany = the company
        company_parts = format_rut(rut_emisor, dots=False).split("-")
        company_num = company_parts[0]
        company_dv = company_parts[1] if len(company_parts) > 1 else "0"

        # rutSender = the certificate holder (person sending), NOT the company
        rut_envia = self._get_rut_envia(rut_emisor)
        sender_parts = rut_envia.split("-")
        sender_num = sender_parts[0]
        sender_dv = sender_parts[1] if len(sender_parts) > 1 else "0"

        endpoint = sii_soap_client._wsdls["upload"]
        proxy_url = sii_soap_client._proxy_url
        proxies = {"http": proxy_url, "https": proxy_url} if proxy_url else None

        logger.info(
            f"Sending Libro to SII: endpoint={endpoint}, "
            f"sender={sender_num}-{sender_dv}, company={company_num}-{company_dv}"
        )

        resp = req.post(
            endpoint,
            files={
                "archivo": ("envio_libro.xml", xml_bytes, "text/xml"),
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
            raise Exception(
                f"SII uploadLibro HTTP {resp.status_code}: {resp.text[:300]}"
            )

        response_text = resp.text
        logger.info(
            f"SII uploadLibro response ({len(response_text)} bytes): "
            f"{response_text[:2000]}"
        )

        # Reuse the robust parser from DTEEmissionService
        return DTEEmissionService._parse_upload_response(response_text)

    # ── Internal: RUT helpers ────────────────────────────────────

    def _get_rut_envia(self, rut_emisor: str) -> str:
        """Get the RUT of the certificate holder (person sending)."""
        normalized = clean_rut(rut_emisor)
        rut_titular = certificate_service._empresa_to_titular.get(normalized)
        if rut_titular:
            return format_rut(rut_titular, dots=False)
        return format_rut(rut_emisor, dots=False)


# Singleton
libro_emission_service = LibroEmissionService()
