"""
CUENTAX — Certification wizard session persistence.
====================================================
Simple JSON-to-disk persistence for the in-memory certification session dict
kept in ``app.api.v1.endpoints.certification``.

Why this exists:
  The wizard session holds the signed ``EnvioDTE`` envelope (``xml_envio_b64``),
  CAFs metadata, and the parsed test set. Without persistence, a deploy or
  pod restart loses the signed XMLs so we cannot re-generate PDFs or re-send
  a libro without re-emitting (which consumes new folios).

Scope (intentionally minimal):
  - Each ``rut_emisor`` maps to ONE JSON file under ``SESSION_DIR``.
  - Set-valued fields (``steps_completed``) are serialized as lists and
    restored to ``set`` on load.
  - A process-wide asyncio lock would be nice; we keep it threadsafe-enough
    via atomic rename (``os.replace``).

Not scope:
  - Multi-node coordination. If two bridge pods write the same rut the last
    writer wins. In Coolify we run a single replica for the bridge, so this
    is fine for now.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

SESSION_DIR = Path(os.getenv("CUENTAX_SESSION_DIR", "/var/cuentax/sessions"))

# Session fields that must round-trip as ``set`` (JSON has no native set).
_SET_FIELDS = ("steps_completed",)


def _ensure_dir() -> None:
    try:
        SESSION_DIR.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        logger.warning(f"session_store: could not create {SESSION_DIR}: {e}")


def _path_for(rut_emisor: str) -> Path:
    # Keep the filename conservative; RUTs are already safe but sanitize anyway.
    safe = "".join(c for c in rut_emisor if c.isalnum() or c in "-_")
    return SESSION_DIR / f"{safe}.json"


def _to_serializable(value: Any) -> Any:
    """Recursively coerce sets → lists so json.dumps does not blow up."""
    if isinstance(value, set):
        return sorted(list(value), key=lambda x: (isinstance(x, str), x))
    if isinstance(value, dict):
        return {k: _to_serializable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_to_serializable(v) for v in value]
    return value


def save(rut_emisor: str, data: dict) -> bool:
    """Persist a single session. Returns True on success, False on any failure.

    Never raises — persistence failures must not break the request path.
    """
    if not rut_emisor:
        return False
    _ensure_dir()
    try:
        payload = _to_serializable(data)
        target = _path_for(rut_emisor)
        tmp = target.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(payload, default=str), encoding="utf-8")
        os.replace(tmp, target)
        return True
    except Exception as e:
        logger.warning(f"session_store: save({rut_emisor}) failed: {e}")
        return False


def load(rut_emisor: str) -> dict | None:
    """Load one session from disk, or None if not persisted / unreadable."""
    if not rut_emisor:
        return None
    path = _path_for(rut_emisor)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        logger.warning(f"session_store: load({rut_emisor}) failed: {e}")
        return None
    # Restore known set-valued fields.
    for field in _SET_FIELDS:
        if field in data and isinstance(data[field], list):
            data[field] = set(data[field])
    return data


def load_all() -> dict[str, dict]:
    """Load every persisted session; used at app startup."""
    _ensure_dir()
    sessions: dict[str, dict] = {}
    try:
        files = list(SESSION_DIR.glob("*.json"))
    except Exception as e:
        logger.warning(f"session_store: list {SESSION_DIR} failed: {e}")
        return sessions
    for path in files:
        rut = path.stem
        data = load(rut)
        if data is not None:
            sessions[rut] = data
    logger.info(f"session_store: restored {len(sessions)} session(s) from {SESSION_DIR}")
    return sessions


def delete(rut_emisor: str) -> None:
    """Remove persisted session file, if any. Never raises."""
    try:
        _path_for(rut_emisor).unlink(missing_ok=True)
    except Exception as e:
        logger.warning(f"session_store: delete({rut_emisor}) failed: {e}")
