"""CAF Endpoints — Sprint 2"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from app.services.caf_manager import caf_manager

router = APIRouter()

@router.post("/load")
async def load_caf(
    file: UploadFile = File(..., description="Archivo XML del CAF descargado del SII"),
    rut_empresa: str = Form("auto"),
):
    """Carga un CAF (Código de Autorización de Folios) desde su XML oficial del SII."""
    if not file.filename.lower().endswith(".xml"):
        raise HTTPException(400, detail="Solo se aceptan archivos .xml")
    content = await file.read()
    xml_str = content.decode()

    # If rut_empresa is "auto" or empty, extract from the CAF XML itself
    actual_rut = rut_empresa
    if not actual_rut or actual_rut == "auto":
        from lxml import etree
        root = etree.fromstring(content)
        re_node = root.find(".//DA/RE")
        if re_node is None or not re_node.text:
            raise HTTPException(400, detail="No se pudo extraer RUT del CAF XML")
        actual_rut = re_node.text.strip()

    caf_data = caf_manager.load_caf_from_xml(xml_str, actual_rut)
    return {
        "success": True,
        "tipo_dte": caf_data.tipo_dte,
        "rut_empresa": caf_data.rut_empresa,
        "folio_desde": caf_data.folio_desde,
        "folio_hasta": caf_data.folio_hasta,
        "folios_disponibles": caf_data.folios_disponibles,
        "mensaje": f"CAF cargado: {caf_data.total_folios} folios tipo {caf_data.tipo_dte} para {actual_rut}",
    }

@router.get("/status/{rut_empresa}")
async def get_caf_status(rut_empresa: str):
    """Retorna el estado de todos los CAFs de una empresa."""
    return {
        "rut_empresa": rut_empresa,
        "cafs": caf_manager.get_status(rut_empresa),
    }
