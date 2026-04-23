"""
CUENTAX — Test Libro de Compras: agrupación de TotalesPeriodo por (TpoDoc, eje)

SII IECV rejects an LC with SRH "El Numero de Lineas de Resumen No Cuadra"
when a single TpoDoc mixes several tax axes in one <TotalesPeriodo> row.
SET Checker expects one row per (TpoDoc, eje).

Scenario covered: SET 4788786 (Zyncro certification).

pytest tests/test_libro_compra_ejes.py
"""
from decimal import Decimal

from lxml import etree

from app.services.libro_generator import (
    LibroData,
    LibroDetalle,
    LibroXMLGenerator,
)


def _build_set_4788786_detalles() -> list[LibroDetalle]:
    """Detalles for the Zyncro certification SET 4788786 compras."""
    return [
        # FACTURA 234 — TpoDoc 30, IVA propio (giro con derecho a credito)
        LibroDetalle(
            tipo_doc=30, nro_doc=234, fch_doc="2026-04-22",
            rut_doc="55555555-5", rzn_soc="Proveedor Prueba",
            mnt_neto=30475, mnt_iva=5790, mnt_total=36265,
            iva_propio=5790,
        ),
        # FACTURA 781 — TpoDoc 30, IVA uso común (FctProp=0.60)
        LibroDetalle(
            tipo_doc=30, nro_doc=781, fch_doc="2026-04-22",
            rut_doc="55555555-5", rzn_soc="Proveedor Prueba",
            mnt_neto=29896, mnt_iva=0, mnt_total=35576,
            iva_uso_comun=5680,
        ),
        # FACTURA ELECTRONICA 32 — TpoDoc 33, IVA propio (con exento)
        LibroDetalle(
            tipo_doc=33, nro_doc=32, fch_doc="2026-04-22",
            rut_doc="55555555-5", rzn_soc="Proveedor Prueba",
            mnt_exe=9358, mnt_neto=7948, mnt_iva=1510, mnt_total=18816,
            iva_propio=1510,
        ),
        # FACTURA ELECTRONICA 67 — TpoDoc 33, IVA no recuperable cod=4
        LibroDetalle(
            tipo_doc=33, nro_doc=67, fch_doc="2026-04-22",
            rut_doc="55555555-5", rzn_soc="Proveedor Prueba",
            mnt_neto=10632, mnt_iva=0, mnt_total=12652,
            iva_no_rec_cod=4, iva_no_rec_mnt=2020,
        ),
        # FACTURA DE COMPRA ELECTRONICA 9 — TpoDoc 46, retención total
        LibroDetalle(
            tipo_doc=46, nro_doc=9, fch_doc="2026-04-22",
            rut_doc="55555555-5", rzn_soc="Proveedor Prueba",
            mnt_neto=9878, mnt_iva=1877, mnt_total=11755,
            iva_ret_total=1877,
        ),
        # NOTA DE CREDITO 451 — TpoDoc 60, descuento a F234
        LibroDetalle(
            tipo_doc=60, nro_doc=451, fch_doc="2026-04-22",
            rut_doc="55555555-5", rzn_soc="Proveedor Prueba",
            mnt_neto=2779, mnt_iva=528, mnt_total=3307,
            iva_propio=528, es_nota_credito=True,
        ),
        # NOTA DE CREDITO 211 — TpoDoc 60, descuento a FE32
        LibroDetalle(
            tipo_doc=60, nro_doc=211, fch_doc="2026-04-22",
            rut_doc="55555555-5", rzn_soc="Proveedor Prueba",
            mnt_neto=5783, mnt_iva=1099, mnt_total=6882,
            iva_propio=1099, es_nota_credito=True,
        ),
    ]


def _build_libro_data() -> LibroData:
    return LibroData(
        tipo_operacion="COMPRA",
        rut_emisor_libro="76753753-0",
        rut_envia="16122939-3",
        periodo_tributario="2026-04",
        folio_notificacion="2",
        detalles=_build_set_4788786_detalles(),
        fct_prop=Decimal("0.60"),
    )


def _totales_periodo(root: etree._Element) -> list[etree._Element]:
    return [
        el for el in root.iter()
        if etree.QName(el.tag).localname == "TotalesPeriodo"
    ]


def _child(parent, name: str) -> etree._Element | None:
    for el in parent:
        if etree.QName(el.tag).localname == name:
            return el
    return None


def _text(parent, name: str) -> str | None:
    el = _child(parent, name)
    return el.text if el is not None else None


