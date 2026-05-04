# DNS — cuentax.cl (multi-tenant wildcard)

## Estado actual

Provider: **Cloudflare** (decisión D-DNS).

## Records requeridos

| Tipo | Nombre | Valor | Proxy | Notas |
|------|--------|-------|-------|-------|
| `A` | `cuentax.cl` | `<LB_IP>` | DNS-only | Apex |
| `A` | `www` | `<LB_IP>` | DNS-only | Vanity |
| `A` | `api` | `<LB_IP>` | DNS-only | BFF público |
| `A` | `admin` | `<LB_IP>` | DNS-only | Admin console (Fase 01) |
| `A` | `*` | `<LB_IP>` | DNS-only | **Wildcard tenant subdomains** |
| `MX` | `cuentax.cl` | provider de mail | — | |
| `TXT` | `_acme-challenge` | (manejado por certbot DNS-01) | — | No tocar manual |

`<LB_IP>` = IP del nodo Coolify que sirve nginx (ver `AGENTS.md` → Servidores Conocidos).

> El proxy de Cloudflare (CDN/orange-cloud) **no se usa** para los registros del wildcard — interfiere con el cert local (Let's Encrypt) y con websockets del BFF. Mantener todos los records en `DNS only` (gris).

## API token de Cloudflare

Necesario para que `certbot --dns-cloudflare` resuelva el DNS-01 challenge (ver `infra/scripts/issue-wildcard-cert.sh`).

Crear desde Cloudflare → My Profile → API Tokens → Create Token:

- Template: **Edit zone DNS**
- Permissions: `Zone:DNS:Edit`
- Zone Resources: `Include → Specific zone → cuentax.cl`
- Client IP filtering: opcional, recomendado restringir a IP del prod server

Guardar en `/root/.secrets/cloudflare.ini` del prod server con `chmod 600`:

```ini
dns_cloudflare_api_token = <token>
```

## Validación post-cambio

```bash
# El record wildcard debe resolver
dig +short demo.cuentax.cl
dig +short cualquiercosa.cuentax.cl

# Cert wildcard activo
echo | openssl s_client -servername demo.cuentax.cl -connect demo.cuentax.cl:443 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

Refs: `docs/multitenancy/phase-00-foundation.md` T0.11.
