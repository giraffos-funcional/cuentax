"""Webhook Endpoints — Sprint 5"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, HttpUrl
from app.services.webhook_manager import webhook_manager, WEBHOOK_EVENTS

router = APIRouter()

class WebhookCreate(BaseModel):
    url: HttpUrl
    secret: str
    events: list[str]
    tenant_id: str

@router.post("/register")
async def register_webhook(body: WebhookCreate):
    """Registra un webhook para recibir eventos de CUENTAX."""
    try:
        result = webhook_manager.register(
            tenant_id=body.tenant_id,
            url=str(body.url),
            secret=body.secret,
            events=body.events,
        )
        return {"success": True, **result}
    except ValueError as e:
        raise HTTPException(400, detail=str(e))

@router.get("/events")
async def list_events():
    """Lista todos los tipos de eventos disponibles."""
    return {"events": list(WEBHOOK_EVENTS)}

@router.get("/{tenant_id}")
async def list_webhooks(tenant_id: str):
    """Lista los webhooks registrados para un tenant."""
    return {"tenant_id": tenant_id, "endpoints": webhook_manager.list_endpoints(tenant_id)}
