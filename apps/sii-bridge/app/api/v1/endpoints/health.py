"""Health + SII Connectivity Endpoint"""
from fastapi import APIRouter
from app.services.certificate import certificate_service
from app.services.sii_soap_client import sii_soap_client

router = APIRouter()

@router.get("")
async def health():
    return {"status": "ok", "service": "cuentax-sii-bridge", "version": "1.0.0"}

@router.get("/sii")
async def sii_connectivity():
    """Verifica conectividad con el SII y estado del token."""
    cert = certificate_service.get_status()
    connectivity = sii_soap_client.check_connectivity()

    token = None
    token_error = None
    try:
        token = sii_soap_client.get_token()
    except Exception as e:
        token_error = str(e)

    return {
        "conectado": connectivity.get("conectado", False) or token is not None,
        "token_vigente": token is not None,
        "token_error": token_error,
        "ambiente": sii_soap_client._ambiente,
        "proxy": sii_soap_client._proxy_url or "none",
        "connectivity": connectivity,
        "certificado": cert,
    }

@router.get("/sii/debug-seed")
async def debug_seed():
    """Debug endpoint — test raw SOAP seed retrieval."""
    import requests as req
    result = {"proxy": sii_soap_client._proxy_url}
    try:
        soap_body = '<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><getSeed/></soapenv:Body></soapenv:Envelope>'
        endpoint = "https://maullin.sii.cl/DTEWS/CrSeed.jws"
        proxies = {"http": sii_soap_client._proxy_url, "https": sii_soap_client._proxy_url} if sii_soap_client._proxy_url else None
        resp = req.post(endpoint, data=soap_body, headers={"Content-Type": "text/xml; charset=utf-8", "SOAPAction": '""'}, proxies=proxies, timeout=30)
        result["http_status"] = resp.status_code
        result["response_body"] = resp.text[:500]
        # Try to extract
        inner = sii_soap_client._extract_soap_return(resp.content, "getSeedReturn")
        result["inner_xml"] = inner[:200] if inner else None
        # Also try direct _get_seed
        seed = sii_soap_client._get_seed()
        result["seed"] = seed
    except Exception as e:
        result["error"] = str(e)
    return result

@router.get("/sii/debug-token")
async def debug_token():
    """Debug endpoint — test full token acquisition step by step."""
    from app.services.certificate import certificate_service
    import traceback
    result = {"cert_loaded": certificate_service.is_loaded}
    try:
        # Step 1: Get seed
        seed = sii_soap_client._get_seed()
        result["seed"] = seed
        if not seed:
            result["error"] = "Failed to get seed"
            return result

        # Step 2: Sign seed
        try:
            signed = sii_soap_client._sign_seed(seed)
            result["signed_length"] = len(signed) if signed else 0
            result["signed_preview"] = signed[:200] if signed else None
        except Exception as e:
            result["sign_error"] = f"{type(e).__name__}: {e}"
            result["sign_traceback"] = traceback.format_exc()[-500:]
            return result

        # Step 3: Exchange for token
        try:
            token = sii_soap_client._exchange_seed_for_token(signed)
            result["token"] = token
            if not token:
                result["error"] = "exchange returned None"
        except Exception as e:
            result["exchange_error"] = f"{type(e).__name__}: {e}"
            result["exchange_traceback"] = traceback.format_exc()[-500:]

    except Exception as e:
        result["error"] = f"{type(e).__name__}: {e}"
    return result
