"""
Safe XML parsing utilities to prevent XXE (XML External Entity) attacks.
All XML parsing in the application MUST use these functions.
"""

from lxml import etree


def _safe_parser() -> etree.XMLParser:
    """Create an XML parser with external entities disabled."""
    return etree.XMLParser(
        resolve_entities=False,
        no_network=True,
        dtd_validation=False,
        load_dtd=False,
    )


def safe_fromstring(xml_data: bytes | str) -> etree._Element:
    """Parse XML from string/bytes with XXE protection."""
    if isinstance(xml_data, str):
        xml_data = xml_data.encode("utf-8")
    return etree.fromstring(xml_data, parser=_safe_parser())


def safe_parse(source) -> etree._ElementTree:
    """Parse XML from file-like object with XXE protection."""
    return etree.parse(source, parser=_safe_parser())
