"""Health + SII Connectivity Endpoint"""
from fastapi import APIRouter
from app.services.certificate import certificate_service
from app.services.sii_soap_client import sii_soap_client
from app.services.caf_manager import caf_manager
from app.core.config import settings

router = APIRouter()

@router.get("")
async def health():
    """
    Rich health check with component statuses.
    Always returns HTTP 200 — the bridge is "healthy" even without a cert loaded,
    it just cannot sign DTEs until one is provided.
    """
    cert_loaded = certificate_service.is_loaded
    cafs_loaded = sum(len(v) for v in caf_manager._cafs.values())

    return {
        "status": "ok",
        "service": "cuentax-sii-bridge",
        "version": "1.1.0",
        "components": {
            "certificate_loaded": cert_loaded,
            "sii_ambiente": settings.SII_AMBIENTE,
            "cafs_loaded": cafs_loaded,
        },
    }

@router.get("/sii")
async def sii_connectivity():
    """Verifica conectividad con el SII y estado del token.

    Uses asyncio.to_thread + timeout to prevent blocking all uvicorn workers.
    SII SOAP calls can take 30-60s; without this, they block the entire bridge.
    """
    import asyncio

    cert = certificate_service.get_status()

    # Run blocking SII calls in a thread with a 8s timeout.
    # If SII is slow, return cached/unknown rather than blocking workers.
    connectivity = {}
    token = None
    token_error = None

    try:
        connectivity = await asyncio.wait_for(
            asyncio.to_thread(sii_soap_client.check_connectivity),
            timeout=8.0,
        )
    except asyncio.TimeoutError:
        connectivity = {"conectado": False, "error": "SII connectivity check timed out (8s)"}
    except Exception as e:
        connectivity = {"conectado": False, "error": str(e)}

    try:
        token = await asyncio.wait_for(
            asyncio.to_thread(sii_soap_client.get_token),
            timeout=8.0,
        )
    except asyncio.TimeoutError:
        token_error = "Token acquisition timed out (8s)"
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
            result["has_X509Certificate"] = "X509Certificate" in signed if signed else False
            result["has_KeyInfo"] = "KeyInfo" in signed if signed else False
            result["has_Signature"] = "Signature" in signed if signed else False
            result["signed_tail"] = signed[-500:] if signed else None
        except Exception as e:
            result["sign_error"] = f"{type(e).__name__}: {e}"
            result["sign_traceback"] = traceback.format_exc()[-500:]
            return result

        # Step 3: Exchange for token — inline to capture raw response
        try:
            import requests as req2
            import re
            soap_body = f"""<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <getToken>
      <pszXml><![CDATA[{signed}]]></pszXml>
    </getToken>
  </soapenv:Body>
</soapenv:Envelope>"""
            endpoint = sii_soap_client._wsdls["token"].replace("?WSDL", "")
            proxy_url = sii_soap_client._proxy_url
            proxies = {"http": proxy_url, "https": proxy_url} if proxy_url else None
            resp = req2.post(endpoint, data=soap_body.encode("utf-8"),
                           headers={"Content-Type": "text/xml; charset=utf-8", "SOAPAction": '""'},
                           proxies=proxies, timeout=30)
            result["exchange_http_status"] = resp.status_code
            result["exchange_raw"] = resp.text[:500]
            inner = sii_soap_client._extract_soap_return(resp.content, "getTokenReturn")
            result["exchange_inner_xml"] = inner[:300] if inner else None
            if inner:
                estado_m = re.search(r'<ESTADO>(\d+)</ESTADO>', inner)
                token_m = re.search(r'<TOKEN>([^<]+)</TOKEN>', inner)
                glosa_m = re.search(r'<GLOSA>(.*?)</GLOSA>', inner)
                result["estado"] = estado_m.group(1) if estado_m else None
                result["token"] = token_m.group(1).strip() if token_m else None
                result["glosa"] = glosa_m.group(1) if glosa_m else None
        except Exception as e:
            result["exchange_error"] = f"{type(e).__name__}: {e}"
            result["exchange_traceback"] = traceback.format_exc()[-500:]

    except Exception as e:
        result["error"] = f"{type(e).__name__}: {e}"
    return result
