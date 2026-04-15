"""
CUENTAX — Parser del Set de Pruebas SII
==========================================
Parsea el archivo de texto que el SII genera como set de pruebas
para el proceso de certificación.

El SII genera un archivo único por empresa con casos de prueba
que incluyen datos de emisor, receptor, items y montos.

Formato SII (SET BASICO):
  CASO XXXXXXX-N   (N = sub-número 1..8)
  ==============
  DOCUMENTO    FACTURA ELECTRONICA | NOTA DE CREDITO ELECTRONICA | etc
  REFERENCIA   <tipo doc> CORRESPONDIENTE A CASO XXXXXXX-M
  RAZON REFERENCIA   <texto>
  ITEM         CANTIDAD    PRECIO UNITARIO    [DESCUENTO ITEM]
  <nombre>     <qty>       <precio>           [<pct>%]
  DESCUENTO GLOBAL ITEMES AFECTOS   <pct>%

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
    folio_ref: int  # 0 = unresolved (to be set during emission)
    fecha_ref: str
    razon_ref: str


@dataclass
class SetPruebasCase:
    """A single test case (one DTE to generate)."""
    caso: int              # Full case number (e.g. 4756304)
    caso_sub: int          # Sub-number (e.g. 1 in "4756304-1")
    tipo_dte: int
    rut_receptor: str
    razon_social_receptor: str
    giro_receptor: str
    direccion_receptor: str = "Santiago"
    comuna_receptor: str = "Santiago"
    ciudad_receptor: str = "Santiago"
    items: list[SetPruebasItem] = field(default_factory=list)
    forma_pago: int = 1
    referencia: Optional[SetPruebasReferencia] = None
    observaciones: Optional[str] = None
    # Reference to another case (sub-number) for folio resolution
    _ref_caso_sub: Optional[int] = None
    # Global discount on afectos (percentage)
    descuento_global_pct: Decimal = Decimal("0")


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
    atencion: str = ""  # SET BASICO numero de atencion
    casos: list[SetPruebasCase] = field(default_factory=list)


# Maps SII document names to tipo_dte codes
_DOC_TYPES = {
    "FACTURA ELECTRONICA": 33,
    "FACTURA": 33,
    "NOTA DE CREDITO ELECTRONICA": 61,
    "NOTA DE CREDITO": 61,
    "NOTA DE DEBITO ELECTRONICA": 56,
    "NOTA DE DEBITO": 56,
    "BOLETA ELECTRONICA": 39,
    "FACTURA NO AFECTA O EXENTA ELECTRONICA": 34,
    "FACTURA DE COMPRA ELECTRONICA": 46,
    "GUIA DE DESPACHO ELECTRONICA": 52,
    "GUIA DE DESPACHO": 52,
}

# Maps reference document names to tipo_dte codes
_REF_DOC_TYPES = {
    "FACTURA ELECTRONICA": 33,
    "FACTURA": 33,
    "NOTA DE CREDITO ELECTRONICA": 61,
    "NOTA DE CREDITO": 61,
    "NOTA DE DEBITO ELECTRONICA": 56,
    "NOTA DE DEBITO": 56,
}


class SetPruebasParser:
    """
    Parsea el archivo del set de pruebas del SII.

    The SII test set uses a specific format with CASO sections,
    tab-separated item tables, and references between cases.
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
            direccion_emisor=emisor_data.get("direccion", "Santiago"),
            comuna_emisor=emisor_data.get("comuna", "Santiago"),
            ciudad_emisor=emisor_data.get("ciudad", "Santiago"),
            actividad_economica=emisor_data.get("actividad_economica", 620200),
        )

        content = content.replace("\r\n", "\n").replace("\r", "\n")

        # Extract SET BASICO atencion number
        atencion_match = re.search(
            r"SET BASICO\s*-\s*NUMERO DE ATENCION:\s*(\d+)", content, re.IGNORECASE
        )
        if atencion_match:
            result.atencion = atencion_match.group(1)

        # Extract only the SET BASICO section (stop at SET LIBRO DE VENTAS)
        basico_end = re.search(r"\n-{3,}\n.*?SET LIBRO DE VENTAS", content, re.IGNORECASE)
        basico_content = content[:basico_end.start()] if basico_end else content

        # Split into individual case blocks
        cases_raw = self._split_cases(basico_content)

        for case_text in cases_raw:
            try:
                case = self._parse_case(case_text)
                if case:
                    result.casos.append(case)
            except Exception as e:
                logger.warning(f"Error parsing case: {e}. Text: {case_text[:200]}")

        # Resolve NC/ND items from referenced cases
        self._resolve_references(result.casos)

        logger.info(
            f"Set de pruebas parsed: {len(result.casos)} cases "
            f"for emisor {result.rut_emisor}"
        )
        return result

    def _split_cases(self, content: str) -> list[str]:
        """Split content into individual test case blocks by CASO headers."""
        # Split at each line starting with "CASO <number>-<sub>"
        # Use \n to anchor — avoids splitting on "CASO" inside reference text
        parts = re.split(r'\n(?=CASO\s+\d+-\d+)', content)
        cases = []
        for p in parts:
            p = p.strip()
            if p and re.match(r'CASO\s+\d+-\d+', p):
                cases.append(p)
        return cases

    def _parse_case(self, text: str) -> Optional[SetPruebasCase]:
        """Parse a single test case block."""
        lines = text.strip().split("\n")
        if not lines:
            return None

        # Extract case number: "CASO 4756304-1"
        header_match = re.match(r'CASO\s+(\d+)-(\d+)', lines[0])
        if not header_match:
            return None

        caso_num = int(header_match.group(1))
        caso_sub = int(header_match.group(2))

        # Extract DOCUMENTO type
        tipo_dte = self._extract_documento_type(text)
        if not tipo_dte:
            logger.debug(f"Could not determine tipo_dte for CASO {caso_num}-{caso_sub}")
            return None

        # Extract REFERENCIA info (for NC/ND)
        ref_caso_sub = None
        ref_tipo_doc = None
        ref_razon = None
        ref_match = re.search(
            r'REFERENCIA\s+(.+?)\s+CORRESPONDIENTE\s+A\s+CASO\s+\d+-(\d+)',
            text, re.IGNORECASE
        )
        if ref_match:
            ref_doc_text = ref_match.group(1).strip()
            ref_caso_sub = int(ref_match.group(2))
            ref_tipo_doc = self._doc_name_to_tipo(ref_doc_text, _REF_DOC_TYPES)

        razon_match = re.search(r'RAZON\s+REFERENCIA\s+(.+?)(?:\n|$)', text, re.IGNORECASE)
        if razon_match:
            ref_razon = razon_match.group(1).strip()

        # Build referencia (folio=0 means unresolved)
        referencia = None
        if ref_tipo_doc and ref_caso_sub is not None:
            referencia = SetPruebasReferencia(
                tipo_doc_ref=ref_tipo_doc,
                folio_ref=0,  # Resolved later during emission
                fecha_ref="",  # Set during emission
                razon_ref=ref_razon or "Corrige documento",
            )

        # Parse items
        items = self._parse_items(text)

        # Parse global discount
        descuento_global = Decimal("0")
        desc_match = re.search(
            r'DESCUENTO\s+GLOBAL\s+ITEMES?\s+AFECTOS?\s+(\d+)%',
            text, re.IGNORECASE
        )
        if desc_match:
            descuento_global = Decimal(desc_match.group(1))

        return SetPruebasCase(
            caso=caso_num,
            caso_sub=caso_sub,
            tipo_dte=tipo_dte,
            rut_receptor="66666666-6",
            razon_social_receptor="Receptor Prueba SII",
            giro_receptor="Servicios Informaticos",
            direccion_receptor="Santiago",
            comuna_receptor="Santiago",
            ciudad_receptor="Santiago",
            items=items,
            referencia=referencia,
            _ref_caso_sub=ref_caso_sub,
            descuento_global_pct=descuento_global,
        )

    def _extract_documento_type(self, text: str) -> Optional[int]:
        """Extract tipo_dte from the DOCUMENTO line."""
        doc_match = re.search(r'DOCUMENTO\s+(.+?)(?:\n|$)', text)
        if not doc_match:
            return None
        doc_text = doc_match.group(1).strip()
        return self._doc_name_to_tipo(doc_text, _DOC_TYPES)

    @staticmethod
    def _doc_name_to_tipo(text: str, mapping: dict) -> Optional[int]:
        """Convert a SII document name to its tipo code."""
        text_upper = text.upper().strip()
        # Try longest match first
        for name in sorted(mapping.keys(), key=len, reverse=True):
            if name in text_upper:
                return mapping[name]
        return None

    def _parse_items(self, text: str) -> list[SetPruebasItem]:
        """Extract items from a case block. Handles SII tab-separated format."""
        items = []
        lines = text.split("\n")

        # Find the item header line (ITEM ... CANTIDAD ... PRECIO UNITARIO)
        header_idx = None
        has_precio = False
        has_descuento = False
        for i, line in enumerate(lines):
            if re.match(r'\s*ITEM\s', line, re.IGNORECASE) and \
               re.search(r'CANTIDAD', line, re.IGNORECASE):
                header_idx = i
                has_precio = bool(re.search(r'PRECIO', line, re.IGNORECASE))
                has_descuento = bool(re.search(r'DESCUENTO', line, re.IGNORECASE))
                break

        if header_idx is None:
            return items

        # Parse item lines after the header
        for line in lines[header_idx + 1:]:
            stripped = line.strip()
            if not stripped:
                continue
            # Stop at known section markers
            if re.match(r'(DESCUENTO GLOBAL|REFERENCIA|RAZON|CASO\s+\d)', stripped, re.IGNORECASE):
                break
            if stripped.startswith("=") or stripped.startswith("-"):
                break

            item = self._parse_item_line(line, has_precio, has_descuento)
            if item:
                items.append(item)

        return items

    def _parse_item_line(
        self, line: str, has_precio: bool, has_descuento: bool
    ) -> Optional[SetPruebasItem]:
        """Parse a single tab-separated item line from SII test set."""
        # Split by tabs, filter empty
        if "\t" not in line:
            return None

        parts = [p.strip() for p in line.split("\t") if p.strip()]
        if len(parts) < 2:
            return None

        nombre = parts[0]
        if not nombre or nombre.upper().startswith(("CASO", "DOCUMENTO", "REFERENCIA")):
            return None

        # Detect exento from item name
        exento = "EXENTO" in nombre.upper()

        # Parse cantidad (always the second field)
        cantidad = self._safe_decimal(parts[1])
        if cantidad is None:
            return None

        # Parse precio unitario (third field if present)
        precio = Decimal("0")
        if has_precio and len(parts) >= 3:
            precio = self._safe_decimal(parts[2]) or Decimal("0")

        # Parse descuento (fourth field if present)
        descuento = Decimal("0")
        if has_descuento and len(parts) >= 4:
            desc_str = parts[3].replace("%", "").strip()
            descuento = self._safe_decimal(desc_str) or Decimal("0")

        return SetPruebasItem(
            nombre=nombre,
            cantidad=cantidad,
            precio_unitario=precio,
            descuento_pct=descuento,
            exento=exento,
        )

    def _resolve_references(self, cases: list[SetPruebasCase]):
        """
        Resolve NC/ND references: copy items from referenced cases
        when the NC/ND case has no items or only quantities.
        """
        # Index cases by sub-number
        by_sub: dict[int, SetPruebasCase] = {}
        for case in cases:
            by_sub[case.caso_sub] = case

        for case in cases:
            if case._ref_caso_sub is None:
                continue

            ref_case = by_sub.get(case._ref_caso_sub)
            if not ref_case:
                logger.warning(
                    f"CASO {case.caso}-{case.caso_sub} references sub {case._ref_caso_sub} "
                    f"but it was not found"
                )
                continue

            razon_upper = (case.referencia.razon_ref if case.referencia else "").upper()

            # Check if referenced case is a text correction (CodRef=2)
            ref_razon = (ref_case.referencia.razon_ref if ref_case.referencia else "").upper()
            ref_is_text_correction = any(
                kw in ref_razon for kw in ("CORRIGE GIRO", "CORRIGE TEXTO", "CORRIGE RAZON")
            )

            if "ANULA" in razon_upper:
                if ref_is_text_correction:
                    # ND voiding a text-correction NC: must MIRROR the NC exactly.
                    # The referenced NC (CodRef=2 CORRIGE TEXTO) has 1 Detalle with
                    # MontoItem=0 and MntTotal=0. The ND that ANULA it must have the
                    # SAME structure: CodRef=1, 1 Detalle, MntTotal=0.
                    #
                    # Per Formato DTE v2.2 p.37 campo 38 <MontoItem>:
                    #   "Debe ser cero cuando ... Es una Nota de Crédito tipo fe de
                    #    erratas (Ver campo Código de Referencia en Referencias)"
                    # And per the obligatoriedad table for NOTA CRED:
                    #   QtyItem, PrcItem, UnmdItem, DescuentoMonto = obligatoriedad 2
                    #   (CONDICIONAL, NO obligatorio)
                    #   Only NroLinDet, NmbItem, MontoItem are required.
                    #
                    # The dte_generator emits ONLY NroLinDet + NmbItem + MontoItem=0
                    # when precio_unitario==0 and cantidad==0, skipping QtyItem,
                    # PrcItem, UnmdItem and DescuentoPct/Monto entirely. This way the
                    # SET checker has no formula (Qty×Prc-Desc) to validate against.
                    #
                    # Earlier attempts that FAILED the SET checker:
                    # - PrcItem=1 + DescuentoPct=100 (passes DTE individual but
                    #   SET checker rejects with "Los Valores de la Linea 1 No Cuadran")
                    # - Real amounts from referenced factura (REF-2-780)
                    # - CodRef=3 (forbidden for ND→NC)
                    case.items = [
                        SetPruebasItem(
                            nombre=ref_case.items[0].nombre if ref_case.items else "ANULA NOTA DE CREDITO ELECTRONICA",
                            cantidad=Decimal("0"),
                            precio_unitario=Decimal("0"),
                            descuento_pct=Decimal("0"),
                            exento=False,
                        )
                    ]
                elif not case.items:
                    # Full void: copy ALL items from referenced case at same prices
                    case.items = [
                        SetPruebasItem(
                            nombre=it.nombre,
                            cantidad=it.cantidad,
                            precio_unitario=it.precio_unitario,
                            descuento_pct=it.descuento_pct,
                            exento=it.exento,
                        )
                        for it in ref_case.items
                    ]

            elif "DEVOLUCION" in razon_upper:
                # Partial return: case has quantities, prices+discounts from original
                if case.items:
                    for item in case.items:
                        if item.precio_unitario == 0:
                            # Find matching item in original by name
                            for orig in ref_case.items:
                                if self._items_match(item.nombre, orig.nombre):
                                    item.precio_unitario = orig.precio_unitario
                                    item.descuento_pct = orig.descuento_pct
                                    item.exento = orig.exento
                                    break

            elif "CORRIGE" in razon_upper:
                if "GIRO" in razon_upper or "TEXTO" in razon_upper or "RAZON" in razon_upper:
                    # Text correction (CodRef=2): NC must have MntTotal=0.
                    #
                    # Per Formato DTE v2.2 p.37 campo 38 <MontoItem>:
                    #   "Debe ser cero cuando ... Es una Nota de Crédito tipo fe de
                    #    erratas (Ver campo Código de Referencia en Referencias)"
                    # And per the obligatoriedad table for NOTA CRED:
                    #   QtyItem, PrcItem, UnmdItem, DescuentoMonto = obligatoriedad 2
                    #   (CONDICIONAL, NO obligatorio)
                    #
                    # The dte_generator emits ONLY NroLinDet + NmbItem + MontoItem=0
                    # when precio_unitario==0 and cantidad==0. This skips QtyItem,
                    # PrcItem, UnmdItem and DescuentoPct/Monto entirely so the SET
                    # checker has no arithmetic formula to validate.
                    case.items = [
                        SetPruebasItem(
                            nombre=ref_case.items[0].nombre if ref_case.items else "Correccion",
                            cantidad=Decimal("0"),
                            precio_unitario=Decimal("0"),
                            descuento_pct=Decimal("0"),
                            exento=False,
                        )
                    ]
                else:
                    # Amount correction (CodRef=3): copy items with prices from original
                    if not case.items:
                        case.items = [
                            SetPruebasItem(
                                nombre=it.nombre,
                                cantidad=it.cantidad,
                                precio_unitario=it.precio_unitario,
                                descuento_pct=it.descuento_pct,
                                exento=it.exento,
                            )
                            for it in ref_case.items
                        ]

            else:
                # Unknown reference type: copy items if missing
                if not case.items:
                    case.items = [
                        SetPruebasItem(
                            nombre=it.nombre,
                            cantidad=it.cantidad,
                            precio_unitario=it.precio_unitario,
                            descuento_pct=it.descuento_pct,
                            exento=it.exento,
                        )
                        for it in ref_case.items
                    ]

    @staticmethod
    def _items_match(name1: str, name2: str) -> bool:
        """Check if two item names refer to the same product."""
        # Normalize: strip, uppercase, remove accents
        n1 = re.sub(r'\s+', ' ', name1.upper().strip())
        n2 = re.sub(r'\s+', ' ', name2.upper().strip())
        # Exact match or one contains the other
        return n1 == n2 or n1 in n2 or n2 in n1

    @staticmethod
    def _derive_cod_ref(razon_ref: str) -> int:
        """Derive CodRef (1=Anula, 2=Corrige texto, 3=Corrige montos) from razon text."""
        upper = (razon_ref or "").upper()
        if "ANULA" in upper:
            return 1
        if "DEVOLUCION" in upper:
            return 3  # Partial return = monto correction
        if "CORRIGE" in upper:
            if "GIRO" in upper or "TEXTO" in upper or "RAZON" in upper:
                return 2  # Text correction
            return 3  # Default corrige = montos
        return 1  # Default fallback

    @staticmethod
    def _safe_decimal(s: str) -> Optional[Decimal]:
        """Convert string to Decimal, return None on failure."""
        try:
            return Decimal(s.replace(",", "."))
        except Exception:
            return None

    def to_payloads(self, data: SetPruebasData) -> list[dict]:
        """
        Convert parsed test set to emission payloads ready for DTEEmissionService.

        NC/ND payloads include _ref_caso_sub for folio resolution during batch emission.
        The emit_batch method must resolve ref_folio from previously emitted cases.

        Returns a list of dicts matching the emit() payload format.
        """
        payloads = []

        for case in data.casos:
            items_data = []
            for item in case.items:
                items_data.append({
                    "nombre": item.nombre,
                    "cantidad": str(item.cantidad),
                    "precio_unitario": str(item.precio_unitario),
                    "descuento_pct": str(item.descuento_pct),
                    "exento": item.exento,
                    "codigo": item.codigo,
                    "unidad": item.unidad,
                })

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
                "items": items_data,
                # Internal: case sub-number for tracking
                "_caso_sub": case.caso_sub,
                # SET DE PRUEBA reference for SII certification matching
                "_set_prueba_folio": f"{case.caso}-{case.caso_sub}",
                "_set_prueba_caso": f"CASO {case.caso}-{case.caso_sub}",
            }

            # Global discount as DscRcgGlobal (not per-item)
            if case.descuento_global_pct > 0:
                payload["descuentos_globales"] = [{
                    "tipo_mov": "D",
                    "glosa": "Descuento Global Itemes Afectos",
                    "tipo_valor": "%",
                    "valor": str(case.descuento_global_pct),
                    "ind_exe": 0,  # 0 = afecto items only
                }]

            if case.referencia:
                payload["ref_tipo_doc"] = case.referencia.tipo_doc_ref
                payload["ref_folio"] = 0  # Resolved during batch emission
                payload["ref_fecha"] = ""  # Set to fecha_emision during emission
                payload["ref_motivo"] = case.referencia.razon_ref
                payload["ref_cod_ref"] = self._derive_cod_ref(case.referencia.razon_ref)
                payload["_ref_caso_sub"] = case._ref_caso_sub

            payloads.append(payload)

        logger.info(f"Generated {len(payloads)} emission payloads from test set")
        return payloads

    def parse_boleta(self, content: str, emisor_data: dict) -> SetPruebasData:
        """
        Parse the SII boleta test set file.

        Boleta format is different from SET BASICO:
        - Cases are "CASO-N" (no full atencion number)
        - All documents are tipo 39 (Boleta Electrónica)
        - Prices include IVA
        - No RUT receptor (consumer sales)
        - SET reference uses "CASO-N" format
        - Some cases have OBSERVACION for special handling

        Args:
            content: Raw text content of the boleta test set file
            emisor_data: Issuer data dict

        Returns:
            SetPruebasData with all parsed boleta test cases
        """
        result = SetPruebasData(
            rut_emisor=emisor_data["rut_emisor"],
            razon_social_emisor=emisor_data["razon_social"],
            giro_emisor=emisor_data["giro"],
            direccion_emisor=emisor_data.get("direccion", "Santiago"),
            comuna_emisor=emisor_data.get("comuna", "Santiago"),
            ciudad_emisor=emisor_data.get("ciudad", "Santiago"),
            actividad_economica=emisor_data.get("actividad_economica", 620200),
        )

        content = content.replace("\r\n", "\n").replace("\r", "\n")

        # Split into CASO blocks
        parts = re.split(r'\n(?=CASO-\d+)', content)
        caso_blocks = [p.strip() for p in parts if p.strip() and re.match(r'CASO-\d+', p.strip())]

        for block in caso_blocks:
            try:
                case = self._parse_boleta_case(block)
                if case:
                    result.casos.append(case)
            except Exception as e:
                logger.warning(f"Error parsing boleta case: {e}. Text: {block[:200]}")

        logger.info(
            f"Boleta test set parsed: {len(result.casos)} cases "
            f"for emisor {result.rut_emisor}"
        )
        return result

    def _parse_boleta_case(self, text: str) -> Optional[SetPruebasCase]:
        """Parse a single boleta test case block."""
        lines = text.strip().split("\n")
        if not lines:
            return None

        # Extract case number: "CASO-1"
        header_match = re.match(r'CASO-(\d+)', lines[0])
        if not header_match:
            return None

        caso_sub = int(header_match.group(1))

        # Parse OBSERVACION for special handling
        observacion = ""
        obs_match = re.search(r'OBSERVACION:\s*"(.+?)"', text, re.IGNORECASE)
        if obs_match:
            observacion = obs_match.group(1).strip()

        # Parse items — look for header line with "Cantidad" and "Precio"
        items = []
        header_idx = None
        for i, line in enumerate(lines):
            if re.search(r'Item\s', line, re.IGNORECASE) and \
               re.search(r'Cantidad', line, re.IGNORECASE):
                header_idx = i
                break

        if header_idx is not None:
            for line in lines[header_idx + 1:]:
                stripped = line.strip()
                if not stripped:
                    continue
                # Stop at section markers
                if stripped.startswith("=") or stripped.startswith("-"):
                    break
                if re.match(r'(OBSERVACION|CASO-\d)', stripped, re.IGNORECASE):
                    break

                item = self._parse_boleta_item_line(line, observacion)
                if item:
                    items.append(item)

        if not items:
            return None

        # Boletas: no RUT receptor, consumer sales
        return SetPruebasCase(
            caso=0,  # Boleta set has no atencion number
            caso_sub=caso_sub,
            tipo_dte=39,
            rut_receptor="66666666-6",  # SII test receptor
            razon_social_receptor="Consumidor Final",
            giro_receptor="",
            direccion_receptor="Santiago",
            comuna_receptor="Santiago",
            ciudad_receptor="Santiago",
            items=items,
            observaciones=observacion or None,
        )

    def _parse_boleta_item_line(self, line: str, observacion: str = "") -> Optional[SetPruebasItem]:
        """Parse a boleta item line. Handles tab-separated format with IVA-inclusive prices."""
        if "\t" not in line:
            return None

        parts = [p.strip() for p in line.split("\t") if p.strip()]
        if len(parts) < 2:
            return None

        nombre = parts[0]
        if not nombre or nombre.upper().startswith(("CASO", "OBSERV")):
            return None

        cantidad = self._safe_decimal(parts[1])
        if cantidad is None:
            return None

        # Precio unitario con IVA
        precio = Decimal("0")
        if len(parts) >= 3:
            precio = self._safe_decimal(parts[2]) or Decimal("0")

        # Detect exento from observacion context
        exento = False
        nombre_upper = nombre.upper()
        if "EXENTO" in nombre_upper or "EXENTA" in nombre_upper:
            exento = True
        elif observacion:
            obs_upper = observacion.upper()
            # Check if this item is specifically marked exento in observacion
            if nombre_upper.strip().split()[0] in obs_upper and "EXENTO" in obs_upper:
                # More specific: check "item N es ... exento"
                for part in obs_upper.split("."):
                    item_words = nombre_upper.strip().lower().split()
                    if any(w in part.lower() for w in item_words) and "exento" in part.lower():
                        exento = True
                        break

        # Check for special unit from observacion (e.g., "Kg")
        unidad = "UN"
        if observacion:
            kg_match = re.search(r'[Uu]nidad de medida en (\w+)', observacion)
            if kg_match:
                unidad = kg_match.group(1)

        return SetPruebasItem(
            nombre=nombre,
            cantidad=cantidad,
            precio_unitario=precio,
            descuento_pct=Decimal("0"),
            exento=exento,
            unidad=unidad,
        )

    def boleta_to_payloads(self, data: SetPruebasData) -> list[dict]:
        """
        Convert parsed boleta test set to emission payloads.

        Key differences from factura payloads:
        - tipo_dte is always 39
        - Prices include IVA (handled by DTE generator for tipo 39)
        - SET reference uses "CASO-N" format (no atencion number)
        - No document references (no NCs/NDs for boletas)
        """
        payloads = []

        for case in data.casos:
            items_data = []
            for item in case.items:
                items_data.append({
                    "nombre": item.nombre,
                    "cantidad": str(item.cantidad),
                    "precio_unitario": str(item.precio_unitario),
                    "descuento_pct": str(item.descuento_pct),
                    "exento": item.exento,
                    "codigo": item.codigo,
                    "unidad": item.unidad,
                })

            payload: dict = {
                "tipo_dte": 39,
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
                "items": items_data,
                "_caso_sub": case.caso_sub,
                # Boleta SET reference: CASO-N format
                "_set_prueba_folio": f"CASO-{case.caso_sub}",
                "_set_prueba_caso": f"CASO-{case.caso_sub}",
            }

            payloads.append(payload)

        logger.info(f"Generated {len(payloads)} boleta emission payloads")
        return payloads

    def parse_libro_compras(self, content: str) -> dict:
        """
        Parse the SET LIBRO DE COMPRAS section from the test set file.

        The format is a table with entries like:
            TIPO DOCUMENTO              FOLIO
            OBSERVACIONES
            MONTO EXENTO    MONTO AFECTO

        Also extracts:
        - folio_notificacion from the section header
        - fct_prop (factor de proporcionalidad) from OBSERVACIONES GENERALES

        Args:
            content: Full text content of the test set file

        Returns:
            {
                "folio_notificacion_ventas": str,
                "folio_notificacion_compras": str,
                "fct_prop": Decimal or None,
                "entries": [
                    {
                        "tipo_doc_nombre": str,
                        "folio": int,
                        "observaciones": str,
                        "mnt_exe": int,
                        "mnt_afecto": int,
                    },
                    ...
                ],
            }
        """
        content = content.replace("\r\n", "\n").replace("\r", "\n")

        # Extract folio notificacion for ventas
        folio_ventas = ""
        match_ventas = re.search(
            r"SET LIBRO DE VENTAS\s*-\s*NUMERO DE ATENCION:\s*(\d+)",
            content,
            re.IGNORECASE,
        )
        if match_ventas:
            folio_ventas = match_ventas.group(1)

        # Extract folio notificacion for compras
        folio_compras = ""
        match_compras = re.search(
            r"SET LIBRO DE COMPRAS\s*-\s*NUMERO DE ATENCION:\s*(\d+)",
            content,
            re.IGNORECASE,
        )
        if match_compras:
            folio_compras = match_compras.group(1)

        # Extract factor de proporcionalidad
        fct_prop = None
        fct_match = re.search(
            r"FACTOR DE PROPORCIONALIDAD\s*(?:DEL IVA\s*)?(?:ES DE\s*)?([\d.]+)",
            content,
            re.IGNORECASE,
        )
        if fct_match:
            fct_prop = Decimal(fct_match.group(1))

        # Extract the LIBRO DE COMPRAS section
        compras_section = ""
        start_match = re.search(
            r"SET LIBRO DE COMPRAS\s*-\s*NUMERO DE ATENCION:\s*\d+",
            content,
            re.IGNORECASE,
        )
        if start_match:
            section_start = start_match.end()
            end_match = re.search(
                r"\n-{3,}\n(?:SET (?:GUIA|LIBRO DE GUIAS))",
                content[section_start:],
                re.IGNORECASE,
            )
            if end_match:
                compras_section = content[
                    section_start : section_start + end_match.start()
                ]
            else:
                compras_section = content[section_start:]

        entries = self._parse_compras_entries(compras_section)

        logger.info(
            f"Libro de Compras parsed: {len(entries)} entries, "
            f"folio_ventas={folio_ventas}, folio_compras={folio_compras}, "
            f"fct_prop={fct_prop}"
        )

        return {
            "folio_notificacion_ventas": folio_ventas,
            "folio_notificacion_compras": folio_compras,
            "fct_prop": fct_prop,
            "entries": entries,
        }

    def _parse_compras_entries(self, section: str) -> list[dict]:
        """
        Parse individual entries from the compras section.

        Each entry spans 3 lines:
        - Line 1: TIPO_DOC (left) + FOLIO (right-aligned number)
        - Line 2: OBSERVACIONES
        - Line 3: MONTO_EXENTO (left) + MONTO_AFECTO (right)

        Lines are separated by blank lines between entries.
        """
        lines = section.split("\n")
        entries = []

        clean_lines = []
        for line in lines:
            stripped = line.strip()
            if re.match(r'^[=\-]{3,}$', stripped):
                continue
            if "TIPO DOCUMENTO" in stripped and "FOLIO" in stripped:
                continue
            if stripped == "OBSERVACIONES" or stripped == "MONTO EXENTO\tMONTO AFECTO":
                continue
            if "MONTO EXENTO" in stripped and "MONTO AFECTO" in stripped:
                continue
            if "OBSERVACIONES GENERALES" in stripped:
                break
            clean_lines.append(line)

        # Group into blocks separated by blank lines
        blocks = []
        current_block = []
        for line in clean_lines:
            if line.strip() == "":
                if current_block:
                    blocks.append(current_block)
                    current_block = []
            else:
                current_block.append(line)
        if current_block:
            blocks.append(current_block)

        doc_types = [
            "FACTURA DE COMPRA ELECTRONICA",
            "NOTA DE CREDITO ELECTRONICA",
            "NOTA DE DEBITO ELECTRONICA",
            "FACTURA ELECTRONICA",
            "FACTURA EXENTA ELECTRONICA",
            "NOTA DE CREDITO",
            "NOTA DE DEBITO",
            "FACTURA",
        ]

        for block in blocks:
            if len(block) < 3:
                continue

            line1 = block[0]
            line2 = block[1]
            line3 = block[2] if len(block) > 2 else ""

            tipo_doc_nombre = None
            folio = None

            for dt in doc_types:
                if dt in line1.upper():
                    tipo_doc_nombre = dt
                    remainder = line1.upper().replace(dt, "", 1)
                    folio_match = re.search(r'(\d+)', remainder)
                    if folio_match:
                        folio = int(folio_match.group(1))
                    break

            if not tipo_doc_nombre or not folio:
                logger.debug(f"Could not parse compra entry line: '{line1}'")
                continue

            observaciones = line2.strip()

            amounts = re.findall(r'(\d+)', line3)
            mnt_exe = 0
            mnt_afecto = 0

            if len(amounts) == 2:
                mnt_exe = int(amounts[0])
                mnt_afecto = int(amounts[1])
            elif len(amounts) == 1:
                # Expand tabs (8 spaces each) to detect column position.
                # MONTO EXENTO is in the left column, MONTO AFECTO in the right.
                line3_expanded = line3.replace('\t', '        ')
                stripped = line3_expanded.lstrip()
                leading_spaces = len(line3_expanded) - len(stripped)
                if leading_spaces > 10:
                    mnt_afecto = int(amounts[0])
                else:
                    mnt_exe = int(amounts[0])

            entries.append({
                "tipo_doc_nombre": tipo_doc_nombre,
                "folio": folio,
                "observaciones": observaciones,
                "mnt_exe": mnt_exe,
                "mnt_afecto": mnt_afecto,
            })

        return entries


# Singleton
set_pruebas_parser = SetPruebasParser()
