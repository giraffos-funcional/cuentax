#!/usr/bin/env python3
"""
CUENTAX — Envío manual de XML al SII desde máquina local
=========================================================
Uso:
  python3 scripts/send_to_sii.py envio_dte.xml --pfx firma.pfx --password TuClave

El servidor en Hetzner no puede conectarse a maullin.sii.cl (IPs europeas).
Este script se ejecuta desde tu Mac (que sí tiene conectividad al SII)
y realiza:
  1. Carga el certificado PFX
  2. Obtiene semilla del SII (getSeed)
  3. Firma la semilla con el certificado
  4. Intercambia por token de sesión (getToken)
  5. Envía el XML firmado (uploadDTE)
  6. Retorna el Track ID

Dependencias:
  pip3 install cryptography lxml requests zeep
"""

import argparse
import base64
import hashlib
import logging
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# ── Config ─────────────────────────────────────────────────
SII_WSDLS = {
    "certificacion": {
        "auth":   "https://maullin.sii.cl/DTEWS/CrSeed.jws?WSDL",
        "token":  "https://maullin.sii.cl/DTEWS/GetTokenFromSeed.jws?WSDL",
        "upload": "https://maullin.sii.cl/DTEWS/services/MipagoDte?WSDL",
    },
    "produccion": {
        "auth":   "https://palena.sii.cl/DTEWS/CrSeed.jws?WSDL",
        "token":  "https://palena.sii.cl/DTEWS/GetTokenFromSeed.jws?WSDL",
        "upload": "https://palena.sii.cl/DTEWS/services/MipagoDte?WSDL",
    },
}

XMLDSIG_NS = "http://www.w3.org/2000/09/xmldsig#"
C14N_METHOD = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"


def load_pfx(pfx_path: str, password: str):
    """Load PFX certificate and return (private_key, certificate)."""
    from cryptography.hazmat.primitives.serialization import pkcs12
    from cryptography.hazmat.backends import default_backend

    pfx_bytes = Path(pfx_path).read_bytes()
    private_key, certificate, _ = pkcs12.load_key_and_certificates(
        pfx_bytes, password.encode(), backend=default_backend()
    )
    if not private_key or not certificate:
        raise ValueError("PFX no contiene clave privada o certificado")

    logger.info(f"✅ Certificado cargado: {certificate.subject}")
    return private_key, certificate


def get_seed(wsdls: dict) -> str:
    """Step 1: Get seed from SII."""
    import zeep
    from lxml import etree

    client = zeep.Client(wsdls["auth"])
    response = client.service.getSeed()

    root = etree.fromstring(response.encode() if isinstance(response, str) else response)
    seed_el = root.find(".//{http://DefaultNamespace}SEMILLA") or root.find(".//SEMILLA")

    if seed_el is None or not seed_el.text:
        raise RuntimeError(f"No seed in SII response: {response[:200]}")

    seed = seed_el.text.strip()
    logger.info(f"✅ Semilla obtenida: {seed[:10]}...")
    return seed


def sign_seed(seed: str, private_key, certificate) -> str:
    """Step 2: Sign the seed XML with the certificate."""
    from lxml import etree
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    seed_xml = etree.fromstring(f"""<getToken>
        <item><Semilla>{seed}</Semilla></item>
    </getToken>""".strip().encode())

    element_id = ""
    c14n_bytes = etree.tostring(seed_xml, method="c14n", exclusive=False, with_comments=False)
    digest = base64.b64encode(hashlib.sha1(c14n_bytes).digest()).decode()

    signed_info_xml = f"""<SignedInfo xmlns="{XMLDSIG_NS}">
        <CanonicalizationMethod Algorithm="{C14N_METHOD}"/>
        <SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>
        <Reference URI="">
            <DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
            <DigestValue>{digest}</DigestValue>
        </Reference>
    </SignedInfo>"""

    signed_info_c14n = etree.tostring(
        etree.fromstring(signed_info_xml.encode()), method="c14n"
    )

    sig_bytes = private_key.sign(signed_info_c14n, padding.PKCS1v15(), hashes.SHA1())
    sig_b64 = base64.b64encode(sig_bytes).decode()
    cert_b64 = base64.b64encode(certificate.public_bytes(serialization.Encoding.DER)).decode()

    signature_xml = f"""<Signature xmlns="{XMLDSIG_NS}">
        {signed_info_xml}
        <SignatureValue>{sig_b64}</SignatureValue>
        <KeyInfo><X509Data><X509Certificate>{cert_b64}</X509Certificate></X509Data></KeyInfo>
    </Signature>"""

    seed_xml.append(etree.fromstring(signature_xml.encode()))
    result = etree.tostring(seed_xml, encoding="unicode", xml_declaration=False)

    logger.info("✅ Semilla firmada")
    return result


