"""
CUENTAX — Test Libro CV REPAROS fixes
pytest tests/test_libro_reparos_fixes.py

Cover
- FIX 1: TpoDoc 46 (Factura de Compra ret. total) → MntIVA populated,
  MntTotal = Neto + IVA, ResumenPeriodo sums IVA correctly.
- FIX 2: TpoDoc 33 with "IVA USO COMUN" → MntIVA populated in detalle
  alongside IVAUsoComun.
- FIX 3: ND anulatoria con MntTotal=0 → TotAnulado=N en ResumenPeriodo.
- FIX 4: NC CORRIGE TEXTO con MntTotal=0 → emite <MntNeto>0</MntNeto>.
"""
from decimal import Decimal

from lxml import etree

from app.services.libro_generator import (
    LibroData,
    LibroDetalle,
    LibroXMLGenerator,
    SII_DTE_NS,
)
from app.services.libro_emission import LibroEmissionService


# The generator creates elements without qualified tags; the default xmlns
# on the root handles serialization. For in-memory XPath we query bare tags.
NS: dict = {}


def _build(tipo_operacion: str, detalles: list[LibroDetalle]) -> etree._Element:
    data = LibroData(
        tipo_operacion=tipo_operacion,
        rut_emisor_libro="76753753-0",
        rut_envia="16122939-3",
        periodo_tributario="2026-04",
        folio_notificacion="1",
        detalles=detalles,
    )
    return LibroXMLGenerator().generate(data)


# ─────────────────────────────────────────────────────────────
# FIX 1 — TpoDoc 46 with retención total
# ─────────────────────────────────────────────────────────────

def test_fix1_factura_compra_retencion_total_calcs_iva():
    """TpoDoc 46 RETENCION TOTAL builds detalle with MntIVA and MntTotal=Neto+IVA."""
    svc = LibroEmissionService()
    entries = [{
        "tipo_doc_nombre": "FACTURA DE COMPRA ELECTRONICA",
        "folio": 9,
        "observaciones": "FACTURA DE COMPRA CON RETENCION TOTAL DEL IVA",
        "mnt_exe": 0,
        "mnt_afecto": 9878,
    }]
    detalles = svc._build_compras_detalles(entries, "2026-04-01", "76753753-0")
    assert len(detalles) == 1
    d = detalles[0]
    assert d.tipo_doc == 46
    assert d.mnt_neto == 9878
    assert d.mnt_iva == 1877           # 9878 * 0.19 rounded
    assert d.mnt_total == 11755        # neto + iva
    assert d.iva_ret_total == 1877


def test_fix1_resumen_periodo_tpodoc_46_totals():
    """ResumenPeriodo para TpoDoc 46 refleja TotMntIVA y TotMntTotal con IVA."""
    d = LibroDetalle(
        tipo_doc=46, nro_doc=9, fch_doc="2026-04-01",
        rut_doc="55555555-5", rzn_soc="Proveedor",
        mnt_neto=9878, mnt_iva=1877, mnt_total=11755,
        iva_ret_total=1877,
    )
    xml = _build("COMPRA", [d])
    totales = xml.find(".//ResumenPeriodo/TotalesPeriodo", NS)
    assert totales is not None
    assert totales.findtext("TpoDoc") == "46"
    assert totales.findtext("TotMntNeto") == "9878"
    assert totales.findtext("TotMntIVA") == "1877"
    assert totales.findtext("TotOpIVARetTotal") == "1"
    assert totales.findtext("TotIVARetTotal") == "1877"
    assert totales.findtext("TotMntTotal") == "11755"


# ─────────────────────────────────────────────────────────────
# FIX 2 — IVA Uso Común emite MntIVA en detalle
# ─────────────────────────────────────────────────────────────

def test_fix2_factura_iva_uso_comun_emits_mntiva():
    """TpoDoc 33 USO COMUN builds detalle with both MntIVA and IVAUsoComun."""
    svc = LibroEmissionService()
    entries = [{
        "tipo_doc_nombre": "FACTURA ELECTRONICA",
        "folio": 781,
        "observaciones": "FACTURA CON IVA USO COMUN",
        "mnt_exe": 0,
        "mnt_afecto": 29896,
    }]
    detalles = svc._build_compras_detalles(entries, "2026-04-01", "76753753-0")
    assert len(detalles) == 1
    d = detalles[0]
    assert d.tipo_doc == 33
    assert d.mnt_neto == 29896
    assert d.mnt_iva == 5680           # 29896 * 0.19
    assert d.iva_uso_comun == 5680
    assert d.mnt_total == 35576        # neto + iva