def test_set_4788786_emits_six_totales_periodo_rows():
    """SET 4788786: 7 detalles must produce 6 TotalesPeriodo rows split by axis."""
    data = _build_libro_data()
    root = LibroXMLGenerator().generate(data)
    tots = _totales_periodo(root)

    assert len(tots) == 6, (
        f"Expected 6 TotalesPeriodo (split by (tipo_doc, eje)), got {len(tots)}"
    )

    # Verify (TpoDoc, signature) distribution
    rows = [(int(_text(t, "TpoDoc")), int(_text(t, "TotDoc"))) for t in tots]
    # Order per _EJE_ORDER: PROPIO, USO_COMUN, then NO_REC_*, RET_TOTAL, NC
    assert rows == [
        (30, 1),  # F234 propio
        (30, 1),  # F781 uso común
        (33, 1),  # FE32 propio (con exento)
        (33, 1),  # FE67 no recuperable
        (46, 1),  # FC9 ret total
        (60, 2),  # NC451 + NC211
    ]


def test_uso_comun_row_has_fct_prop_and_cred():
    data = _build_libro_data()
    root = LibroXMLGenerator().generate(data)
    tots = _totales_periodo(root)

    # Second row: TpoDoc=30 USO_COMUN
    uso = tots[1]
    assert _text(uso, "TpoDoc") == "30"
    assert _text(uso, "TotOpIVAUsoComun") == "1"
    assert _text(uso, "TotIVAUsoComun") == "5680"
    assert _text(uso, "FctProp") == "0.600"
    # TotCredIVAUsoComun = round(5680 * 0.60) = 3408
    assert _text(uso, "TotCredIVAUsoComun") == "3408"


def test_no_rec_row_has_codified_subelement():
    data = _build_libro_data()
    root = LibroXMLGenerator().generate(data)
    tots = _totales_periodo(root)

    # Fourth row: TpoDoc=33 NO_REC_4
    no_rec = tots[3]
    assert _text(no_rec, "TpoDoc") == "33"
    sub = _child(no_rec, "TotIVANoRec")
    assert sub is not None
    assert _text(sub, "CodIVANoRec") == "4"
    assert _text(sub, "TotOpIVANoRec") == "1"
    assert _text(sub, "TotMntIVANoRec") == "2020"


def test_ret_total_row_aggregates():
    data = _build_libro_data()
    root = LibroXMLGenerator().generate(data)
    tots = _totales_periodo(root)

    # Fifth row: TpoDoc=46 RET_TOTAL
    ret = tots[4]
    assert _text(ret, "TpoDoc") == "46"
    assert _text(ret, "TotOpIVARetTotal") == "1"
    assert _text(ret, "TotIVARetTotal") == "1877"


def test_propio_rows_do_not_leak_axis_subelements():
    """IVA propio rows must NOT carry TotIVAUsoComun / TotIVANoRec / TotIVARetTotal."""
    data = _build_libro_data()
    root = LibroXMLGenerator().generate(data)
    tots = _totales_periodo(root)

    # First row: TpoDoc=30 PROPIO (F234)
    propio30 = tots[0]
    assert _child(propio30, "TotIVAUsoComun") is None
    assert _child(propio30, "TotIVANoRec") is None
    assert _child(propio30, "TotIVARetTotal") is None

    # Third row: TpoDoc=33 PROPIO (FE32)
    propio33 = tots[2]
    assert _child(propio33, "TotIVAUsoComun") is None
    assert _child(propio33, "TotIVANoRec") is None
    assert _child(propio33, "TotIVARetTotal") is None


def test_ventas_still_groups_by_tipo_doc_only():
    """LV retains single-axis grouping: one row per TpoDoc regardless of fields."""
    detalles = [
        LibroDetalle(tipo_doc=33, nro_doc=1, fch_doc="2026-04-22",
                     rut_doc="55555555-5", rzn_soc="Cliente",
                     mnt_neto=1000, mnt_iva=190, mnt_total=1190),
        LibroDetalle(tipo_doc=33, nro_doc=2, fch_doc="2026-04-22",
                     rut_doc="55555555-5", rzn_soc="Cliente",
                     mnt_neto=2000, mnt_iva=380, mnt_total=2380),
        LibroDetalle(tipo_doc=61, nro_doc=10, fch_doc="2026-04-22",
                     rut_doc="55555555-5", rzn_soc="Cliente",
                     mnt_neto=500, mnt_iva=95, mnt_total=595,
                     es_nota_credito=True),
    ]
    data = LibroData(
        tipo_operacion="VENTA",
        rut_emisor_libro="76753753-0",
        rut_envia="16122939-3",
        periodo_tributario="2026-04",
        folio_notificacion="1",
        detalles=detalles,
    )
    root = LibroXMLGenerator().generate(data)
    tots = _totales_periodo(root)
    rows = [(int(_text(t, "TpoDoc")), int(_text(t, "TotDoc"))) for t in tots]
    # VENTA: one row per TpoDoc, NC not split out.
    assert rows == [(33, 2), (61, 1)]
