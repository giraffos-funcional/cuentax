"""
Utilidades RUT — Validación y formateo para el SII Chile
==========================================================
Implementa la validación del dígito verificador del RUT chileno
y formatos de presentación estándar.
"""

import re
import logging

logger = logging.getLogger(__name__)


class RUTError(ValueError):
    """Error de RUT inválido."""
    pass


def clean_rut(rut: str) -> str:
    """
    Limpia un RUT removiendo puntos y guiones.
    
    >>> clean_rut("12.345.678-9") → "123456789"
    >>> clean_rut("12345678-9")   → "123456789"
    """
    return re.sub(r"[.\-]", "", rut).upper().strip()


def calculate_dv(rut_numbers: str) -> str:
    """
    Calcula el dígito verificador de un RUT.
    Algoritmo Módulo 11 estándar SII Chile.
    
    Args:
        rut_numbers: Parte numérica del RUT sin DV (ej: "12345678")
        
    Returns:
        Dígito verificador calculado (0-9 o 'K')
    """
    total = 0
    multiplier = 2

    for digit in reversed(rut_numbers):
        total += int(digit) * multiplier
        multiplier = 2 if multiplier == 7 else multiplier + 1

    remainder = 11 - (total % 11)

    if remainder == 11:
        return "0"
    elif remainder == 10:
        return "K"
    else:
        return str(remainder)


def validate_rut(rut: str) -> bool:
    """
    Valida un RUT chileno (formato con o sin puntos/guión).
    
    Args:
        rut: RUT a validar (ej: "12.345.678-9", "12345678-9", "K")
        
    Returns:
        True si el RUT es válido
    """
    cleaned = clean_rut(rut)
    
    if len(cleaned) < 2:
        return False
    
    rut_body = cleaned[:-1]
    dv_input = cleaned[-1]
    
    if not rut_body.isdigit():
        return False
    
    return calculate_dv(rut_body) == dv_input


def format_rut(rut: str, dots: bool = True) -> str:
    """
    Formatea un RUT al estándar chileno.
    
    Args:
        rut: RUT a formatear (limpio o formateado)
        dots: Si True, incluye puntos separadores de miles
        
    Returns:
        RUT formateado (ej: "12.345.678-9" o "12345678-9")
        
    Raises:
        RUTError: Si el RUT es inválido
    """
    if not validate_rut(rut):
        raise RUTError(f"RUT inválido: {rut}")
    
    cleaned = clean_rut(rut)
    body = cleaned[:-1]
    dv = cleaned[-1]
    
    if dots:
        # Formatear con puntos de miles
        formatted_body = ""
        for i, char in enumerate(reversed(body)):
            if i > 0 and i % 3 == 0:
                formatted_body = "." + formatted_body
            formatted_body = char + formatted_body
        return f"{formatted_body}-{dv}"
    else:
        return f"{body}-{dv}"


def extract_rut_parts(rut: str) -> tuple[str, str]:
    """
    Extrae las partes de un RUT: (cuerpo, dígito_verificador).
    
    Returns:
        Tupla (body, dv) donde body es el número sin DV y dv es el dígito
        
    Raises:
        RUTError: Si el RUT es inválido
    """
    if not validate_rut(rut):
        raise RUTError(f"RUT inválido: {rut}")
    
    cleaned = clean_rut(rut)
    return cleaned[:-1], cleaned[-1]
