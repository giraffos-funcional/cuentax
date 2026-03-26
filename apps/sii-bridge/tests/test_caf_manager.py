"""
CUENTAX — Tests: CAFManager
pytest tests/test_caf_manager.py
"""
import pytest
from app.services.caf_manager import CAFManager, CAFData

# CAF XML mínimo de prueba
MOCK_CAF_XML = """<?xml version="1.0"?>
<AUTORIZACION>
    <CAF version="1.0">
        <DA>
            <RE>76123456-7</RE>
            <RS>Empresa CUENTAX SpA</RS>
            <TD>33</TD>
            <RNG>
                <D>1000</D>
                <H>1099</H>
            </RNG>
            <FA>2026-03-01</FA>
            <RSAPK>
                <M>test_modulus</M>
                <E>test_exponent</E>
            </RSAPK>
            <IDK>123</IDK>
        </DA>
        <FRMA algoritmo="SHA1withRSA">test_signature</FRMA>
    </CAF>
    <RSASK>test_private_key</RSASK>
    <RSAPUBK>test_public_key</RSAPUBK>
</AUTORIZACION>
"""


class TestCAFManager:
    def setup_method(self):
        self.manager = CAFManager()

    def _load_mock_caf(self):
        return self.manager.load_caf_from_xml(MOCK_CAF_XML, '76123456-7')

    def test_carga_caf_correctamente(self):
        caf = self._load_mock_caf()
        assert caf.tipo_dte == 33
        assert caf.folio_desde == 1000
        assert caf.folio_hasta == 1099
        assert caf.total_folios == 100

    def test_consume_folio_secuencial(self):
        caf = self._load_mock_caf()
        assert caf.consume_folio() == 1000
        assert caf.consume_folio() == 1001
        assert caf.consume_folio() == 1002

    def test_folios_disponibles(self):
        caf = self._load_mock_caf()
        assert caf.folios_disponibles == 100
        caf.consume_folio()
        assert caf.folios_disponibles == 99

    def test_folio_agotado_retorna_none(self):
        caf = self._load_mock_caf()
        # Agotar todos los folios
        for _ in range(100):
            caf.consume_folio()
        assert caf.consume_folio() is None

    def test_get_next_folio_via_manager(self):
        self._load_mock_caf()
        folio = self.manager.get_next_folio('76123456-7', 33)
        assert folio == 1000

    def test_get_next_folio_sin_caf_retorna_none(self):
        folio = self.manager.get_next_folio('99999999-9', 33)
        assert folio is None

    def test_necesita_renovacion_cerca_del_limite(self):
        caf = self._load_mock_caf()
        # Consumir 91 folios (quedan 9 < 10%)
        for _ in range(91):
            caf.consume_folio()
        assert caf.necesita_renovacion is True

    def test_no_necesita_renovacion_con_muchos_folios(self):
        caf = self._load_mock_caf()
        assert caf.necesita_renovacion is False

    def test_status_retorna_info_correcta(self):
        self._load_mock_caf()
        statuses = self.manager.get_status('76123456-7')
        assert len(statuses) == 1
        assert statuses[0]['tipo_dte'] == 33
        assert statuses[0]['folios_disponibles'] == 100

    def test_caf_xml_invalido_lanza_error(self):
        with pytest.raises(Exception):
            self.manager.load_caf_from_xml('<invalid>xml</invalid>', '76123456-7')
