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
import os
from pathlib import Path
from typing import Optional
from lxml import etree
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding

logger = logging.getLogger(__name__)

# Disk-backed CAF cache. Same pattern as session_store: under uvicorn with
# multiple workers each process has its own _cafs dict, so CAFs uploaded to
# worker A are invisible to workers B/C/D. We mirror every CAF load + folio
# consumption to a JSON file under CAF_DIR so any worker can rehydrate by
# reading the file. Atomic via os.replace.
CAF_DIR = Path(os.getenv("CUENTAX_CAF_DIR", "/var/cuentax/cafs"))


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
        ambiente: str = "certificacion",
    ):
        self.tipo_dte = tipo_dte
        self.rut_empresa = rut_empresa
        self.folio_desde = folio_desde
        self.folio_hasta = folio_hasta
        self.timestamp_autorizacion = timestamp_autorizacion
        self.private_key_pem = private_key_pem
        self.caf_xml_raw = caf_xml_raw
        self.ambiente = ambiente
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
            "ambiente": self.ambiente,
        }


class CAFManager:
    """
    Gestiona múltiples CAFs por tipo de DTE, empresa y ambiente.
    Key: (rut_empresa, tipo_dte, ambiente) → list[CAFData]
    Supports multiple CAFs per type (SII gives 1-folio CAFs for some types).
    """

    def __init__(self):
        # {(rut_empresa, tipo_dte, ambiente): [CAFData, ...]}
        self._cafs: dict[tuple[str, int, str], list[CAFData]] = {}

    # ── Disk persistence helpers (multi-worker safe) ────────────
    def _disk_key(self, rut: str, tipo: int, ambiente: str, folio_desde: int) -> Path:
        try:
            CAF_DIR.mkdir(parents=True, exist_ok=True)
        except OSError:
            pass
        safe_rut = "".join(c for c in rut if c.isalnum() or c in "-_")
        return CAF_DIR / f"{safe_rut}.{tipo}.{ambiente or 'default'}.{folio_desde}.json"

    def _save_to_disk(self, caf: 'CAFData') -> None:
        try:
            payload = self._caf_to_dict(caf)
            target = self._disk_key(caf.rut_empresa, caf.tipo_dte, caf.ambiente, caf.folio_desde)
            tmp = target.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(payload), encoding="utf-8")
            os.replace(tmp, target)
        except Exception as e:
            logger.warning(f"caf_manager: disk save failed: {e}")

    def _load_from_disk_for(self, rut: str, tipo: int, ambiente: str) -> int:
        """Hydrate this worker's _cafs[key] from any matching files on disk.
        Returns count of CAFs loaded."""
        if not ambiente:
            from app.core.config import settings
            ambiente = settings.SII_AMBIENTE
        try:
            CAF_DIR.mkdir(parents=True, exist_ok=True)
            safe_rut = "".join(c for c in rut if c.isalnum() or c in "-_")
            prefix = f"{safe_rut}.{tipo}.{ambiente}."
            files = [p for p in CAF_DIR.glob(f"{safe_rut}.{tipo}.{ambiente}.*.json")]
        except Exception:
            return 0
        key = (rut, tipo, ambiente)
        existing = self._cafs.setdefault(key, [])
        existing_ranges = {(c.folio_desde, c.folio_hasta) for c in existing}
        loaded = 0
        for f in files:
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
                pair = (data["folio_desde"], data["folio_hasta"])
                priv = data.get("private_key_pem", "")
                xml_raw = data.get("caf_xml_raw", "")
                if not priv and xml_raw:
                    try:
                        root = etree.fromstring(xml_raw.encode() if isinstance(xml_raw, str) else xml_raw)
                        pk = root.find(".//RSASK") or root.find(".//ECCSK")
                        if pk is not None and pk.text:
                            priv = pk.text.strip()
                    except Exception:
                        pass
                caf = CAFData(
                    tipo_dte=data["tipo_dte"],
                    rut_empresa=data["rut_empresa"],
                    folio_desde=data["folio_desde"],
                    folio_hasta=data["folio_hasta"],
                    timestamp_autorizacion=data.get("timestamp_autorizacion", ""),
                    private_key_pem=priv,
                    caf_xml_raw=xml_raw,
                    ambiente=data.get("ambiente", ambiente),
                )
                caf._next_folio = data.get("next_folio", data["folio_desde"])
                if pair in existing_ranges:
                    # Replace in-place if disk has newer next_folio
                    for i, c in enumerate(existing):
                        if (c.folio_desde, c.folio_hasta) == pair:
                            if caf._next_folio > c._next_folio:
                                existing[i] = caf
                            break
                else:
                    existing.append(caf)
                    existing_ranges.add(pair)
                    loaded += 1
            except Exception as e:
                logger.warning(f"caf_manager: disk load {f} failed: {e}")
        return loaded

    def load_caf_from_xml(self, caf_xml: str, rut_empresa: str, ambiente: str = "") -> CAFData:
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

            # Resolve ambiente: param > settings default
            if not ambiente:
                from app.core.config import settings
                ambiente = settings.SII_AMBIENTE

            caf_data = CAFData(
                tipo_dte=tipo_dte,
                rut_empresa=rut_caf,
                folio_desde=folio_desde,
                folio_hasta=folio_hasta,
                timestamp_autorizacion=fecha_autorizacion,
                private_key_pem=private_key_pem,
                caf_xml_raw=caf_xml if isinstance(caf_xml, str) else caf_xml.decode(),
                ambiente=ambiente,
            )

            key = (rut_empresa, tipo_dte, ambiente)
            if key not in self._cafs:
                self._cafs[key] = []
            # Avoid duplicates (same folio range)
            existing_ranges = {(c.folio_desde, c.folio_hasta) for c in self._cafs[key]}
            if (folio_desde, folio_hasta) not in existing_ranges:
                self._cafs[key].append(caf_data)
            else:
                # Replace existing CAF with same range (reset counter)
                for i, c in enumerate(self._cafs[key]):
                    if c.folio_desde == folio_desde and c.folio_hasta == folio_hasta:
                        self._cafs[key][i] = caf_data
                        break

            logger.info(
                f"✅ CAF cargado. Tipo {tipo_dte}, RUT {rut_caf}, "
                f"Folios {folio_desde}-{folio_hasta} ({folio_hasta - folio_desde + 1} folios) "
                f"[{ambiente}] (total CAFs tipo {tipo_dte}: {len(self._cafs[key])})"
            )

            # Persist to disk (multi-worker safe) + Odoo (long-term)
            self._save_to_disk(caf_data)
            self.save_to_odoo(caf_data)

            return caf_data

        except Exception as e:
            logger.error(f"Error cargando CAF: {e}")
            raise

    def get_next_folio(self, rut_empresa: str, tipo_dte: int, ambiente: str = "") -> Optional[int]:
        """
        Obtiene y reserva el próximo folio para emitir un DTE.
        Iterates through all CAFs of this type, using the first with available folios.

        Returns:
            Número de folio o None si no hay CAF disponible
        """
        if not ambiente:
            from app.core.config import settings
            ambiente = settings.SII_AMBIENTE
        key = (rut_empresa, tipo_dte, ambiente)

        # Multi-worker fallback: always sync from disk first so this worker
        # picks up CAFs uploaded to other workers AND folio positions
        # consumed by other workers (avoids duplicate folio assignment).
        try:
            self._load_from_disk_for(rut_empresa, tipo_dte, ambiente)
        except Exception as e:
            logger.warning(f"caf_manager: disk sync failed: {e}")

        caf_list = self._cafs.get(key, [])

        # If still empty, try Odoo as long-term backup.
        if not caf_list:
            try:
                self.restore_from_odoo()
                caf_list = self._cafs.get(key, [])
            except Exception as e:
                logger.warning(f"caf_manager: lazy restore from Odoo failed: {e}")

        if not caf_list:
            logger.warning(f"No hay CAF para RUT {rut_empresa} tipo {tipo_dte}")
            return None

        # Sort by folio_desde to consume in order
        for caf in sorted(caf_list, key=lambda c: c.folio_desde):
            folio = caf.consume_folio()
            if folio:
                # Persist consumed position to disk (multi-worker safe)
                # so siblings see the new next_folio on next load.
                try:
                    self._save_to_disk(caf)
                except Exception as e:
                    logger.warning(f"caf_manager: disk consume sync failed: {e}")
                # Sync folio position to Odoo (long-term)
                self.sync_folio_to_odoo(rut_empresa, tipo_dte, ambiente)

                if caf.necesita_renovacion:
                    total_remaining = sum(c.folios_disponibles for c in caf_list)
                    if total_remaining < 5:
                        logger.warning(
                            f"⚠️  CAF tipo {tipo_dte}: solo quedan {total_remaining} folios total. "
                            f"Renovar en el portal SII."
                        )
                return folio

        logger.error(f"Todos los CAFs agotados para tipo {tipo_dte} — renovar urgente")
        return None

    def get_status(self, rut_empresa: str, ambiente: str = "") -> list[dict]:
        """Retorna el estado de los CAFs de una empresa, filtrado por ambiente.
        Aggregates multiple CAFs of the same type into a single status entry."""
        result = []
        for (rut, tipo, amb), caf_list in self._cafs.items():
            if rut != rut_empresa or (ambiente and amb != ambiente):
                continue
            # Aggregate: show combined availability across all CAFs of this type
            total_disponibles = sum(c.folios_disponibles for c in caf_list)
            # Use the first CAF with available folios for display
            active = next((c for c in sorted(caf_list, key=lambda c: c.folio_desde) if c.folios_disponibles > 0), caf_list[0])
            status = active.status
            status["folios_disponibles"] = total_disponibles
            status["caf_count"] = len(caf_list)
            result.append(status)
        return result

    def get_caf(self, rut_empresa: str, tipo_dte: int, ambiente: str = "", folio: int = 0) -> Optional[CAFData]:
        """Returns the CAF for a specific folio (for TED signing).
        If folio is specified, returns the CAF whose range contains it.
        Otherwise returns the first CAF with available folios."""
        if not ambiente:
            from app.core.config import settings
            ambiente = settings.SII_AMBIENTE
        # Always pull latest disk state first so we never sign with a stale
        # CAF whose key was rotated or whose next_folio advanced elsewhere.
        try:
            self._load_from_disk_for(rut_empresa, tipo_dte, ambiente)
        except Exception as e:
            logger.warning(f"caf_manager: disk sync failed: {e}")
        caf_list = self._cafs.get((rut_empresa, tipo_dte, ambiente), [])
        if not caf_list:
            try:
                self.restore_from_odoo()
                caf_list = self._cafs.get((rut_empresa, tipo_dte, ambiente), [])
            except Exception as e:
                logger.warning(f"caf_manager: lazy restore from Odoo failed: {e}")
            if not caf_list:
                return None
        # If folio specified, find the CAF that owns it
        if folio:
            for caf in caf_list:
                if caf.folio_desde <= folio <= caf.folio_hasta:
                    return caf
        # Fallback: first CAF with available folios (sorted by folio_desde)
        for caf in sorted(caf_list, key=lambda c: c.folio_desde):
            if caf.folios_disponibles > 0:
                return caf
        return caf_list[-1]

    # ── Odoo Persistence (ir.config_parameter) ─────────────────
    # Uses Odoo's built-in key-value store so no custom modules needed.
    # Key format: cuentax.caf.{rut}.{tipo} → JSON blob

    def _caf_param_key(self, rut: str, tipo: int, ambiente: str = "", folio_desde: int = 0) -> str:
        base = f"cuentax.caf.{rut}.{tipo}"
        if ambiente:
            base += f".{ambiente}"
        if folio_desde:
            base += f".{folio_desde}"
        return base

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
            "ambiente": caf.ambiente,
        }

    def save_to_odoo(self, caf_data: CAFData) -> bool:
        """Save a CAF to Odoo ir.config_parameter."""
        try:
            from app.adapters.odoo_rpc import odoo_rpc
            key = self._caf_param_key(caf_data.rut_empresa, caf_data.tipo_dte, caf_data.ambiente, caf_data.folio_desde)
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

    def sync_folio_to_odoo(self, rut_empresa: str, tipo_dte: int, ambiente: str = "") -> None:
        """Sync current folio position back to Odoo after consumption."""
        if not ambiente:
            from app.core.config import settings
            ambiente = settings.SII_AMBIENTE
        caf_list = self._cafs.get((rut_empresa, tipo_dte, ambiente), [])
        for caf in caf_list:
            try:
                from app.adapters.odoo_rpc import odoo_rpc
                key = self._caf_param_key(rut_empresa, tipo_dte, ambiente, caf.folio_desde)
                value = json.dumps(self._caf_to_dict(caf))
                odoo_rpc.execute("ir.config_parameter", "set_param", key, value)
            except Exception as e:
                logger.error(f"Failed to sync folio to Odoo: {e}")

    def _update_caf_index(self, odoo_rpc) -> None:
        """Maintain an index of all CAF param keys for restore."""
        keys = []
        for caf_list in self._cafs.values():
            for caf in caf_list:
                keys.append(self._caf_param_key(caf.rut_empresa, caf.tipo_dte, caf.ambiente, caf.folio_desde))
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
                    private_key_pem = data.get("private_key_pem", "")
                    caf_xml_raw = data.get("caf_xml_raw", "")

                    # Re-extract private key from XML if it was lost
                    if not private_key_pem and caf_xml_raw:
                        try:
                            root = etree.fromstring(
                                caf_xml_raw.encode() if isinstance(caf_xml_raw, str) else caf_xml_raw
                            )
                            privk = root.find(".//RSASK") or root.find(".//ECCSK")
                            if privk is not None and privk.text:
                                private_key_pem = privk.text.strip()
                                logger.info(f"Re-extracted private key from stored XML ({len(private_key_pem)} chars)")
                        except Exception as ex:
                            logger.error(f"Failed to re-extract key from XML: {ex}")

                    amb = data.get("ambiente", "certificacion")
                    caf = CAFData(
                        tipo_dte=data["tipo_dte"],
                        rut_empresa=data["rut_empresa"],
                        folio_desde=data["folio_desde"],
                        folio_hasta=data["folio_hasta"],
                        timestamp_autorizacion=data.get("timestamp_autorizacion", ""),
                        private_key_pem=private_key_pem,
                        caf_xml_raw=caf_xml_raw,
                        ambiente=amb,
                    )
                    caf._next_folio = data.get("next_folio", data["folio_desde"])

                    mem_key = (data["rut_empresa"], data["tipo_dte"], amb)
                    if mem_key not in self._cafs:
                        self._cafs[mem_key] = []
                    self._cafs[mem_key].append(caf)
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
