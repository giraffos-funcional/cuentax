"""CAF Endpoints — Sprint 2"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query
from app.services.caf_manager import caf_manager

router = APIRouter()

@router.post("/load")
async def load_caf(
    file: UploadFile = File(..., description="Archivo XML del CAF descargado del SII"),
    rut_empresa: str = Form("auto"),
    ambiente: str = Form(""),
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

    caf_data = caf_manager.load_caf_from_xml(xml_str, actual_rut, ambiente=ambiente)
    return {
        "success": True,
        "tipo_dte": caf_data.tipo_dte,
        "rut_empresa": caf_data.rut_empresa,
        "folio_desde": caf_data.folio_desde,
        "folio_hasta": caf_data.folio_hasta,
        "folios_disponibles": caf_data.folios_disponibles,
        "ambiente": caf_data.ambiente,
        "mensaje": f"CAF cargado: {caf_data.total_folios} folios tipo {caf_data.tipo_dte} para {actual_rut} [{caf_data.ambiente}]",
    }

@router.get("/status/{rut_empresa}")
async def get_caf_status(
    rut_empresa: str,
    ambiente: str = Query("", description="Filter by ambiente: certificacion, produccion, or empty for all"),
):
    """Retorna el estado de los CAFs de una empresa, filtrado por ambiente."""
    return {
        "rut_empresa": rut_empresa,
        "cafs": caf_manager.get_status(rut_empresa, ambiente=ambiente),
    }

@router.post("/reset/{rut_empresa}/{tipo_dte}")
async def reset_caf_folios(rut_empresa: str, tipo_dte: int, next_folio: int = 0):
    """Resetea el contador de folios de un CAF.
    Útil cuando los DTEs fueron firmados pero nunca enviados al SII.
    Pass next_folio to advance to a specific folio number.
    Finds the CAF whose range contains next_folio."""
    for k, caf_list in caf_manager._cafs.items():
        for caf in caf_list:
            if caf.rut_empresa != rut_empresa or caf.tipo_dte != tipo_dte:
                continue
            if next_folio and caf.folio_desde <= next_folio <= caf.folio_hasta:
                old_folio = caf._next_folio
                caf._next_folio = next_folio
                total = sum(c.folios_disponibles for c in caf_list if c.tipo_dte == tipo_dte)
                return {
                    "success": True,
                    "tipo_dte": tipo_dte,
                    "rut_empresa": rut_empresa,
                    "folio_desde": caf.folio_desde,
                    "folio_hasta": caf.folio_hasta,
                    "old_next_folio": old_folio,
                    "new_next_folio": caf._next_folio,
                    "folios_disponibles": total,
                    "mensaje": f"Reseteo exitoso: {total} folios disponibles",
                }
            elif not next_folio:
                old_folio = caf._next_folio
                caf._next_folio = caf.folio_desde
                return {
                    "success": True,
                    "tipo_dte": tipo_dte,
                    "rut_empresa": rut_empresa,
                    "folio_desde": caf.folio_desde,
                    "folio_hasta": caf.folio_hasta,
                    "old_next_folio": old_folio,
                    "new_next_folio": caf._next_folio,
                    "folios_disponibles": caf.folios_disponibles,
                    "mensaje": f"Reseteo exitoso: {caf.folios_disponibles} folios disponibles",
                }
    raise HTTPException(404, detail=f"No se encontró CAF tipo {tipo_dte} para {rut_empresa}")

@router.delete("/remove/{rut_empresa}/{tipo_dte}/{folio_desde}")
async def remove_caf(rut_empresa: str, tipo_dte: int, folio_desde: int):
    """Remove a specific CAF by its folio_desde. Also removes from Odoo persistence."""
    from app.core.config import settings
    import json

    ambiente = settings.SII_AMBIENTE
    key = (rut_empresa, tipo_dte, ambiente)
    caf_list = caf_manager._cafs.get(key, [])

    for i, caf in enumerate(caf_list):
        if caf.folio_desde == folio_desde:
            removed = caf_list.pop(i)
            # Remove from Odoo persistence
            try:
                from app.adapters.odoo_rpc import odoo_rpc
                param_key = caf_manager._caf_param_key(rut_empresa, tipo_dte, ambiente, folio_desde)
                odoo_rpc.execute("ir.config_parameter", "set_param", param_key, "")
                caf_manager._update_caf_index(odoo_rpc)
            except Exception as e:
                pass  # Best effort
            return {
                "success": True,
                "removed": f"CAF tipo {tipo_dte} folios {removed.folio_desde}-{removed.folio_hasta}",
                "remaining": len(caf_list),
            }

    raise HTTPException(404, detail=f"No CAF with folio_desde={folio_desde} for tipo {tipo_dte}")