def get_token(signed_seed_xml: str, wsdls: dict) -> str:
    """Step 3: Exchange signed seed for SII session token."""
    import zeep
    from lxml import etree

    client = zeep.Client(wsdls["token"])
    response = client.service.getToken(signed_seed_xml)

    root = etree.fromstring(response.encode() if isinstance(response, str) else response)
    token_el = root.find(".//{http://DefaultNamespace}TOKEN") or root.find(".//TOKEN")
    estado_el = root.find(".//ESTADO") or root.find(".//estado")

    if estado_el is not None and estado_el.text.strip() != "00":
        glosa = root.find(".//GLOSA")
        raise RuntimeError(
            f"SII rechazó semilla. Estado: {estado_el.text}, "
            f"Glosa: {glosa.text if glosa is not None else 'N/A'}"
        )

    if token_el is None or not token_el.text:
        raise RuntimeError(f"No TOKEN in SII response: {response[:200]}")

    token = token_el.text.strip()
    logger.info(f"✅ Token SII obtenido: {token[:20]}...")
    return token


def extract_rut_from_xml(xml_path: str) -> tuple[str, str]:
    """Extract RutEmisor from the XML for the upload call."""
    from lxml import etree

    tree = etree.parse(xml_path)
    root = tree.getroot()

    # Try with namespace
    ns = {"sii": "http://www.sii.cl/SiiDte"}
    rut_el = root.find(".//sii:RUTEmisor", ns) or root.find(".//RUTEmisor")
    if rut_el is None:
        rut_el = root.find(".//sii:RutEmisor", ns) or root.find(".//RutEmisor")

    if rut_el is None:
        raise RuntimeError("No se encontró RUTEmisor en el XML")

    rut_full = rut_el.text.strip().replace(".", "")
    parts = rut_full.split("-")
    return parts[0], parts[1] if len(parts) > 1 else "0"


def upload_dte(xml_path: str, rut_num: str, rut_dv: str, token: str, wsdls: dict) -> str:
    """Step 4: Upload the signed EnvioDTE XML to SII."""
    import zeep
    from lxml import etree

    xml_bytes = Path(xml_path).read_bytes()
    xml_b64 = base64.b64encode(xml_bytes).decode()

    client = zeep.Client(wsdls["upload"])

    logger.info(f"Enviando XML ({len(xml_bytes)} bytes) al SII...")
    logger.info(f"  RUT Empresa: {rut_num}-{rut_dv}")

    response = client.service.uploadDTE(
        rutSender=rut_num,
        dvSender=rut_dv,
        rutCompany=rut_num,
        dvCompany=rut_dv,
        archivo=xml_b64,
        token=token,
    )

    root = etree.fromstring(response.encode() if isinstance(response, str) else response)
    track_id_el = root.find(".//TRACKID") or root.find(".//trackid")
    estado_el = root.find(".//STATUS") or root.find(".//ESTADO")

    if track_id_el is not None and track_id_el.text:
        track_id = track_id_el.text.strip()
        logger.info(f"\n🎉 ¡ENVIADO EXITOSAMENTE!")
        logger.info(f"   Track ID: {track_id}")
        logger.info(f"\n   Usa este Track ID como 'N° Envío' en el portal del SII")
        return track_id
    else:
        estado = estado_el.text if estado_el is not None else "?"
        logger.error(f"SII no retornó Track ID. Estado: {estado}")
        logger.error(f"Respuesta completa: {response[:500]}")
        return ""


def main():
    parser = argparse.ArgumentParser(
        description="Envía un XML firmado de DTEs al SII desde tu Mac"
    )
    parser.add_argument("xml", help="Archivo XML firmado (EnvioDTE)")
    parser.add_argument("--pfx", required=True, help="Archivo PFX del certificado digital")
    parser.add_argument("--password", required=True, help="Contraseña del PFX")
    parser.add_argument(
        "--ambiente", choices=["certificacion", "produccion"],
        default="certificacion", help="Ambiente SII (default: certificacion)"
    )

    args = parser.parse_args()

    if not Path(args.xml).exists():
        logger.error(f"Archivo XML no encontrado: {args.xml}")
        sys.exit(1)
    if not Path(args.pfx).exists():
        logger.error(f"Archivo PFX no encontrado: {args.pfx}")
        sys.exit(1)

    wsdls = SII_WSDLS[args.ambiente]
    logger.info(f"🔧 Ambiente: {args.ambiente}")
    logger.info(f"📄 XML: {args.xml}")
    logger.info(f"🔑 PFX: {args.pfx}")
    print()

    # 1. Load certificate
    private_key, certificate = load_pfx(args.pfx, args.password)

    # 2. Get seed
    seed = get_seed(wsdls)

    # 3. Sign seed
    signed_seed = sign_seed(seed, private_key, certificate)

    # 4. Get token
    token = get_token(signed_seed, wsdls)

    # 5. Extract RUT from XML
    rut_num, rut_dv = extract_rut_from_xml(args.xml)

    # 6. Upload
    track_id = upload_dte(args.xml, rut_num, rut_dv, token, wsdls)

    if track_id:
        print(f"\n{'='*50}")
        print(f"  TRACK ID: {track_id}")
        print(f"{'='*50}")
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
