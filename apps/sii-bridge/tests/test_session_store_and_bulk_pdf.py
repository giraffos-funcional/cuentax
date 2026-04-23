"""
CUENTAX — session_store persistence + bulk muestras extraction tests.

Two concerns covered:

1. ``session_store``:
   - round-trips sets (``steps_completed``) via ``list`` representation,
   - creates the target directory if missing,
   - ``load_all`` finds every persisted rut,
   - ``delete`` is idempotent.

2. ``_iter_documentos`` (bulk-PDF helper):
   - walks an ``EnvioDTE`` and yields one extractor per inner ``<Documento>``,
   - the extractor produces the dict shape ``pdf_generator.generate``
     expects (emisor/receptor/items/totales, plus TED string for PDF417),
   - handles envelopes with the SII default namespace.

pytest tests/test_session_store_and_bulk_pdf.py
"""
from __future__ import annotations

import os
import tempfile

import pytest


# ── session_store ────────────────────────────────────────────

@pytest.fixture
def store(monkeypatch):
    tmp = tempfile.mkdtemp(prefix="cuentax-session-test-")
    monkeypatch.setenv("CUENTAX_SESSION_DIR", tmp)
    # Force re-read of env var by reloading the module.
    import importlib

    from app.services import session_store as mod
    importlib.reload(mod)
    yield mod
    # Best-effort cleanup.
    try:
        for f in os.listdir(tmp):
            os.unlink(os.path.join(tmp, f))
        os.rmdir(tmp)
    except OSError:
        pass


def test_save_load_roundtrip(store):
    data = {
        "rut_emisor": "76753753-0",
        "current_step": 2,
        "steps_completed": {1, 2},
        "payloads_factura": [{"tipo_dte": 33}],
    }
    assert store.save("76753753-0", data) is True

    got = store.load("76753753-0")
    assert got is not None
    assert got["current_step"] == 2
    assert got["steps_completed"] == {1, 2}  # restored as set
    assert got["payloads_factura"] == [{"tipo_dte": 33}]


def test_load_missing_returns_none(store):
    assert store.load("NOT-PERSISTED") is None


def test_load_all_finds_multiple(store):
    store.save("76111111-1", {"rut_emisor": "76111111-1", "current_step": 1})
    store.save("76222222-2", {"rut_emisor": "76222222-2", "current_step": 3})
    all_ = store.load_all()
    assert set(all_.keys()) == {"76111111-1", "76222222-2"}
    assert all_["76222222-2"]["current_step"] == 3


def test_delete_is_idempotent(store):
    store.save("76333333-3", {"rut_emisor": "76333333-3"})
    store.delete("76333333-3")
    store.delete("76333333-3")  # second call must not raise
    assert store.load("76333333-3") is None


def test_save_accepts_unserializable_via_default(store):
    """json.dumps uses default=str; arbitrary dataclass-like objects must not blow up save."""
    class Obj:
        def __str__(self) -> str:
            return "blob"

    assert store.save("76444444-4", {"rut_emisor": "76444444-4", "junk": Obj()}) is True
    assert store.load("76444444-4")["junk"] == "blob"


# ── _iter_documentos ─────────────────────────────────────────

