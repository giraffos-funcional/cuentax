"""
CUENTAX -- Odoo JSON-RPC Adapter
=================================
Generic client for communicating with Odoo via JSON-RPC.
Used to persist CAFs and certificates so they survive sii-bridge restarts.
"""

import logging
import xmlrpc.client
from typing import Any, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


class OdooRPC:
    """Thin wrapper around Odoo's XML-RPC API."""

    def __init__(self):
        self._uid: Optional[int] = None
        self._url = settings.ODOO_URL
        self._db = settings.ODOO_DB
        self._username = settings.ODOO_USERNAME
        self._password = settings.ODOO_PASSWORD

    @property
    def uid(self) -> int:
        if self._uid is None:
            common = xmlrpc.client.ServerProxy(
                f"{self._url}/xmlrpc/2/common", allow_none=True
            )
            self._uid = common.authenticate(
                self._db, self._username, self._password, {}
            )
            if not self._uid:
                raise RuntimeError(
                    f"Odoo auth failed for {self._username}@{self._db}"
                )
            logger.info(f"Odoo authenticated: uid={self._uid}")
        return self._uid

    @property
    def _models(self):
        return xmlrpc.client.ServerProxy(
            f"{self._url}/xmlrpc/2/object", allow_none=True
        )

    def execute(self, model: str, method: str, *args, **kwargs) -> Any:
        return self._models.execute_kw(
            self._db, self.uid, self._password,
            model, method, list(args), kwargs
        )

    def search(self, model: str, domain: list, **kwargs) -> list[int]:
        return self.execute(model, "search", domain, **kwargs)

    def read(self, model: str, ids: list[int], fields: list[str]) -> list[dict]:
        return self.execute(model, "read", ids, {"fields": fields})

    def search_read(
        self, model: str, domain: list, fields: list[str], **kwargs
    ) -> list[dict]:
        return self.execute(
            model, "search_read", domain, fields=fields, **kwargs
        )

    def create(self, model: str, vals: dict) -> int:
        return self.execute(model, "create", [vals])

    def write(self, model: str, ids: list[int], vals: dict) -> bool:
        return self.execute(model, "write", ids, vals)

    def ping(self) -> bool:
        try:
            common = xmlrpc.client.ServerProxy(
                f"{self._url}/xmlrpc/2/common", allow_none=True
            )
            common.version()
            return True
        except Exception:
            return False


odoo_rpc = OdooRPC()
