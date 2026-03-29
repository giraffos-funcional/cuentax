"""
CUENTAX — Parser del Set de Pruebas SII
==========================================
Parsea el archivo de texto que el SII genera como set de pruebas
para el proceso de certificación.

El SII genera un archivo único por empresa con casos de prueba
que incluyen datos de emisor, receptor, items y montos.

Referencia: https://maullin.sii.cl/cvc_cgi/dte/pe_generar
"""

import logging
import re
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class SetPruebasItem:
    """A line item from the test set."""
    nombre: str
    cantidad: Decimal
    precio_unitario: Decimal
    descuento_pct: Decimal = Decimal("0")
    exento: bool = False
    codigo: Optional[str] = None
    unidad: str = "UN"


@dataclass
class SetPruebasReferencia:
    """Reference to another document (for NC/ND)."""
    tipo_doc_ref: int
    folio_ref: int
    fecha_ref: str
    razon_ref: str


@dataclass
class SetPruebasCase:
    """A single test case (one DTE to generate)."""
    caso: int
    tipo_dte: int
    rut_receptor: str
    razon_social_receptor: str
    giro_receptor: str
    direccion_receptor: str = ""
    comuna_receptor: str = ""
    ciudad_receptor: str = ""
    items: list[SetPruebasItem] = field(default_factory=list)
    forma_pago: int = 1
    referencia: Optional[SetPruebasReferencia] = None
    observaciones: Optional[str] = None


@dataclass
class SetPruebasData:
    """Complete parsed test set."""
    rut_emisor: str
    razon_social_emisor: str
    giro_emisor: str
    direccion_emisor: str
    comuna_emisor: str
    ciudad_emisor: str
    actividad_economica: int
    casos: list[SetPruebasCase] = field(default_factory=list)


