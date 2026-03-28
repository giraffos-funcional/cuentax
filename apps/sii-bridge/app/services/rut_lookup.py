"""
SII RUT Lookup Service
Consulta datos de contribuyente desde el SII usando sesión con cookies.
"""

import logging
import re
import httpx
from typing import Optional

logger = logging.getLogger(__name__)

class RUTLookupResult:
    def __init__(self):
        self.rut: str = ""
        self.razon_social: str = ""
        self.giro: str = ""
        self.actividad_economica: int = 0
        self.actividades: list = []
        self.inicio_actividades: str = ""
        self.es_menor_tamano: bool = False
        self.found: bool = False

    def to_dict(self):
        return {
            "rut": self.rut,
            "razon_social": self.razon_social,
            "giro": self.giro,
            "actividad_economica": self.actividad_economica,
            "actividades": self.actividades,
            "inicio_actividades": self.inicio_actividades,
            "es_menor_tamano": self.es_menor_tamano,
            "found": self.found,
        }


async def lookup_rut_sii(rut: str) -> dict:
    """
    Busca datos de un contribuyente en el SII.
    Uses httpx with session/cookies to handle the SII's cookie requirements.
    """
    cleaned = rut.replace(".", "").replace("-", "").upper()
    body = cleaned[:-1]
    dv = cleaned[-1]
    formatted_rut = f"{body}-{dv}"

    result = RUTLookupResult()
    result.rut = formatted_rut

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-CL,es;q=0.9,en;q=0.8",
    }

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15.0, headers=headers) as client:
            # Step 1: Get session cookie
            session_resp = await client.get("https://www2.sii.cl/stc/noauthz")

            # Step 2: Submit the RUT query with session cookies
            form_data = f"RUT={body}&DV={dv}&PRG=STC&OPC=NOR"
            query_resp = await client.post(
                "https://zeus.sii.cl/cvc_cgi/stc/getstc",
                content=form_data,
                headers={
                    **headers,
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Referer": "https://www2.sii.cl/stc/noauthz",
                    "Origin": "https://www2.sii.cl",
                },
            )

            html = query_resp.text

            # Check for captcha
            if "Captcha" in html or "alert(" in html:
                logger.warning(f"SII captcha detected for RUT {formatted_rut}")
                return result.to_dict()

            # Parse response
            result = _parse_sii_html(html, formatted_rut)
            return result.to_dict()

    except Exception as e:
        logger.error(f"SII RUT lookup failed for {formatted_rut}: {e}")
        return result.to_dict()


def _parse_sii_html(html: str, rut: str) -> RUTLookupResult:
    """Parse the SII HTML response to extract contribuyente data."""
    result = RUTLookupResult()
    result.rut = rut

    # Extract razón social
    match = re.search(r'Nombre\s*o\s*Raz[oó]n\s*Social[^:]*:\s*([^<\n]+)', html, re.IGNORECASE)
    if match:
        result.razon_social = match.group(1).strip()
        result.found = True

    # Extract inicio actividades
    match = re.search(r'Fecha\s*de\s*Inicio\s*de\s*Actividades[^:]*:\s*([^<\n]+)', html, re.IGNORECASE)
    if match:
        result.inicio_actividades = match.group(1).strip()

    # Extract menor tamaño
    match = re.search(r'Empresa\s*de\s*Menor\s*Tama[ñn]o[^:]*:\s*(SI|NO)', html, re.IGNORECASE)
    if match:
        result.es_menor_tamano = match.group(1).upper() == "SI"

    # Extract activities from table
    # Pattern: row number | description | código | categoría | afecta IVA | fecha
    activity_rows = re.findall(
        r'<tr[^>]*>\s*<td[^>]*>\s*\d+\s*</td>\s*<td[^>]*>\s*(.*?)\s*</td>\s*<td[^>]*>\s*(\d{6})\s*</td>\s*<td[^>]*>\s*(.*?)\s*</td>\s*<td[^>]*>\s*(S[iíI]|No)\s*</td>\s*<td[^>]*>\s*([\d-]+)\s*</td>',
        html,
        re.IGNORECASE | re.DOTALL,
    )

    for desc, codigo, categoria, afecta, fecha in activity_rows:
        clean_desc = re.sub(r'<[^>]*>', '', desc).strip()
        result.actividades.append({
            "codigo": int(codigo),
            "descripcion": clean_desc,
            "categoria": re.sub(r'<[^>]*>', '', categoria).strip(),
            "afecta_iva": afecta.upper().startswith("S"),
            "fecha": fecha.strip(),
        })

    if result.actividades:
        result.giro = result.actividades[0]["descripcion"]
        result.actividad_economica = result.actividades[0]["codigo"]

    return result