def test_fix2_detalle_xml_tpodoc_33_has_both_mntiva_and_usocomun():
    """El XML del Detalle tiene MntIVA y IVAUsoComun simultáneamente."""
    d = LibroDetalle(
        tipo_doc=33, nro_doc=781, fch_doc="2026-04-01",
        rut_doc="55555555-5", rzn_soc="Proveedor",
        mnt_neto=29896, mnt_iva=5680, mnt_total=35576,
        iva_uso_comun=5680,
    )
    xml = _build("COMPRA", [d])
    det = xml.find(".//Detalle", NS)
    assert det is not None
    assert det.findtext("MntNeto") == "29896"
    assert det.findtext("MntIVA") == "5680"
    assert det.findtext("IVAUsoComun") == "5680"
    assert det.findtext("MntTotal") == "35576"


# ─────────────────────────────────────────────────────────────
# FIX 3 — TotAnulado para MntTotal=0
# ─────────────────────────────────────────────────────────────

def test_fix3_tot_anulado_for_mnttotal_zero_nd():
    """ND anulatoria con MntTotal=0 → emite TotAnulado=1 en ResumenPeriodo."""
    d = LibroDetalle(
        tipo_doc=56, nro_doc=1, fch_doc="2026-04-01",
        rut_doc="66666666-6", rzn_soc="Cliente",
        mnt_neto=0, mnt_iva=0, mnt_total=0,
    )
    xml = _build("VENTA", [d])
    totales = xml.find(".//ResumenPeriodo/TotalesPeriodo", NS)
    assert totales is not None
    assert totales.findtext("TpoDoc") == "56"
    assert totales.findtext("TotDoc") == "1"
    assert totales.findtext("TotAnulado") == "1"


def test_fix3_tot_anulado_omitted_when_no_zero_docs():
    """Cuando no hay docs con MntTotal=0, TotAnulado no se emite."""
    d = LibroDetalle(
        tipo_doc=33, nro_doc=1, fch_doc="2026-04-01",
        rut_doc="66666666-6", rzn_soc="Cliente",
        mnt_neto=10000, mnt_iva=1900, mnt_total=11900,
    )
    xml = _build("VENTA", [d])
    totales = xml.find(".//ResumenPeriodo/TotalesPeriodo", NS)
    assert totales.find("TotAnulado", NS) is None


# ─────────────────────────────────────────────────────────────
# FIX 4 — MntNeto=0 explícito cuando MntTotal=0
# ─────────────────────────────────────────────────────────────

def test_fix4_nc_mnttotal_zero_emits_mntneto_zero():
    """NC CORRIGE TEXTO con MntTotal=0 → Detalle incluye <MntNeto>0</MntNeto>."""
    d = LibroDetalle(
        tipo_doc=61, nro_doc=5, fch_doc="2026-04-01",
        rut_doc="66666666-6", rzn_soc="Cliente",
        mnt_neto=0, mnt_iva=0, mnt_total=0,
    )
    xml = _build("VENTA", [d])
    det = xml.find(".//Detalle", NS)
    assert det is not None
    assert det.findtext("MntNeto") == "0"
    assert det.findtext("MntTotal") == "0"


def test_fix4_does_not_override_exento():
    """Cuando hay MntExe y MntTotal=0, no se emite MntNeto=0 (XSD ya satisfecho)."""
    d = LibroDetalle(
        tipo_doc=34, nro_doc=7, fch_doc="2026-04-01",
        rut_doc="66666666-6", rzn_soc="Cliente",
        mnt_exe=5000, mnt_neto=0, mnt_iva=0, mnt_total=5000,
    )
    xml = _build("VENTA", [d])
    det = xml.find(".//Detalle", NS)
    assert det.findtext("MntExe") == "5000"
    # MntNeto ausente (no se fuerza a 0 si hay MntExe)
    assert det.find("MntNeto", NS) is None
