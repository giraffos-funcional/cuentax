"""
CUENTAX — Tests: LibroEmissionService dedupe
pytest tests/test_libro_emission_dedupe.py

Verifies that _extract_detalles_from_envio_dte() skips duplicate
(tipo_doc, nro_doc) entries — the SII rejects libros with repeated
folios for the same TpoDoc.
"""
import base64

from app.services.libro_emission import LibroEmissionService


def _make_dte(tipo: int, folio: int, total: int = 11900) -> str:
    """Build a minimal DTE fragment (no xmlns, uses fallback path)."""
    return f"""
    <DTE>
      <Documento ID="F{folio}T{tipo}">
        <Encabezado>
          <IdDoc>
            <TipoDTE>{tipo}</TipoDTE>
            <Folio>{folio}</Folio>
            <FchEmis>2026-04-01</FchEmis>
          </IdDoc>
          <Receptor>
            <RUTRecep>55555555-5</RUTRecep>
            <RznSocRecep>Cliente Test</RznSocRecep>
          </Receptor>
          <Totales>
            <MntNeto>10000</MntNeto>
            <IVA>1900</IVA>
            <MntTotal>{total}</MntTotal>
          </Totales>
        </Encabezado>
      </Documento>
    </DTE>
    """


def _make_envio_dte(dte_fragments: list[str]) -> str:
    """Wrap DTE fragments in an EnvioDTE root (no xmlns — uses fallback path)."""
    joined = "\n".join(dte_fragments)
    return f"""<?xml version="1.0" encoding="ISO-8859-1"?>
<EnvioDTE>
  <SetDTE>
    {joined}
  </SetDTE>
</EnvioDTE>
"""


def test_extract_detalles_skips_duplicates():
    """EnvioDTE with 2 duplicate (tipo, folio) pairs — only unique ones remain."""
    xml = _make_envio_dte([
        _make_dte(33, 1001),   # unique
        _make_dte(33, 1002),   # unique
        _make_dte(33, 1001),   # dup of #1
        _make_dte(61, 500),    # unique (different tipo)
        _make_dte(33, 1002),   # dup of #2
    ])
    xml_b64 = base64.b64encode(xml.encode("iso-8859-1")).decode()

    service = LibroEmissionService()
    detalles = service._extract_detalles_from_envio_dte(xml_b64)

    assert len(detalles) == 3, f"expected 3 unique detalles, got {len(detalles)}"
    keys = {(d.tipo_doc, d.nro_doc) for d in detalles}
    assert keys == {(33, 1001), (33, 1002), (61, 500)}


def test_extract_detalles_no_duplicates_pass_through():
    """When all DTEs are unique, none are skipped."""
    xml = _make_envio_dte([
        _make_dte(33, 10),
        _make_dte(33, 11),
        _make_dte(33, 12),
    ])
    xml_b64 = base64.b64encode(xml.encode("iso-8859-1")).decode()

    service = LibroEmissionService()
    detalles = service._extract_detalles_from_envio_dte(xml_b64)

    assert len(detalles) == 3
    assert [d.nro_doc for d in detalles] == [10, 11, 12]


def test_extract_detalles_empty_envio():
    """EnvioDTE with no DTEs returns empty list."""
    xml = """<?xml version="1.0" encoding="ISO-8859-1"?>
<EnvioDTE><SetDTE/></EnvioDTE>
"""
    xml_b64 = base64.b64encode(xml.encode("iso-8859-1")).decode()

    service = LibroEmissionService()
    detalles = service._extract_detalles_from_envio_dte(xml_b64)

    assert detalles == []
