"""
CUENTAX — Certificate Endpoint
Soporta múltiples empresas compartiendo certificados digitales.
Un certificado pertenece a un titular (persona), quien puede
firmar DTEs para múltiples empresas como representante legal.
"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from app.services.certificate import certificate_service

router = APIRouter()


class AssociateRequest(BaseModel):
    rut_empresa: str


@router.post("/load")
async def load_certificate(
    file: UploadFile = File(..., description="Archivo .pfx o .p12"),
    password: str = Form(..., description="Contraseña del certificado"),
    rut_empresa: str = Form(..., description="RUT de la empresa (12.345.678-9)"),
):
    """
    Carga un certificado digital PFX/P12 y lo asocia a una empresa.

    Si el mismo certificado (mismo titular) ya está cargado, solo agrega
    el mapeo de la nueva empresa. Un titular puede firmar para múltiples empresas.
    """
    if not file.filename.lower().endswith((".pfx", ".p12")):
        raise HTTPException(400, detail="Solo se aceptan archivos .pfx o .p12")

    raw = await file.read()
    if len(raw) == 0:
        raise HTTPException(400, detail="Archivo vacío")

    try:
        return certificate_service.load_pfx(raw, password, rut_empresa)
    except ValueError as e:
        raise HTTPException(422, detail=str(e))


@router.post("/associate")
async def associate_company(body: AssociateRequest):
    """
    Asocia una empresa al certificado ya cargado.

    Funciona solo si hay exactamente un certificado cargado.
    Si hay múltiples certificados, usa /load para asociar al cert correcto.
    """
    try:
        return certificate_service.associate_company(body.rut_empresa)
    except RuntimeError as e:
        raise HTTPException(400, detail=str(e))


@router.get("/status")
async def get_status(
    rut_empresa: Optional[str] = Query(
        None, description="RUT de la empresa para consultar estado específico"
    ),
):
    """
    Estado del certificado cargado.

    Si se proporciona rut_empresa, retorna el estado para esa empresa específica.
    Si no, retorna el estado general con la lista de todos los certificados y empresas.
    """
    return certificate_service.get_status(rut_empresa)


@router.get("/list")
async def list_certificates():
    """Lista todos los certificados cargados con sus empresas asociadas."""
    certs = certificate_service.get_available_certs()
    return {
        "total_certificados": len(certs),
        "certificados": certs,
    }