def _sample_envio_xml(namespace: bool = True) -> bytes:
    """Build a minimal but structurally valid EnvioDTE with 2 documentos."""
    ns = ' xmlns="http://www.sii.cl/SiiDte"' if namespace else ""
    return (
        f'<?xml version="1.0" encoding="ISO-8859-1"?>'
        f'<EnvioDTE{ns}>'
        f'<SetDTE>'
        f'<Caratula/>'
        f'<DTE><Documento ID="DTE-T33F100">'
        f'<Encabezado>'
        f'<IdDoc><TipoDTE>33</TipoDTE><Folio>100</Folio><FchEmis>2026-04-22</FchEmis></IdDoc>'
        f'<Emisor>'
        f'<RUTEmisor>76753753-0</RUTEmisor>'
        f'<RznSoc>Sociedad Ingenieria Zyncro SPA</RznSoc>'
        f'<GiroEmis>Ingenieria</GiroEmis>'
        f'<DirOrigen>Av Siempre Viva 742</DirOrigen>'
        f'<CmnaOrigen>Santiago</CmnaOrigen>'
        f'<CiudadOrigen>Santiago</CiudadOrigen>'
        f'</Emisor>'
        f'<Receptor>'
        f'<RUTRecep>11111111-1</RUTRecep>'
        f'<RznSocRecep>Cliente Uno</RznSocRecep>'
        f'<GiroRecep>Servicios</GiroRecep>'
        f'<DirRecep>Calle 1</DirRecep>'
        f'<CmnaRecep>Santiago</CmnaRecep>'
        f'<CiudadRecep>Santiago</CiudadRecep>'
        f'</Receptor>'
        f'<Totales><MntNeto>1000</MntNeto><IVA>190</IVA><MntTotal>1190</MntTotal></Totales>'
        f'</Encabezado>'
        f'<Detalle><NmbItem>Servicio A</NmbItem><QtyItem>1</QtyItem><PrcItem>1000</PrcItem><MontoItem>1000</MontoItem></Detalle>'
        f'<TED version="1.0"><DD><RE>76753753-0</RE><TD>33</TD><F>100</F></DD><FRMT algoritmo="SHA1withRSA">SIGN</FRMT></TED>'
        f'</Documento></DTE>'
        f'<DTE><Documento ID="DTE-T61F7">'
        f'<Encabezado>'
        f'<IdDoc><TipoDTE>61</TipoDTE><Folio>7</Folio><FchEmis>2026-04-22</FchEmis></IdDoc>'
        f'<Emisor><RUTEmisor>76753753-0</RUTEmisor><RznSoc>Zyncro</RznSoc></Emisor>'
        f'<Receptor><RUTRecep>11111111-1</RUTRecep><RznSocRecep>Cliente Uno</RznSocRecep></Receptor>'
        f'<Totales><MntNeto>500</MntNeto><IVA>95</IVA><MntTotal>595</MntTotal></Totales>'
        f'</Encabezado>'
        f'<Detalle><NmbItem>Descuento</NmbItem><QtyItem>1</QtyItem><PrcItem>500</PrcItem><MontoItem>500</MontoItem></Detalle>'
        f'<Referencia><TpoDocRef>33</TpoDocRef><FolioRef>100</FolioRef><FchRef>2026-04-22</FchRef><RazonRef>Anula factura 100</RazonRef></Referencia>'
        f'<TED version="1.0"><DD><RE>76753753-0</RE><TD>61</TD><F>7</F></DD></TED>'
        f'</Documento></DTE>'
        f'</SetDTE>'
        f'</EnvioDTE>'
    ).encode("iso-8859-1")


@pytest.mark.parametrize("with_ns", [True, False])
def test_iter_documentos_extracts_two_docs(with_ns):
    from lxml import etree

    from app.api.v1.endpoints.certification import _iter_documentos

    root = etree.fromstring(_sample_envio_xml(namespace=with_ns))
    extracted = []
    for _doc, extract in _iter_documentos(root):
        extracted.append(extract())

    assert len(extracted) == 2
    dte_data_1, ted_1, tipo_1, folio_1 = extracted[0]
    dte_data_2, ted_2, tipo_2, folio_2 = extracted[1]

    assert (tipo_1, folio_1) == (33, 100)
    assert (tipo_2, folio_2) == (61, 7)

    assert dte_data_1["emisor"]["rut"] == "76753753-0"
    assert dte_data_1["emisor"]["razon_social"].startswith("Sociedad")
    assert dte_data_1["receptor"]["rut"] == "11111111-1"
    assert dte_data_1["totales"] == {
        "neto": 1000,
        "iva": 190,
        "exento": 0,
        "total": 1190,
    }
    assert dte_data_1["items"] == [{
        "nombre": "Servicio A",
        "cantidad": 1,
        "precio_unitario": 1000,
        "monto_item": 1000,
        "exento": False,
    }]
    assert "referencia" not in dte_data_1
    assert ted_1 is not None
    assert "<TED" in ted_1 and "FRMT" in ted_1

    # Second doc carries a reference block (NC → F33 case).
    assert dte_data_2["referencia"]["tipo_doc"] == "33"
    assert dte_data_2["referencia"]["folio"] == "100"
    assert ted_2 is not None
