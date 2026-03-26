"""
Endpoint de validación de RUT.
Expone las utilidades de RUT como API REST.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.utils.rut import validate_rut, format_rut, extract_rut_parts, RUTError

router = APIRouter()


class RUTValidateRequest(BaseModel):
    rut: str


class RUTValidateResponse(BaseModel):
    rut: str
    valid: bool
    formatted: str | None = None
    body: str | None = None
    dv: str | None = None


@router.post("/validate", response_model=RUTValidateResponse)
async def validate_rut_endpoint(body: RUTValidateRequest):
    """
    Valida y formatea un RUT chileno.
    
    - Verifica el dígito verificador (Módulo 11)
    - Retorna versión formateada con puntos y guión
    """
    is_valid = validate_rut(body.rut)
    
    if not is_valid:
        return RUTValidateResponse(rut=body.rut, valid=False)
    
    try:
        formatted = format_rut(body.rut, dots=True)
        rut_body, dv = extract_rut_parts(body.rut)
        return RUTValidateResponse(
            rut=body.rut,
            valid=True,
            formatted=formatted,
            body=rut_body,
            dv=dv,
        )
    except RUTError as e:
        raise HTTPException(status_code=400, detail=str(e))
