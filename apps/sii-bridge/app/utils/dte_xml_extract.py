"""
Helpers to extract DTE data + TED string from XML envelopes.

Used by the certification wizard (muestras bulk) and the productive PDF endpoint.
Walks any <DTE>/<Documento> in the tree — works for bare DTEs, EnvioDTE, EnvioBOLETA.
"""

from lxml import etree


def _lname(el) -> str:
    return etree.QName(el.tag).localname if isinstance(el.tag, str) else ""


def _find(parent, name: str):
    if parent is None:
        return None
    for child in parent:
        if _lname(child) == name:
            return child
    return None


def _find_all(parent, name: str) -> list:
    if parent is None:
        return []
    return [c for c in parent if _lname(c) == name]


def _text(parent, name: str, default: str = "") -> str:
    el = _find(parent, name)
    if el is None or el.text is None:
        return default
    return el.text.strip()


def _int(parent, name: str, default: int = 0) -> int:
    raw = _text(parent, name, "")
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


def iter_documentos(root):
    """Yield (documento_node, extractor_callable) for every <DTE><Documento> in the tree.

    The extractor is lazy so callers can filter by folio/tipo before paying parse cost.
    Each call to the extractor returns (dte_data, ted_string, tipo_dte, folio).
    """
    for dte_node in [el for el in root.iter() if _lname(el) == "DTE"]:
        documento = _find(dte_node, "Documento")
        if documento is None:
            continue

        def make_extractor(doc_el):
            def _extract():
                encab = _find(doc_el, "Encabezado")
                id_doc = _find(encab, "IdDoc")
                emisor = _find(encab, "Emisor")
                receptor = _find(encab, "Receptor")
                totales = _find(encab, "Totales")

                tipo_dte = _int(id_doc, "TipoDTE")
                folio = _int(id_doc, "Folio")

                items: list[dict] = []
                for det in _find_all(doc_el, "Detalle"):
                    items.append({
                        "nombre": _text(det, "NmbItem"),
                        "cantidad": _int(det, "QtyItem") or 1,
                        "precio_unitario": _int(det, "PrcItem"),
                        "monto_item": _int(det, "MontoItem"),
                        "exento": _int(det, "IndExe") == 1,
                    })

                ref_el = _find(doc_el, "Referencia")
                referencia = None
                if ref_el is not None:
                    referencia = {
                        "tipo_doc": _text(ref_el, "TpoDocRef"),
                        "folio": _text(ref_el, "FolioRef"),
                        "fecha": _text(ref_el, "FchRef"),
                        "razon": _text(ref_el, "RazonRef"),
                    }

                dte_data = {
                    "tipo_dte": tipo_dte,
                    "folio": folio,
                    "fecha_emision": _text(id_doc, "FchEmis"),
                    "emisor": {
                        "rut": _text(emisor, "RUTEmisor"),
                        "razon_social": (
                            _text(emisor, "RznSoc")
                            or _text(emisor, "RznSocEmisor")
                        ),
                        "giro": (
                            _text(emisor, "GiroEmis")
                            or _text(emisor, "GiroEmisor")
                        ),
                        "direccion": _text(emisor, "DirOrigen"),
                        "comuna": _text(emisor, "CmnaOrigen"),
                        "ciudad": _text(emisor, "CiudadOrigen"),
                    },
                    "receptor": {
                        "rut": _text(receptor, "RUTRecep"),
                        "razon_social": _text(receptor, "RznSocRecep"),
                        "giro": _text(receptor, "GiroRecep"),
                        "direccion": _text(receptor, "DirRecep"),
                        "comuna": _text(receptor, "CmnaRecep"),
                        "ciudad": _text(receptor, "CiudadRecep"),
                    },
                    "items": items,
                    "totales": {
                        "neto": _int(totales, "MntNeto"),
                        "iva": _int(totales, "IVA"),
                        "exento": _int(totales, "MntExe"),
                        "total": _int(totales, "MntTotal"),
                    },
                }
                if referencia:
                    dte_data["referencia"] = referencia

                ted_el = _find(doc_el, "TED")
                ted_string = None
                if ted_el is not None:
                    ted_string = etree.tostring(
                        ted_el, encoding="unicode", xml_declaration=False
                    )

                return dte_data, ted_string, tipo_dte, folio

            return _extract

        yield documento, make_extractor(documento)


def extract_first(xml_b64_or_bytes) -> tuple[dict, str | None] | None:
    """Convenience: parse a base64 (or bytes) XML envelope and return (dte_data, ted_string)
    for the first <Documento> found. Returns None if no document."""
    import base64

    if isinstance(xml_b64_or_bytes, str):
        try:
            xml_bytes = base64.b64decode(xml_b64_or_bytes)
        except Exception:
            xml_bytes = xml_b64_or_bytes.encode("iso-8859-1", errors="replace")
    else:
        xml_bytes = xml_b64_or_bytes

    root = etree.fromstring(xml_bytes)
    for _doc_node, extract in iter_documentos(root):
        dte_data, ted_string, _tipo, _folio = extract()
        return dte_data, ted_string
    return None
