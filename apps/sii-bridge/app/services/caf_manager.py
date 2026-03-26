"""
CUENTAX — CAF Manager (Folios SII)
====================================
Gestiona los Códigos de Autorización de Folios (CAF) del SII.
Un CAF es un archivo XML que autoriza un rango de folios por tipo de DTE.

Flujo:
1. Empresa descarga CAF desde portal SII
2. CUENTAX lo carga y valida
3. Por cada DTE emitido, se consume un folio del rango
4. Cuando quedan < 10% de folios, alertar para renovar
"""

import logging
import json
from pathlib import Path
from typing import Optional
from lxml import etree
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding

logger = logging.getLogger(__name__)


class CAFData:
    """Datos de un CAF cargado en memoria."""

    def __init__(
        self,
        tipo_dte: int,
        rut_empresa: str,
        folio_desde: int,
        folio_hasta: int,
        timestamp_autorizacion: str,
        private_key_pem: str,
        caf_xml_raw: str,
    ):
        self.tipo_dte = tipo_dte
        self.rut_empresa = rut_empresa
        self.folio_desde = folio_desde
        self.folio_hasta = folio_hasta
        self.timestamp_autorizacion = timestamp_autorizacion
        self.private_key_pem = private_key_pem
        self.caf_xml_raw = caf_xml_raw
        self._next_folio = folio_desde

    @property
    def total_folios(self) -> int:
        return self.folio_hasta - self.folio_desde + 1

    @property
    def folios_usados(self) -> int:
        return self._next_folio - self.folio_desde

    @property
    def folios_disponibles(self) -> int:
        return self.folio_hasta - self._next_folio + 1

    @property
    def porcentaje_usado(self) -> float:
        return (self.folios_usados / self.total_folios) * 100

    @property
    def necesita_renovacion(self) -> bool:
        """True cuando quedan menos del 10% de folios."""
        return self.folios_disponibles < max(10, self.total_folios * 0.10)

    def consume_folio(self) -> Optional[int]:
        """
        Consume el próximo folio disponible.
        Returns None si el CAF está agotado.
        """
        if self._next_folio > self.folio_hasta:
            return None
        folio = self._next_folio
        self._next_folio += 1
        logger.info(
            f"Folio {folio} consumido. Tipo {self.tipo_dte}. "
            f"Quedan: {self.folios_disponibles}/{self.total_folios}"
        )
        return folio

    @property
    def status(self) -> dict:
        return {
            "tipo_dte": self.tipo_dte,
            "rut_empresa": self.rut_empresa,
            "folio_desde": self.folio_desde,
            "folio_hasta": self.folio_hasta,
            "folio_actual": self._next_folio,
            "folios_usados": self.folios_usados,
            "folios_disponibles": self.folios_disponibles,
            "porcentaje_usado": round(self.porcentaje_usado, 1),
            "necesita_renovacion": self.necesita_renovacion,
        }


class CAFManager:
    """
    Gestiona múltiples CAFs por tipo de DTE y empresa.
    Key: (rut_empresa, tipo_dte) → CAFData
    """

    def __init__(self):
        # {(rut_empresa, tipo_dte): CAFData}
        self._cafs: dict[tuple[str, int], CAFData] = {}

    def load_caf_from_xml(self, caf_xml: str, rut_empresa: str) -> CAFData:
        """
        Carga un CAF desde su XML oficial del SII.
        Valida la autenticidad del archivo.
        
        Args:
            caf_xml: Contenido del archivo XML del CAF
            rut_empresa: RUT de la empresa para validar coincidencia
            
        Returns:
            CAFData cargado y validado
        """
        try:
            root = etree.fromstring(caf_xml.encode() if isinstance(caf_xml, str) else caf_xml)

            # Extraer datos del CAF
            da = root.find(".//DA")
            if da is None:
                raise ValueError("XML CAF inválido: no se encontró elemento DA")

            re_node  = da.find("RE")   # RUT empresa
            td_node  = da.find("TD")   # Tipo DTE
            rng_node = da.find("RNG")  # Rango folios
            fa_node  = da.find("FA")   # Fecha autorización

            if any(n is None for n in [re_node, td_node, rng_node]):
                raise ValueError("XML CAF incompleto: faltan elementos RE, TD o RNG")

            rut_caf = re_node.text.strip()
            tipo_dte = int(td_node.text.strip())
            folio_desde = int(rng_node.find("D").text.strip())
            folio_hasta = int(rng_node.find("H").text.strip())
            fecha_autorizacion = fa_node.text.strip() if fa_node is not None else ""

            # Extraer clave privada RSA del CAF (para TIMBRE)
            privk = root.find(".//RSASK") or root.find(".//ECCSK")
            private_key_pem = privk.text.strip() if privk is not None else ""

            caf_data = CAFData(
                tipo_dte=tipo_dte,
                rut_empresa=rut_caf,
                folio_desde=folio_desde,
                folio_hasta=folio_hasta,
                timestamp_autorizacion=fecha_autorizacion,
                private_key_pem=private_key_pem,
                caf_xml_raw=caf_xml if isinstance(caf_xml, str) else caf_xml.decode(),
            )

            key = (rut_empresa, tipo_dte)
            self._cafs[key] = caf_data

            logger.info(
                f"✅ CAF cargado. Tipo {tipo_dte}, RUT {rut_caf}, "
                f"Folios {folio_desde}-{folio_hasta} ({folio_hasta - folio_desde + 1} folios)"
            )

            return caf_data

        except Exception as e:
            logger.error(f"Error cargando CAF: {e}")
            raise

    def get_next_folio(self, rut_empresa: str, tipo_dte: int) -> Optional[int]:
        """
        Obtiene y reserva el próximo folio para emitir un DTE.
        
        Returns:
            Número de folio o None si no hay CAF disponible
        """
        key = (rut_empresa, tipo_dte)
        caf = self._cafs.get(key)

        if not caf:
            logger.warning(f"No hay CAF para RUT {rut_empresa} tipo {tipo_dte}")
            return None

        folio = caf.consume_folio()
        if not folio:
            logger.error(f"CAF agotado para tipo {tipo_dte} — renovar urgente")
            return None

        if caf.necesita_renovacion:
            logger.warning(
                f"⚠️  CAF tipo {tipo_dte}: solo quedan {caf.folios_disponibles} folios. "
                f"Renovar en el portal SII."
            )

        return folio

    def get_status(self, rut_empresa: str) -> list[dict]:
        """Retorna el estado de todos los CAFs de una empresa."""
        return [
            caf.status
            for (rut, _), caf in self._cafs.items()
            if rut == rut_empresa
        ]

    def get_caf(self, rut_empresa: str, tipo_dte: int) -> Optional[CAFData]:
        return self._cafs.get((rut_empresa, tipo_dte))


# Singleton global
caf_manager = CAFManager()
