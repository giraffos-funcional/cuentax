"""
CUENTAX — Webhook Manager (Sprint 5)
======================================
Sistema de webhooks para integraciones externas.
Notifica eventos a sistemas de terceros (ERP, e-commerce, etc.)

Eventos soportados:
- dte.emitido        → nuevo DTE generado
- dte.aceptado       → SII aceptó el DTE
- dte.rechazado      → SII rechazó el DTE
- caf.bajo_stock     → folios < 10%
- certificado.vencerá → cert vence en < 30 días
"""

import logging
import hmac
import hashlib
import json
import asyncio
from datetime import datetime, timezone
from typing import Optional
import httpx

logger = logging.getLogger(__name__)

WEBHOOK_EVENTS = {
    "dte.emitido",
    "dte.aceptado",
    "dte.rechazado",
    "dte.anulado",
    "caf.bajo_stock",
    "certificado.vencera",
}


class WebhookEndpoint:
    """Configuración de un endpoint de webhook."""
    def __init__(self, url: str, secret: str, events: list[str], tenant_id: str):
        self.url = url
        self.secret = secret
        self.events = set(events)
        self.tenant_id = tenant_id
        self.created_at = datetime.now(timezone.utc).isoformat()
        self.active = True


class WebhookManager:
    """
    Gestiona registro y despacho de webhooks.
    En producción, usar una cola (Redis Streams / BullMQ) en lugar de asyncio.
    """

    def __init__(self):
        # {tenant_id: [WebhookEndpoint]}
        self._endpoints: dict[str, list[WebhookEndpoint]] = {}

    def register(self, tenant_id: str, url: str, secret: str, events: list[str]) -> dict:
        """Registra un nuevo webhook para un tenant."""
        # Validar eventos
        invalid = set(events) - WEBHOOK_EVENTS
        if invalid:
            raise ValueError(f"Eventos inválidos: {invalid}. Válidos: {WEBHOOK_EVENTS}")

        endpoint = WebhookEndpoint(url, secret, events, tenant_id)
        self._endpoints.setdefault(tenant_id, []).append(endpoint)

        logger.info(f"Webhook registrado para tenant {tenant_id}: {url}")
        return {
            "url": url,
            "events": events,
            "created_at": endpoint.created_at,
            "active": True,
        }

    async def dispatch(self, tenant_id: str, event: str, payload: dict) -> None:
        """
        Despacha un evento a todos los webhooks suscritos del tenant.
        Reintenta hasta 3 veces con backoff exponencial.
        """
        endpoints = [
            ep for ep in self._endpoints.get(tenant_id, [])
            if ep.active and event in ep.events
        ]

        if not endpoints:
            return

        event_body = {
            "event": event,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "tenant_id": tenant_id,
            "data": payload,
        }

        tasks = [self._send(ep, event_body) for ep in endpoints]
        await asyncio.gather(*tasks, return_exceptions=True)

    async def _send(self, endpoint: WebhookEndpoint, body: dict, max_retries: int = 3) -> None:
        """Envía la notificación con reintentos."""
        body_json = json.dumps(body, ensure_ascii=False)
        signature = self._sign(body_json, endpoint.secret)

        headers = {
            "Content-Type": "application/json",
            "X-CUENTAX-Signature": f"sha256={signature}",
            "X-CUENTAX-Event": body["event"],
            "User-Agent": "CUENTAX-Webhooks/1.0",
        }

        for attempt in range(max_retries):
            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    response = await client.post(endpoint.url, content=body_json, headers=headers)
                    if response.status_code < 400:
                        logger.info(f"Webhook OK → {endpoint.url} [{body['event']}]")
                        return
                    logger.warning(f"Webhook {attempt+1}/{max_retries} failed: {response.status_code}")
            except Exception as e:
                logger.warning(f"Webhook error {attempt+1}/{max_retries}: {e}")

            if attempt < max_retries - 1:
                await asyncio.sleep(2 ** attempt)  # 1s, 2s, 4s

        logger.error(f"Webhook permanentemente fallido → {endpoint.url}")

    @staticmethod
    def _sign(body: str, secret: str) -> str:
        """Genera firma HMAC-SHA256 para verificación del receptor."""
        return hmac.new(
            secret.encode(),
            body.encode(),
            hashlib.sha256,
        ).hexdigest()

    def list_endpoints(self, tenant_id: str) -> list[dict]:
        return [
            {
                "url": ep.url,
                "events": list(ep.events),
                "active": ep.active,
                "created_at": ep.created_at,
            }
            for ep in self._endpoints.get(tenant_id, [])
        ]


webhook_manager = WebhookManager()
