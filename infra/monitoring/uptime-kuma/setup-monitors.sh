#!/usr/bin/env bash
# =============================================================================
# Uptime Kuma Monitor Setup Guide
# =============================================================================
# Uptime Kuma uses a Socket.IO API, so monitors must be configured via the web
# UI or using the uptime-kuma-api npm package. This script serves as an
# interactive checklist to walk through the manual setup.
#
# Run this after deploying Uptime Kuma and creating the admin account.
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m' # No Color
BOLD='\033[1m'

UPTIME_URL="${UPTIME_KUMA_URL:-https://uptime.giraffos.com}"

echo ""
echo -e "${BOLD}=== Uptime Kuma Monitor Setup ===${NC}"
echo -e "Target: ${CYAN}${UPTIME_URL}${NC}"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Initial access
# ---------------------------------------------------------------------------
echo -e "${BOLD}Step 1: Initial Setup${NC}"
echo -e "  1. Open ${CYAN}${UPTIME_URL}${NC}"
echo -e "  2. Create admin account on first visit"
echo -e "  3. Set language to Spanish (optional)"
echo ""

# ---------------------------------------------------------------------------
# Step 2: Critical monitors (CuentaX + Infra)
# ---------------------------------------------------------------------------
echo -e "${RED}${BOLD}Step 2: Add CRITICAL Monitors (30-60s interval)${NC}"
echo ""
echo -e "  ${YELLOW}CuentaX Stack:${NC}"
echo -e "  [HTTP(s)] CuentaX Web        -> https://cuentax.giraffos.com/api/health        (60s)"
echo -e "  [HTTP(s)] CuentaX BFF        -> https://cuentaxapi.giraffos.com/health          (30s)"
echo -e "  [HTTP(s)] CuentaX BFF Ready  -> https://cuentaxapi.giraffos.com/health/ready    (60s)"
echo -e "  [HTTP(s)] CuentaX Odoo       -> https://cuentaxodoo.giraffos.com/web/health     (60s)"
echo ""
echo -e "  ${YELLOW}Infrastructure:${NC}"
echo -e "  [HTTP(s)] Coolify            -> https://deploy.giraffos.com                      (60s)"
echo ""

# ---------------------------------------------------------------------------
# Step 3: SaaS products
# ---------------------------------------------------------------------------
echo -e "${BOLD}Step 3: Add SaaS Product Monitors (120s interval)${NC}"
echo ""
echo -e "  [HTTP(s)] CRM Doctor Web     -> https://crmdoctor.giraffos.com                  (120s)"
echo -e "  [HTTP(s)] CRM Doctor API     -> https://api.crmdoctor.giraffos.com              (120s)"
echo -e "  [HTTP(s)] Kuadra2            -> https://kuadra2.com                              (120s)"
echo -e "  [HTTP(s)] StayPro            -> https://app.staypro.cl                           (120s)"
echo -e "  [HTTP(s)] WhatsApp (Waha)    -> https://whatsapp.giraffos.com                   (120s)"
echo ""

# ---------------------------------------------------------------------------
# Step 4: Giraffos websites
# ---------------------------------------------------------------------------
echo -e "${BOLD}Step 4: Add Giraffos Website Monitors (120-300s interval)${NC}"
echo ""
echo -e "  [HTTP(s)] Giraffos Web       -> https://giraffos.com                             (120s)"
echo -e "  [HTTP(s)] Infra Dashboard    -> https://infra.giraffos.com                       (300s)"
echo -e "  [HTTP(s)] GiraShare          -> https://girashare.giraffos.com                   (300s)"
echo ""

# ---------------------------------------------------------------------------
# Step 5: Client websites
# ---------------------------------------------------------------------------
echo -e "${BOLD}Step 5: Add Client Website Monitors (300s interval)${NC}"
echo ""
echo -e "  [HTTP(s)] Dr. Rubilar        -> https://drcristobalrubilar.com                   (300s)"
echo -e "  [HTTP(s)] LatamUSA           -> https://latamusa.com                             (300s)"
echo -e "  [HTTP(s)] FranJR             -> https://franjr.com                               (300s)"
echo -e "  [HTTP(s)] Dra Nikkita        -> https://app.dranikkita.com                       (300s)"
echo ""

# ---------------------------------------------------------------------------
# Step 6: Monitor settings
# ---------------------------------------------------------------------------
echo -e "${BOLD}Step 6: Configure Monitor Defaults${NC}"
echo ""
echo -e "  For each monitor, set:"
echo -e "    - Retries:              ${GREEN}3${NC} (before marking as DOWN)"
echo -e "    - Timeout:              ${GREEN}10 seconds${NC}"
echo -e "    - Accepted status codes: ${GREEN}200-299${NC}"
echo -e "    - Certificate expiry:   ${GREEN}Alert 14 days before${NC}"
echo ""

# ---------------------------------------------------------------------------
# Step 7: Notifications
# ---------------------------------------------------------------------------
echo -e "${BOLD}Step 7: Set Up Notification Channels${NC}"
echo ""
echo -e "  ${YELLOW}Telegram (instant alerts):${NC}"
echo -e "    1. Create bot via @BotFather on Telegram"
echo -e "    2. Get the bot token"
echo -e "    3. Create a group/channel 'Giraffos Alertas'"
echo -e "    4. Add bot to the group"
echo -e "    5. Get Chat ID via @getmyid_bot"
echo -e "    6. In Uptime Kuma: Settings > Notifications > Telegram"
echo -e "    7. Enter Bot Token and Chat ID"
echo ""
echo -e "  ${YELLOW}Email (daily digest):${NC}"
echo -e "    1. In Uptime Kuma: Settings > Notifications > Email (SMTP)"
echo -e "    2. Configure SMTP server (Gmail, SendGrid, etc.)"
echo -e "    3. Set recipient: equipo@giraffos.com"
echo ""

# ---------------------------------------------------------------------------
# Step 8: Status page
# ---------------------------------------------------------------------------
echo -e "${BOLD}Step 8: Create Public Status Page (optional)${NC}"
echo ""
echo -e "  1. Settings > Status Pages > Add Status Page"
echo -e "  2. Slug: 'status'"
echo -e "  3. Add CuentaX monitors as the main group"
echo -e "  4. Add SaaS products as a second group"
echo -e "  5. URL: ${CYAN}${UPTIME_URL}/status/status${NC}"
echo ""

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
TOTAL_MONITORS=17
echo -e "${GREEN}${BOLD}=== Summary ===${NC}"
echo -e "  Total monitors to configure: ${BOLD}${TOTAL_MONITORS}${NC}"
echo -e "    - Critical (30-60s):   5  (CuentaX + Coolify)"
echo -e "    - SaaS (120s):         5  (CRM Doctor, Kuadra2, StayPro, Waha)"
echo -e "    - Giraffos sites:      3  (giraffos.com, infra, girashare)"
echo -e "    - Client sites:        4  (Dr. Rubilar, LatamUSA, FranJR, Dra Nikkita)"
echo ""
echo -e "  Notification channels:   2  (Telegram + Email)"
echo ""
echo -e "${GREEN}All monitors should show green within 5 minutes of setup.${NC}"
echo ""