class SetPruebasParser:
    """
    Parsea el archivo del set de pruebas del SII.

    El formato es un archivo de texto plano con secciones separadas
    por líneas de guiones. Cada caso de prueba define un DTE con
    receptor, items y opcionalmente referencias.

    El parser es flexible para manejar variaciones en el formato
    que el SII puede generar.
    """

    def parse(self, content: str, emisor_data: dict) -> SetPruebasData:
        """
        Parse the SII test set file content.

        Args:
            content: Raw text content of the test set file
            emisor_data: Issuer data dict with keys:
                rut_emisor, razon_social, giro, direccion, comuna, ciudad,
                actividad_economica

        Returns:
            SetPruebasData with all parsed test cases
        """
        result = SetPruebasData(
            rut_emisor=emisor_data["rut_emisor"],
            razon_social_emisor=emisor_data["razon_social"],
            giro_emisor=emisor_data["giro"],
            direccion_emisor=emisor_data.get("direccion", ""),
            comuna_emisor=emisor_data.get("comuna", ""),
            ciudad_emisor=emisor_data.get("ciudad", "Santiago"),
            actividad_economica=emisor_data.get("actividad_economica", 620200),
        )

        # Normalize line endings
        content = content.replace("\r\n", "\n").replace("\r", "\n")

        # Split into sections by case markers
        cases = self._split_cases(content)

        for case_text in cases:
            try:
                case = self._parse_case(case_text)
                if case:
                    result.casos.append(case)
            except Exception as e:
                logger.warning(f"Error parsing case: {e}. Text: {case_text[:200]}")

        logger.info(
            f"Set de pruebas parsed: {len(result.casos)} cases "
            f"for emisor {result.rut_emisor}"
        )
        return result

    def _split_cases(self, content: str) -> list[str]:
        """Split content into individual test case blocks."""
        # Common patterns: "CASO N", "Caso N", "CASO: N", numbered sections
        # Try splitting by "CASO" pattern first
        pattern = r'(?=(?:CASO|Caso)\s*:?\s*\d+)'
        parts = re.split(pattern, content, flags=re.IGNORECASE)
        cases = [p.strip() for p in parts if p.strip()]

        if len(cases) > 1:
            return cases

        # Fallback: split by separator lines (----, ====, etc.)
        pattern2 = r'\n-{3,}\n|\n={3,}\n|\n\*{3,}\n'
        parts = re.split(pattern2, content)
        cases = [p.strip() for p in parts if p.strip()]

        if len(cases) > 1:
            return cases

        # Last resort: try splitting by "DOCUMENTO" or "DTE" headers
        pattern3 = r'(?=DOCUMENTO\s+\d+|DTE\s+(?:TIPO\s+)?\d+)'
        parts = re.split(pattern3, content, flags=re.IGNORECASE)
        cases = [p.strip() for p in parts if p.strip()]

        return cases if len(cases) > 1 else [content]

    def _parse_case(self, text: str) -> Optional[SetPruebasCase]:
        """Parse a single test case block."""
        lines = text.strip().split("\n")
        if not lines:
            return None

        caso_num = self._extract_number(lines[0], r'(?:CASO|Caso)\s*:?\s*(\d+)')
        tipo_dte = self._extract_field_int(text, r'(?:TIPO\s*DTE|TipoDTE|Tipo\s*Documento)\s*:?\s*(\d+)')

        if not tipo_dte:
            # Try to infer from keywords
            text_upper = text.upper()
            if "FACTURA" in text_upper and "CREDITO" not in text_upper and "DEBITO" not in text_upper:
                tipo_dte = 33
            elif "NOTA DE CREDITO" in text_upper or "NOTA CREDITO" in text_upper:
                tipo_dte = 61
            elif "NOTA DE DEBITO" in text_upper or "NOTA DEBITO" in text_upper:
                tipo_dte = 56
            elif "BOLETA" in text_upper:
                tipo_dte = 39

        if not tipo_dte:
            logger.debug(f"Could not determine tipo_dte for case: {text[:100]}")
            return None

        rut_receptor = self._extract_field(text, r'(?:RUT\s*(?:RECEPTOR|CLIENTE)|RUTRecep)\s*:?\s*([\d.]+-[\dkK])')
        razon_social = self._extract_field(text, r'(?:RAZON\s*SOCIAL|RznSocRecep|Nombre)\s*:?\s*(.+?)(?:\n|$)')
        giro = self._extract_field(text, r'(?:GIRO|GiroRecep)\s*:?\s*(.+?)(?:\n|$)')
        direccion = self._extract_field(text, r'(?:DIRECCION|DirRecep)\s*:?\s*(.+?)(?:\n|$)')
        comuna = self._extract_field(text, r'(?:COMUNA|CmnaRecep)\s*:?\s*(.+?)(?:\n|$)')
        ciudad = self._extract_field(text, r'(?:CIUDAD|CiudadRecep)\s*:?\s*(.+?)(?:\n|$)')

        items = self._parse_items(text)

        referencia = None
        ref_tipo = self._extract_field_int(text, r'(?:TIPO\s*DOC\s*REF|TpoDocRef)\s*:?\s*(\d+)')
        ref_folio = self._extract_field_int(text, r'(?:FOLIO\s*REF|FolioRef)\s*:?\s*(\d+)')
        ref_fecha = self._extract_field(text, r'(?:FECHA\s*REF|FchRef)\s*:?\s*(\d{4}-\d{2}-\d{2})')
        ref_razon = self._extract_field(text, r'(?:RAZON\s*REF|RazonRef)\s*:?\s*(.+?)(?:\n|$)')
        if ref_tipo and ref_folio:
            referencia = SetPruebasReferencia(
                tipo_doc_ref=ref_tipo,
                folio_ref=ref_folio,
                fecha_ref=ref_fecha or "",
                razon_ref=ref_razon or "Corrige documento",
            )

        return SetPruebasCase(
            caso=caso_num or 0,
            tipo_dte=tipo_dte,
            rut_receptor=rut_receptor or "66666666-6",
            razon_social_receptor=razon_social or "Receptor Prueba",
            giro_receptor=giro or "Servicios",
            direccion_receptor=direccion or "",
            comuna_receptor=comuna or "",
            ciudad_receptor=ciudad or "Santiago",
            items=items,
            referencia=referencia,
        )

    def _parse_items(self, text: str) -> list[SetPruebasItem]:
        """Extract items from a case block."""
        items = []

        # Pattern 1: Tabular format (Nombre | Cantidad | Precio | ...)
        table_pattern = r'(?:DETALLE|ITEMS?|Detalle).*?\n((?:.*?\n)*?)(?:\n\s*\n|TOTAL|REFERENCIA|$)'
        table_match = re.search(table_pattern, text, re.IGNORECASE)

        if table_match:
            table_text = table_match.group(1)
            for line in table_text.split("\n"):
                line = line.strip()
                if not line or line.startswith("-") or line.startswith("="):
                    continue
                item = self._parse_item_line(line)
                if item:
                    items.append(item)

        if items:
            return items

        # Pattern 2: Key-value item blocks
        item_blocks = re.findall(
            r'(?:ITEM|Item|Línea)\s*\d+\s*:?\s*(.*?)(?=(?:ITEM|Item|Línea)\s*\d+|TOTAL|REFERENCIA|$)',
            text, re.IGNORECASE | re.DOTALL,
        )
        for block in item_blocks:
            nombre = self._extract_field(block, r'(?:Nombre|NmbItem|Descripcion)\s*:?\s*(.+?)(?:\n|$)')
            cantidad = self._extract_field(block, r'(?:Cantidad|QtyItem|Cant)\s*:?\s*([\d.]+)')
            precio = self._extract_field(block, r'(?:Precio|PrcItem|P\.\s*Unit)\s*:?\s*([\d.]+)')
            exento_str = self._extract_field(block, r'(?:Exento|IndExe)\s*:?\s*(SI|1|True)', flags=re.IGNORECASE)

            if nombre and precio:
                items.append(SetPruebasItem(
                    nombre=nombre.strip(),
                    cantidad=Decimal(cantidad) if cantidad else Decimal("1"),
                    precio_unitario=Decimal(precio),
                    exento=bool(exento_str),
                ))

        if items:
            return items

        # Pattern 3: Simple lines with numbers (fallback)
        number_lines = re.findall(r'^(.+?)\s+(\d+)\s+([\d.]+)\s*$', text, re.MULTILINE)
        for desc, qty, price in number_lines:
            desc = desc.strip()
            if len(desc) > 2 and not desc.startswith(("CASO", "TIPO", "RUT", "RAZON", "GIRO")):
                items.append(SetPruebasItem(
                    nombre=desc,
                    cantidad=Decimal(qty),
                    precio_unitario=Decimal(price),
                ))

        # If nothing worked, create a default item
        if not items:
            logger.debug("No items found, creating default item")
            items.append(SetPruebasItem(
                nombre="Servicio de prueba",
                cantidad=Decimal("1"),
                precio_unitario=Decimal("100000"),
            ))

        return items

    def _parse_item_line(self, line: str) -> Optional[SetPruebasItem]:
        """Parse a single tabular item line."""
        # Try pipe-separated
        if "|" in line:
            parts = [p.strip() for p in line.split("|") if p.strip()]
            if len(parts) >= 3:
                return SetPruebasItem(
                    nombre=parts[0],
                    cantidad=Decimal(parts[1]) if self._is_number(parts[1]) else Decimal("1"),
                    precio_unitario=Decimal(parts[2]) if self._is_number(parts[2]) else Decimal("0"),
                    exento="exento" in line.lower() or "exe" in line.lower(),
                )

        # Try tab-separated
        if "\t" in line:
            parts = [p.strip() for p in line.split("\t") if p.strip()]
            if len(parts) >= 3:
                return SetPruebasItem(
                    nombre=parts[0],
                    cantidad=Decimal(parts[1]) if self._is_number(parts[1]) else Decimal("1"),
                    precio_unitario=Decimal(parts[2]) if self._is_number(parts[2]) else Decimal("0"),
                )

        # Try space-separated with description at start
        match = re.match(r'^(.+?)\s{2,}(\d+)\s+([\d.]+)', line)
        if match:
            return SetPruebasItem(
                nombre=match.group(1).strip(),
                cantidad=Decimal(match.group(2)),
                precio_unitario=Decimal(match.group(3)),
            )

        return None

    @staticmethod
    def _extract_number(text: str, pattern: str) -> Optional[int]:
        match = re.search(pattern, text, re.IGNORECASE)
        return int(match.group(1)) if match else None

    @staticmethod
    def _extract_field(text: str, pattern: str, flags: int = 0) -> Optional[str]:
        match = re.search(pattern, text, re.IGNORECASE | flags)
        return match.group(1).strip() if match else None

    @staticmethod
    def _extract_field_int(text: str, pattern: str) -> Optional[int]:
        match = re.search(pattern, text, re.IGNORECASE)
        return int(match.group(1)) if match else None

    @staticmethod
    def _is_number(s: str) -> bool:
        try:
            Decimal(s.replace(",", "."))
            return True
        except Exception:
            return False

    def to_payloads(self, data: SetPruebasData) -> list[dict]:
        """
        Convert parsed test set to emission payloads ready for DTEEmissionService.

        Returns a list of dicts matching the emit() payload format.
        """
        payloads = []

        for case in data.casos:
            payload: dict = {
                "tipo_dte": case.tipo_dte,
                "rut_emisor": data.rut_emisor,
                "razon_social_emisor": data.razon_social_emisor,
                "giro_emisor": data.giro_emisor,
                "direccion_emisor": data.direccion_emisor,
                "comuna_emisor": data.comuna_emisor,
                "ciudad_emisor": data.ciudad_emisor,
                "actividad_economica": data.actividad_economica,
                "rut_receptor": case.rut_receptor,
                "razon_social_receptor": case.razon_social_receptor,
                "giro_receptor": case.giro_receptor,
                "direccion_receptor": case.direccion_receptor,
                "comuna_receptor": case.comuna_receptor,
                "ciudad_receptor": case.ciudad_receptor,
                "forma_pago": case.forma_pago,
                "items": [
                    {
                        "nombre": item.nombre,
                        "cantidad": str(item.cantidad),
                        "precio_unitario": str(item.precio_unitario),
                        "descuento_pct": str(item.descuento_pct),
                        "exento": item.exento,
                        "codigo": item.codigo,
                        "unidad": item.unidad,
                    }
                    for item in case.items
                ],
            }

            if case.referencia:
                payload["ref_tipo_doc"] = case.referencia.tipo_doc_ref
                payload["ref_folio"] = case.referencia.folio_ref
                payload["ref_fecha"] = case.referencia.fecha_ref
                payload["ref_motivo"] = case.referencia.razon_ref

            if case.observaciones:
                payload["observaciones"] = case.observaciones

            payloads.append(payload)

        logger.info(f"Generated {len(payloads)} emission payloads from test set")
        return payloads


# Singleton
set_pruebas_parser = SetPruebasParser()
