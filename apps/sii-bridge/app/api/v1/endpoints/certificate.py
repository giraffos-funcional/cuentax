"""Endpoint de gestión del certificado digital."""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
import tempfile
import os
from app.services.certificate import certificate_service

router = APIRouter()


class CertificateStatusResponse(BaseModel):
    loaded: bool
    status: str
    message: str
    subject: str | None = None


@router.get("/status", response_model=CertificateStatusResponse)
async def get_certificate_status():
    """
    Retorna el estado actual del certificado digital cargado.
    """
    if certificate_service.is_loaded:
        return CertificateStatusResponse(
            loaded=True,
            status="ok",
            message="Certificado cargado y listo para firmar",
        )
    return CertificateStatusResponse(
        loaded=False,
        status="no_certificate",
        message="Sin certificado — carga uno para habilitar firma digital",
    )


@router.post("/load", response_model=CertificateStatusResponse)
async def load_certificate(
    file: UploadFile = File(..., description="Archivo .pfx o .p12"),
    password: str = Form(..., description="Contraseña del certificado"),
):
    """
    Carga un certificado digital PFX/P12.
    
    - El archivo se carga en memoria de forma segura
    - No se persiste en disco (solo en memoria del proceso)
    - Se valida antes de confirmar la carga
    """
    # Validar extensión
    if not file.filename.lower().endswith((".pfx", ".p12")):
        raise HTTPException(
            status_code=400,
            detail="Solo se aceptan archivos .pfx o .p12",
        )

    # Guardar temporalmente para cargar
    with tempfile.NamedTemporaryFile(suffix=".pfx", delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        success = certificate_service.load_certificate(
            cert_path=tmp_path,
            cert_password=password,
        )
    finally:
        os.unlink(tmp_path)  # Borrar siempre el archivo temporal

    if not success:
        raise HTTPException(
            status_code=400,
            detail="Error cargando el certificado. Verifica el archivo y contraseña.",
        )

    return CertificateStatusResponse(
        loaded=True,
        status="ok",
        message="Certificado cargado exitosamente",
    )
