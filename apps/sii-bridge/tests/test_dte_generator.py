"""
CUENTAX — Tests: DTEXMLGenerator
pytest tests/test_dte_generator.py
"""
import pytest
from decimal import Decimal
from lxml import etree

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.services.dte_generator import (
    DTEXMLGenerator, DTEDocumento, DTEEmisor, DTEReceptor, DTEItem
)


@pytest.fixture
def generator():
    return DTEXMLGenerator()

@pytest.fixture
def emisor():
    return DTEEmisor(
        rut='76123456-7',
        razon_social='Empresa CUENTAX SpA',
        giro='Servicios de Software',
        direccion='Av. Providencia 123',
        comuna='Providencia',
        ciudad='Santiago',
        actividad_economica=620200,
    )

@pytest.fixture
def receptor():
    return DTEReceptor(
        rut='12345678-9',
        razon_social='Cliente Test SA',
        giro='Retail',
        direccion='Calle Falsa 123',
        comuna='Santiago',
        ciudad='Santiago',
        email='cliente@test.cl',
    )

@pytest.fixture
def items():
    return [
        DTEItem(nombre='Servicio de desarrollo', cantidad=Decimal('1'), precio_unitario=Decimal('100000')),
        DTEItem(nombre='Licencia software', cantidad=Decimal('2'), precio_unitario=Decimal('50000')),
        DTEItem(nombre='Soporte técnico', cantidad=Decimal('5'), precio_unitario=Decimal('10000'), exento=True),
    ]


class TestDTEXMLGenerator:
    def test_genera_factura_tipo_33(self, generator, emisor, receptor, items):
        doc = DTEDocumento(tipo_dte=33, folio=100, fecha_emision='2026-03-26',
                           emisor=emisor, receptor=receptor, items=items)
        xml = generator.generate(doc)
        assert xml.tag == 'DTE'

    def test_xml_contiene_folio(self, generator, emisor, receptor, items):
        doc = DTEDocumento(tipo_dte=33, folio=999, fecha_emision='2026-03-26',
                           emisor=emisor, receptor=receptor, items=items)
        xml_str = etree.tostring(generator.generate(doc)).decode()
        assert '<Folio>999</Folio>' in xml_str

    def test_xml_contiene_rut_emisor(self, generator, emisor, receptor, items):
        doc = DTEDocumento(tipo_dte=33, folio=1, fecha_emision='2026-03-26',
                           emisor=emisor, receptor=receptor, items=items)
        xml_str = etree.tostring(generator.generate(doc)).decode()
        assert '76123456-7' in xml_str

    def test_calculo_iva_factura(self, generator, emisor, receptor):
        items = [DTEItem(nombre='Item test', cantidad=Decimal('1'), precio_unitario=Decimal('100000'))]
        doc = DTEDocumento(tipo_dte=33, folio=1, fecha_emision='2026-03-26',
                           emisor=emisor, receptor=receptor, items=items)
        totals = generator._calculate_totals(doc)
        assert totals['neto']  == 100000
        assert totals['iva']   == 19000
        assert totals['total'] == 119000

    def test_calculo_boleta_tipo_39_sin_iva_adicional(self, generator, emisor, receptor):
        """La boleta (39) el precio ya incluye IVA — no se suma IVA extra."""
        items = [DTEItem(nombre='Producto', cantidad=Decimal('1'), precio_unitario=Decimal('50000'))]
        doc = DTEDocumento(tipo_dte=39, folio=1, fecha_emision='2026-03-26',
                           emisor=emisor, receptor=receptor, items=items)
        totals = generator._calculate_totals(doc)
        assert totals['total'] == 50000
        assert totals['iva']   == 0

    def test_item_exento_no_suma_iva(self, generator, emisor, receptor):
        items = [
            DTEItem(nombre='Normal', cantidad=Decimal('1'), precio_unitario=Decimal('100000')),
            DTEItem(nombre='Exento', cantidad=Decimal('1'), precio_unitario=Decimal('50000'), exento=True),
        ]
        doc = DTEDocumento(tipo_dte=33, folio=1, fecha_emision='2026-03-26',
                           emisor=emisor, receptor=receptor, items=items)
        totals = generator._calculate_totals(doc)
        assert totals['neto']   == 100000
        assert totals['exento'] == 50000
        assert totals['iva']    == 19000
        assert totals['total']  == 169000

    def test_descuento_reduce_monto_item(self, generator):
        item = DTEItem(
            nombre='Con descuento',
            cantidad=Decimal('10'),
            precio_unitario=Decimal('1000'),
            descuento_pct=Decimal('10'),
        )
        assert item.monto_item == 9000  # 10000 - 10% = 9000

    def test_tipo_dte_invalido_lanza_error(self, generator, emisor, receptor):
        items = [DTEItem(nombre='Test', cantidad=Decimal('1'), precio_unitario=Decimal('1000'))]
        doc = DTEDocumento(tipo_dte=99, folio=1, fecha_emision='2026-03-26',
                           emisor=emisor, receptor=receptor, items=items)
        with pytest.raises(ValueError, match='no soportado'):
            generator.generate(doc)

    def test_referencia_nota_credito(self, generator, emisor):
        receptor_nc = DTEReceptor(
            rut='12345678-9', razon_social='Cliente', giro='Retail',
            direccion='', comuna='', ciudad='Santiago',
            ref_tipo_doc=33, ref_folio=500, ref_fecha='2026-03-20',
            ref_motivo='Error en precio',
        )
        items = [DTEItem(nombre='Ajuste', cantidad=Decimal('1'), precio_unitario=Decimal('10000'))]
        doc = DTEDocumento(tipo_dte=61, folio=1, fecha_emision='2026-03-26',
                           emisor=emisor, receptor=receptor_nc, items=items)
        xml_str = etree.tostring(generator.generate(doc)).decode()
        assert 'Referencia' in xml_str
        assert '<FolioRef>500</FolioRef>' in xml_str
