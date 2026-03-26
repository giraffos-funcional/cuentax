"""
CUENTAX — Certificate Endpoint (actualizado)
Conecta con el CertificateService real que implementa XMLDSig.
"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from app.services.certificate import certificate_service

router = APIRouter()


@router.post("/load")
async def load_certificate(
    file: UploadFile = File(..., description="Archivo .pfx o .p12"),
    password: str = Form(..., description="Contraseña del certificado"),
    rut_empresa: str = Form(..., description="RUT de la empresa (12.345.678-9)"),
):
    """Carga un certificado digital PFX/P12 en memoria de forma segura."""
    if not file.filename.lower().endswith((".pfx", ".p12")):
        raise HTTPException(400, detail="Solo se aceptan archivos .pfx o .p12")

    raw = await file.read()
    if len(raw) == 0:
        raise HTTPException(400, detail="Archivo vacío")

    try:
        return certificate_service.load_pfx(raw, password, rut_empresa)
    except ValueError as e:
        raise HTTPException(422, detail=str(e))


@router.get("/status")
async def get_status():
    """Estado del certificado cargado."""
    return certificate_service.get_status()
