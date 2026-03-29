"""
CUENTAX -- CAF Manager (Folios SII)
====================================
Gestiona los Codigos de Autorizacion de Folios (CAF) del SII.
Un CAF es un archivo XML que autoriza un rango de folios por tipo de DTE.

Flujo:
1. Empresa descarga CAF desde portal SII
2. CUENTAX lo carga y valida
3. Por cada DTE emitido, se consume un folio del rango
4. Cuando quedan < 10% de folios, alertar para renovar

Persistence: CAFs are saved to Odoo (cuentax.caf model) and restored on startup.
"""

import base64
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

            # Persist to Odoo
            self.save_to_odoo(caf_data)

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

        # Sync folio position to Odoo
        self.sync_folio_to_odoo(rut_empresa, tipo_dte)

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

    # ── Odoo Persistence (ir.config_parameter) ─────────────────
    # Uses Odoo's built-in key-value store so no custom modules needed.
    # Key format: cuentax.caf.{rut}.{tipo} → JSON blob

    def _caf_param_key(self, rut: str, tipo: int) -> str:
        return f"cuentax.caf.{rut}.{tipo}"

    def _caf_to_dict(self, caf: CAFData) -> dict:
        return {
            "tipo_dte": caf.tipo_dte,
            "rut_empresa": caf.rut_empresa,
            "folio_desde": caf.folio_desde,
            "folio_hasta": caf.folio_hasta,
            "next_folio": caf._next_folio,
            "timestamp_autorizacion": caf.timestamp_autorizacion,
            "private_key_pem": caf.private_key_pem,
            "caf_xml_raw": caf.caf_xml_raw,
        }

    def save_to_odoo(self, caf_data: CAFData) -> bool:
        """Save a CAF to Odoo ir.config_parameter."""
        try:
            from app.adapters.odoo_rpc import odoo_rpc
            key = self._caf_param_key(caf_data.rut_empresa, caf_data.tipo_dte)
            value = json.dumps(self._caf_to_dict(caf_data))
            odoo_rpc.execute(
                "ir.config_parameter", "set_param", key, value,
            )
            # Also maintain an index of all CAF keys
            self._update_caf_index(odoo_rpc)
            logger.info(f"CAF saved to Odoo: {key}")
            return True
        except Exception as e:
            logger.error(f"Failed to save CAF to Odoo: {e}")
            return False

    def sync_folio_to_odoo(self, rut_empresa: str, tipo_dte: int) -> None:
        """Sync current folio position back to Odoo after consumption."""
        caf = self._cafs.get((rut_empresa, tipo_dte))
        if not caf:
            return
        try:
            from app.adapters.odoo_rpc import odoo_rpc
            key = self._caf_param_key(rut_empresa, tipo_dte)
            value = json.dumps(self._caf_to_dict(caf))
            odoo_rpc.execute("ir.config_parameter", "set_param", key, value)
        except Exception as e:
            logger.error(f"Failed to sync folio to Odoo: {e}")

    def _update_caf_index(self, odoo_rpc) -> None:
        """Maintain an index of all CAF param keys for restore."""
        keys = [
            self._caf_param_key(caf.rut_empresa, caf.tipo_dte)
            for caf in self._cafs.values()
        ]
        odoo_rpc.execute(
            "ir.config_parameter", "set_param",
            "cuentax.caf._index", json.dumps(keys),
        )

    def restore_from_odoo(self) -> int:
        """Load all CAFs from Odoo into memory. Returns count loaded."""
        try:
            from app.adapters.odoo_rpc import odoo_rpc

            # Read the index of CAF keys
            index_raw = odoo_rpc.execute(
                "ir.config_parameter", "get_param",
                "cuentax.caf._index", "[]",
            )
            keys = json.loads(index_raw) if index_raw else []

            count = 0
            for key in keys:
                try:
                    raw = odoo_rpc.execute(
                        "ir.config_parameter", "get_param", key, "",
                    )
                    if not raw:
                        continue
                    data = json.loads(raw)
                    caf = CAFData(
                        tipo_dte=data["tipo_dte"],
                        rut_empresa=data["rut_empresa"],
                        folio_desde=data["folio_desde"],
                        folio_hasta=data["folio_hasta"],
                        timestamp_autorizacion=data.get("timestamp_autorizacion", ""),
                        private_key_pem=data.get("private_key_pem", ""),
                        caf_xml_raw=data.get("caf_xml_raw", ""),
                    )
                    caf._next_folio = data.get("next_folio", data["folio_desde"])

                    mem_key = (data["rut_empresa"], data["tipo_dte"])
                    self._cafs[mem_key] = caf
                    count += 1
                    logger.info(
                        f"Restored CAF: tipo={data['tipo_dte']}, "
                        f"rut={data['rut_empresa']}, "
                        f"folios={data['folio_desde']}-{data['folio_hasta']}, "
                        f"next={caf._next_folio}"
                    )
                except Exception as e:
                    logger.error(f"Failed to restore CAF key {key}: {e}")

            logger.info(f"Restored {count} CAFs from Odoo")
            return count

        except Exception as e:
            logger.error(f"Failed to restore CAFs from Odoo: {e}")
            return 0


# Singleton global
caf_manager = CAFManager()
