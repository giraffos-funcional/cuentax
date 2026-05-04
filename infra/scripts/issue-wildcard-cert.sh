#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# CUENTAX — Issue wildcard SSL cert via certbot + Cloudflare DNS-01
# Phase 00, T0.10
# ─────────────────────────────────────────────────────────────────────
#
# Issues `*.cuentax.cl` (and apex) using DNS-01 challenge. Stored in
# /etc/nginx/certs/cuentax.cl-wildcard/ for the wildcard server block in
# nginx.tenants.conf.
#
# Prereqs (run on prod server, as root):
#   1. apt install certbot python3-certbot-dns-cloudflare
#   2. Create /root/.secrets/cloudflare.ini with:
#        dns_cloudflare_api_token = <SCOPED-TOKEN>
#      (Token must have Zone:DNS:Edit on cuentax.cl. Plan free OK.)
#   3. chmod 600 /root/.secrets/cloudflare.ini
#
# Usage:
#   sudo bash infra/scripts/issue-wildcard-cert.sh cuentax.cl
#
# Renewal:
#   certbot installs a systemd timer for `certbot renew --dry-run`. Add
#   a deploy hook that reloads nginx, e.g.:
#     /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
#       #!/bin/sh
#       systemctl reload nginx
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

DOMAIN="${1:-cuentax.cl}"
CF_INI="${CF_INI:-/root/.secrets/cloudflare.ini}"
CERT_DIR="/etc/nginx/certs/${DOMAIN}-wildcard"
EMAIL="${CERTBOT_EMAIL:-tech@cuentax.cl}"

if [[ ! -f "${CF_INI}" ]]; then
  echo "ERROR: cloudflare credentials file not found at ${CF_INI}" >&2
  echo "Create it with the API token (see header of this script)." >&2
  exit 1
fi

if [[ "$(stat -c %a "${CF_INI}")" != "600" ]]; then
  echo "ERROR: ${CF_INI} must be chmod 600 (token will leak otherwise)." >&2
  exit 1
fi

echo "→ Requesting wildcard cert for ${DOMAIN} and *.${DOMAIN} ..."
certbot certonly \
  --non-interactive \
  --agree-tos \
  --email "${EMAIL}" \
  --dns-cloudflare \
  --dns-cloudflare-credentials "${CF_INI}" \
  --dns-cloudflare-propagation-seconds 30 \
  -d "${DOMAIN}" \
  -d "*.${DOMAIN}"

echo "→ Linking certs into ${CERT_DIR} ..."
mkdir -p "${CERT_DIR}"
ln -sf "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" "${CERT_DIR}/fullchain.pem"
ln -sf "/etc/letsencrypt/live/${DOMAIN}/privkey.pem"   "${CERT_DIR}/privkey.pem"

echo "→ Validating nginx config ..."
nginx -t

echo "→ Reloading nginx ..."
systemctl reload nginx || nginx -s reload

echo "✅ Wildcard cert installed at ${CERT_DIR}"
echo "   Renewal handled by systemd timer (certbot.timer)."
