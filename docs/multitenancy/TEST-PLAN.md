# Cuentax — Plan de Test Manual

> Guía paso a paso para validar end-to-end todo lo construido. Marcá cada checkbox al pasar.
> Si algún test falla, anotá el commit/endpoint y rollback con `git revert`.

## Setup base

**Credenciales útiles (ya en prod):**
- BFF base URL: `https://cuentaxapi.giraffos.com`
- DB prod: `psql postgres://cuentax:Cx2026SecurePass@89.167.46.146:25433/cuentax`
- Super-admin: `francisco@giraffos.com` / `AArkeuec-uA11wgsB0vo_n3O`
- Tenants existentes: `app` (legacy, 9 companies, plan pro), `demo` (starter), `acme` (pro)

**Variables shell para los curls:**
```bash
export BFF=https://cuentaxapi.giraffos.com
export TOKEN=$(curl -sk -X POST $BFF/api/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"francisco@giraffos.com","password":"AArkeuec-uA11wgsB0vo_n3O"}' \
  | jq -r '.access_token')
echo "Token len: ${#TOKEN}"  # debería ser ~333
```

---

## 1. Foundation (Phase 00)

### 1.1 Health checks
```bash
curl -sk $BFF/health | jq '.status, .dependencies'
```
- [ ] `status: ok`, `redis: ok`, `postgresql: ok`

### 1.2 Tenants en DB
```sql
SELECT id, slug, status, plan_id, revenue_share_rate_contabilidad, revenue_share_rate_remuneraciones FROM tenants ORDER BY id;
```
- [ ] 3 tenants: `app` (id=1), `demo` (id=2), `acme` (id=3)
- [ ] Rates 0.2000/0.2000 default

### 1.3 Tenant resolver por header
```bash
curl -sk -H "X-Tenant-Slug: demo" $BFF/health
curl -sk -H "X-Tenant-Slug: noexiste" $BFF/api/v1/contacts -w "\nHTTP %{http_code}\n"
```
- [ ] Demo → 200 OK
- [ ] Slug inexistente sobre ruta protegida → 401 (auth-guard) o 404 (`tenant_not_found`)

### 1.4 Companies scopeadas a tenant
```sql
SELECT count(*) FROM companies WHERE tenant_id = 1;  -- debería ser 9
SELECT count(*) FROM companies WHERE tenant_id = 2;  -- 0
SELECT count(*) FROM companies WHERE tenant_id IS NULL;  -- 0
```
- [ ] 9 companies bajo `app`, 0 bajo demo/acme, 0 huérfanas

---

## 2. Admin Console (Phase 01)

### 2.1 Login admin
```bash
curl -sk -X POST $BFF/api/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"francisco@giraffos.com","password":"AArkeuec-uA11wgsB0vo_n3O"}' | jq
```
- [ ] Devuelve `access_token`, `expires_in: 3600`
- [ ] `admin: { id: 1, email, name, role: 'owner' }`

### 2.2 Login con password incorrecto
```bash
curl -sk -X POST $BFF/api/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"francisco@giraffos.com","password":"wrong"}'
```
- [ ] HTTP 401 `invalid_credentials`

### 2.3 /me y métricas
```bash
curl -sk -H "Authorization: Bearer $TOKEN" $BFF/api/admin/me
curl -sk -H "Authorization: Bearer $TOKEN" $BFF/api/admin/metrics/overview | jq
```
- [ ] `/me` devuelve owner Francisco
- [ ] Overview: tenants:{total:3, active:3}, companies:9, MRR/ARR

### 2.4 Listar tenants + filtros
```bash
curl -sk -H "Authorization: Bearer $TOKEN" "$BFF/api/admin/tenants?q=demo" | jq '.data[].slug'
curl -sk -H "Authorization: Bearer $TOKEN" "$BFF/api/admin/tenants?status=active" | jq '.total'
```
- [ ] Búsqueda por `q=demo` devuelve solo `demo`
- [ ] Filtro `status=active` devuelve los 3

### 2.5 Provisión + suspend + reactivate
```bash
curl -sk -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  $BFF/api/admin/tenants -d '{"slug":"test-prov","name":"Test Provision","plan_code":"starter","status":"trialing"}' | jq

curl -sk -X POST -H "Authorization: Bearer $TOKEN" $BFF/api/admin/tenants/test-prov/suspend | jq
curl -sk -X POST -H "Authorization: Bearer $TOKEN" $BFF/api/admin/tenants/test-prov/reactivate | jq
```
- [ ] Provisión devuelve nuevo tenant con `status: trialing`, `trial_ends_at` ~14 días
- [ ] Suspend cambia status a `suspended`
- [ ] Reactivate vuelve a `active`
- [ ] Verificar audit_log:
```sql
SELECT action, tenant_id, payload_json FROM audit_log
WHERE action LIKE 'admin.tenant.%' ORDER BY created_at DESC LIMIT 5;
```

### 2.6 Reserved slug + duplicado
```bash
curl -sk -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  $BFF/api/admin/tenants -d '{"slug":"admin","name":"X"}'
curl -sk -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  $BFF/api/admin/tenants -d '{"slug":"demo","name":"X"}'
```
- [ ] `admin` → 409 `reserved_slug`
- [ ] `demo` → 409 `slug_taken`

### 2.7 Edit revenue-share rates por tenant
```bash
curl -sk -X PATCH -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  $BFF/api/admin/tenants/demo/revenue-share -d '{"contabilidad":0.15,"remuneraciones":0.10}' | jq
```
- [ ] Rates actualizadas en DB
```sql
SELECT slug, revenue_share_rate_contabilidad, revenue_share_rate_remuneraciones FROM tenants WHERE slug = 'demo';
```

### 2.8 Impersonate
```bash
curl -sk -X POST -H "Authorization: Bearer $TOKEN" $BFF/api/admin/tenants/demo/impersonate | jq
```
- [ ] Devuelve `access_token` con scope `tenant`, `tenant.slug=demo`
- [ ] Decodificá el JWT (jwt.io) y verificá claim `impersonating_admin_id: 1`
- [ ] Audit_log tiene entry `admin.tenant.impersonate_started`

### 2.9 Bulk suspend + reactivate
```bash
curl -sk -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  $BFF/api/admin/tenants/bulk -d '{"slugs":["demo","acme"],"action":"suspend"}' | jq
curl -sk -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  $BFF/api/admin/tenants/bulk -d '{"slugs":["demo","acme"],"action":"reactivate"}' | jq
```
- [ ] Ambos resultados `ok: true`
- [ ] 4 entries en audit_log con `payload_json: {"bulk": true}`

### 2.10 Search global
```bash
curl -sk -H "Authorization: Bearer $TOKEN" "$BFF/api/admin/search?q=acme" | jq
curl -sk -H "Authorization: Bearer $TOKEN" "$BFF/api/admin/search?q=Giraffos" | jq '.companies | length'
```
- [ ] `q=acme` devuelve tenant + companies con coincidencia
- [ ] `q=Giraffos` encuentra companies (Giraffos Ltda, Giraffos US Test Inc)

### 2.11 Plans
```bash
curl -sk -H "Authorization: Bearer $TOKEN" $BFF/api/admin/plans | jq '.data[] | {code, base_price_clp}'
```
- [ ] 3 planes: starter ($19k), pro ($49k), business ($99k)

### 2.12 Audit log paginado
```bash
curl -sk -H "Authorization: Bearer $TOKEN" "$BFF/api/admin/audit?limit=5" | jq '.data[] | {action, tenant_id, created_at}'
```
- [ ] Devuelve los 5 últimos eventos cross-tenant

---

## 3. Crons Health

### 3.1 Estado de jobs
```bash
curl -sk -H "Authorization: Bearer $TOKEN" $BFF/api/admin/crons/health | jq '.data[] | {name, counts, last_completed_at, next_run_at}'
```
- [ ] Lista 10 crons (DTE, RCV, RCV-sync, mailbox, previred, close-rs, generate-invoices, charge-due, dunning, cleanup-magic-links, bank-import)
- [ ] Algunos tienen `completed > 0` (los DTE pollers son frecuentes)
- [ ] `next_run_at` poblado para los repeatables

### 3.2 Trends dashboard
```bash
curl -sk -H "Authorization: Bearer $TOKEN" $BFF/api/admin/metrics/trends | jq '.data[] | {period, tenants_created, dtes_emitted}'
curl -sk -H "Authorization: Bearer $TOKEN" $BFF/api/admin/metrics/cohorts | jq
```
- [ ] 12 buckets mensuales con periods YYYY-MM
- [ ] Cohorts agrupa tenants por mes de creación

---

## 4. Billing (Phase 02)

### 4.1 Setup-intent sin MP creds (esperado fallar limpio)
```bash
curl -sk -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'X-Tenant-Slug: demo' \
  $BFF/api/v1/billing/setup-intent -d '{"plan_code":"pro"}'
```
- [ ] HTTP 500 con mensaje sobre `MP_ACCESS_TOKEN`/`MP_WEBHOOK_SECRET` no configurados

### 4.2 Generar invoice manual (admin)
```bash
curl -sk -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  $BFF/api/admin/billing/invoices/generate -d '{"tenant_id":1,"period":"2026-04"}' | jq
```
- [ ] Devuelve `invoice_id`, `total_clp` ≥ $22.610 (subscription Pro + IVA)
- [ ] Si ya existe, `created: false`

### 4.3 Listar invoices
```bash
curl -sk -H "Authorization: Bearer $TOKEN" "$BFF/api/admin/invoices?period=2026-04" | jq '.data[] | {tenant_id, period, status, total_clp}'
```
- [ ] Al menos 1 invoice por tenant que generaste

### 4.4 PDF endpoint
```bash
# Necesita login como tenant. Por ahora con tenant header workaround:
curl -sk -H "X-Tenant-Slug: app" $BFF/api/v1/billing/invoices/2/pdf -o /tmp/inv.pdf -w "HTTP %{http_code} size=%{size_download}\n"
file /tmp/inv.pdf
open /tmp/inv.pdf  # mac
```
- [ ] HTTP 200, tamaño > 2KB
- [ ] PDF abre y muestra: header Cuentax, emisor/cliente, line items, IVA 19%, total

### 4.5 Webhook MP firmado (sin MP creds → 500)
```bash
curl -sk -X POST $BFF/api/v1/webhooks/mercadopago \
  -H 'Content-Type: application/json' \
  -H 'x-signature: ts=123,v1=fake' \
  -H 'x-request-id: r1' \
  -d '{"type":"payment","data":{"id":"123"}}'
```
- [ ] HTTP 401 `invalid_signature` (provider no configurado o firma inválida — correcto rechazar)

---

## 5. Revenue share (Phase 03)

### 5.1 Listar tenant_fees actuales
```sql
SELECT tf.tenant_id, t.slug, c.razon_social, tf.fee_type, tf.monthly_clp, tf.active
FROM tenant_fees tf
JOIN tenants t ON t.id = tf.tenant_id
JOIN companies c ON c.id = tf.company_id
ORDER BY tf.tenant_id, tf.company_id;
```
- [ ] Para tenant `app` debería haber 5 fees (3 contabilidad $80k + 2 remuneraciones $50k)

### 5.2 Cierre revenue-share
```bash
curl -sk -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  $BFF/api/admin/revenue-share/close -d '{"tenant_id":1,"period":"2026-04"}' | jq
```
- [ ] Devuelve totales: `total_share_clp: 68000`, `share_contabilidad_clp: 48000`, `share_remuneraciones_clp: 20000`
- [ ] Status `ready` o `invoiced`
- [ ] `detail` con 5 entries por PYME

### 5.3 Inyectar en invoice
```bash
# Asumiendo invoice_id = 2 generada en 4.2
curl -sk -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  $BFF/api/admin/revenue-share/runs/2/inject -d '{"invoice_id":2}' | jq
```
- [ ] `ok: true`
```sql
SELECT type, description, amount_clp FROM invoice_line_items WHERE invoice_id = 2;
```
- [ ] 3 line items: subscription Pro $49k + rev-share contabilidad $48k + rev-share remuneraciones $20k
- [ ] `invoices.subtotal_clp = 117000`, `iva_clp = 22230`, `total_clp = 139230`

### 5.4 Lock run
```bash
curl -sk -X POST -H "Authorization: Bearer $TOKEN" $BFF/api/admin/revenue-share/runs/2/lock | jq
```
- [ ] `ok: true`
- [ ] DB: `revenue_share_runs.locked_at` poblado y `status = 'locked'`
- [ ] Re-cerrar el mismo período NO debe alterarlo:
```bash
curl -sk -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  $BFF/api/admin/revenue-share/close -d '{"tenant_id":1,"period":"2026-04"}' | jq '.status'
```
- [ ] Devuelve `locked`

### 5.5 Forecast
```bash
curl -sk -H "Authorization: Bearer $TOKEN" "$BFF/api/admin/revenue-share/forecast?months=6" | jq '{monthly_share_clp, forecast_total_clp}'
```
- [ ] `monthly_share_clp >= 68000`, `forecast_total_clp = monthly × 6`

### 5.6 Tenant-fees CRUD (con tenant)
```bash
TENANT_HEADER='X-Tenant-Slug: app'
curl -sk -H "$TENANT_HEADER" $BFF/api/v1/tenant-fees | jq '.data[0]'
curl -sk "$BFF/api/v1/tenant-fees/projection?period=2026-05" -H "$TENANT_HEADER" | jq '.total_share_clp'
```
- [ ] List devuelve los 5 fees
- [ ] Projection 2026-05 devuelve $68k

---

## 6. Self-serve signup (Phase 04)

### 6.1 Slug availability
```bash
curl -sk "$BFF/api/v1/signup/slug-available?slug=test123" | jq
curl -sk "$BFF/api/v1/signup/slug-available?slug=admin" | jq
curl -sk "$BFF/api/v1/signup/slug-available?slug=demo" | jq
curl -sk "$BFF/api/v1/signup/slug-available?slug=BAD-" | jq
```
- [ ] `test123`: `available: true`
- [ ] `admin`: `available: false, reason: reserved`
- [ ] `demo`: `available: false, reason: taken`
- [ ] `BAD-`: `available: false, reason: invalid`

### 6.2 Signup full flow
```bash
curl -sk -X POST $BFF/api/v1/signup -H 'Content-Type: application/json' \
  -d '{"name":"Despacho Test","email":"test@example.cl","slug":"despacho-test-99","plan_code":"starter"}' | jq
```
- [ ] HTTP 201 con `tenant_url: https://despacho-test-99.cuentax.cl`, `next: check_email`
- [ ] DB: nuevo tenant en `trialing`
- [ ] DB: row en `magic_links` con `purpose: first_login`
- [ ] BFF logs: `[email:log] → test@example.cl: Bienvenido/a a Cuentax — Despacho Test`

### 6.3 Rate limit signup
```bash
for i in 1 2 3 4 5; do
  curl -sk -X POST $BFF/api/v1/signup -H 'Content-Type: application/json' \
    -d "{\"name\":\"x\",\"email\":\"a@a.cl\",\"slug\":\"flood-$i\"}" -w "HTTP %{http_code}\n"
done
```
- [ ] Después del 3er request, debería responder 429 `rate_limit_exceeded`

### 6.4 Magic-link consume
```bash
# Conseguir el token desde la DB:
TOKEN_HASH=$(psql ... -t -c "SELECT token_hash FROM magic_links WHERE email='test@example.cl' ORDER BY id DESC LIMIT 1")
# El raw token está en logs del BFF (cuando EMAIL_PROVIDER=log) — copiarlo del log y reemplazar abajo
RAW_TOKEN="<copiar-del-log-del-BFF>"
curl -sk -X POST $BFF/api/v1/signup/magic-link/consume \
  -H 'Content-Type: application/json' \
  -d "{\"token\":\"$RAW_TOKEN\"}" | jq
```
- [ ] Devuelve `tenant_id, email, purpose: first_login`
- [ ] Consumir 2 veces → segunda vez 401 `not_found_or_expired`

### 6.5 Cleanup
```sql
-- Si querés limpiar el tenant de prueba al final:
DELETE FROM magic_links WHERE email = 'test@example.cl';
DELETE FROM tenants WHERE slug = 'despacho-test-99';
```

---

## 7. 2FA TOTP (admin)

### 7.1 Enroll secret
```bash
curl -sk -X POST -H "Authorization: Bearer $TOKEN" $BFF/api/admin/auth/totp/enroll | jq
```
- [ ] Devuelve `secret` (32 chars base32) y `otpauth_url`
- [ ] DB: `super_admins.totp_secret_enc` no null, `totp_enabled = false`

### 7.2 Configurar app de autenticación
- [ ] Abrí Google Authenticator (o equivalente)
- [ ] Ingresá el secreto manualmente o escaneá la URL como QR
- [ ] Aparece "Cuentax: francisco@giraffos.com" generando códigos de 6 dígitos cada 30s

### 7.3 Verify y activar
```bash
# Reemplazar 123456 por el código actual de la app
curl -sk -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  $BFF/api/admin/auth/totp/verify -d '{"code":"123456"}' | jq
```
- [ ] `ok: true` con código correcto
- [ ] `invalid_code` con código incorrecto
- [ ] DB: `totp_enabled = true`

### 7.4 Login con TOTP requerido
```bash
# Login sin TOTP → debe pedirlo:
curl -sk -X POST $BFF/api/admin/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"francisco@giraffos.com","password":"AArkeuec-uA11wgsB0vo_n3O"}' | jq
```
- [ ] HTTP 401 `totp_required`
```bash
# Login con TOTP correcto:
curl -sk -X POST $BFF/api/admin/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"francisco@giraffos.com","password":"AArkeuec-uA11wgsB0vo_n3O","totp_code":"123456"}'
```
- [ ] Con código actual: 200 + access_token
- [ ] Con código viejo (>30s): 401 `invalid_totp`

### 7.5 Disable TOTP
```bash
NEW_TOKEN=$(curl -sk -X POST $BFF/api/admin/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"francisco@giraffos.com","password":"AArkeuec-uA11wgsB0vo_n3O","totp_code":"<actual>"}' | jq -r '.access_token')
curl -sk -X POST -H "Authorization: Bearer $NEW_TOKEN" -H 'Content-Type: application/json' \
  $BFF/api/admin/auth/totp/disable -d '{"password":"AArkeuec-uA11wgsB0vo_n3O"}' | jq
```
- [ ] `ok: true`
- [ ] DB: `totp_enabled=false, totp_secret_enc=null`

---

## 8. API keys + Webhooks salientes

### 8.1 Crear API key
```bash
TENANT_HEADER='X-Tenant-Slug: app'
COMPANY_ID=$(psql ... -t -c "SELECT id FROM companies WHERE tenant_id=1 LIMIT 1")
curl -sk -X POST -H "$TENANT_HEADER" -H 'Content-Type: application/json' \
  $BFF/api/v1/api-keys -d "{\"name\":\"test integration\",\"company_id\":$COMPANY_ID,\"scopes\":[\"dte:read\"]}" | jq
```
- [ ] Devuelve `raw_key` empezando con `cx_live_`, `id`, `key_prefix`
- [ ] **Anotar el raw_key — no se mostrará de nuevo**

### 8.2 Listar
```bash
curl -sk -H "$TENANT_HEADER" $BFF/api/v1/api-keys | jq '.data[] | {id, name, key_prefix, activo}'
```
- [ ] Aparece la key recién creada
- [ ] **NO** aparece el `raw_key` ni el `key_hash`

### 8.3 Rotate
```bash
KEY_ID=<id-from-step-8.1>
curl -sk -X POST -H "$TENANT_HEADER" $BFF/api/v1/api-keys/$KEY_ID/rotate | jq
```
- [ ] Devuelve nueva `raw_key` con sufijo `(rotated)` en el name
- [ ] La key anterior queda `activo: false`

### 8.4 Revoke
```bash
curl -sk -X DELETE -H "$TENANT_HEADER" $BFF/api/v1/api-keys/$KEY_ID
```
- [ ] DB: `activo = false`
- [ ] audit_log tiene `tenant.api_key_revoked`

### 8.5 Crear webhook saliente
```bash
curl -sk -X POST -H "$TENANT_HEADER" -H 'Content-Type: application/json' \
  $BFF/api/v1/webhook-endpoints \
  -d "{\"company_id\":$COMPANY_ID,\"url\":\"https://webhook.site/<UUID>\",\"events\":[\"dte.emitted\",\"invoice.paid\"]}" | jq
```
- [ ] Devuelve `endpoint` + `secret` (whsec_…)
- [ ] **Probar con webhook.site**: usar URL real de webhook.site/UUID, el dispatch va a llegar firmado

### 8.6 URL no-https rechazada
```bash
curl -sk -X POST -H "$TENANT_HEADER" -H 'Content-Type: application/json' \
  $BFF/api/v1/webhook-endpoints \
  -d "{\"company_id\":$COMPANY_ID,\"url\":\"http://insecure.example.com\",\"events\":[\"dte.emitted\"]}"
```
- [ ] HTTP 400 con mensaje sobre https

---

## 9. Notifications + Activity log

### 9.1 Crear notificación de prueba (vía SQL)
```sql
INSERT INTO notifications (tenant_id, level, title, body, href)
VALUES (1, 'info', 'Test notification', 'Esto es una prueba', '/dashboard/onboarding');
```

### 9.2 Unread count (apps/web)
```bash
curl -sk -H 'X-Tenant-Slug: app' $BFF/api/v1/notifications/unread-count | jq
```
- [ ] `count >= 1`

### 9.3 List + mark read
```bash
NOTIF_ID=<id-creado>
curl -sk -H 'X-Tenant-Slug: app' $BFF/api/v1/notifications | jq
curl -sk -X POST -H 'X-Tenant-Slug: app' $BFF/api/v1/notifications/$NOTIF_ID/read
curl -sk -H 'X-Tenant-Slug: app' $BFF/api/v1/notifications/unread-count | jq
```
- [ ] List devuelve la notif
- [ ] Después de mark-read, count baja en 1

### 9.4 Activity feed combinado
```bash
curl -sk -H 'X-Tenant-Slug: app' "$BFF/api/v1/activity?limit=20" | jq '.data | length'
```
- [ ] Devuelve mix de notificaciones + audit_log

### 9.5 Page apps/web
- [ ] Login en `cuentaxweb.giraffos.com`
- [ ] El bell muestra badge con número
- [ ] Click → dropdown con mark-read y archive
- [ ] Página `/dashboard/actividad` agrupa por fecha

---

## 10. Audit log immutability

### 10.1 INSERT permitido
```sql
INSERT INTO audit_log (tenant_id, action) VALUES (1, 'test_immutable');
```
- [ ] OK, devuelve INSERT 1

### 10.2 UPDATE bloqueado
```sql
UPDATE audit_log SET action = 'hacked' WHERE action = 'test_immutable';
```
- [ ] ERROR `audit_log is append-only`

### 10.3 DELETE bloqueado
```sql
DELETE FROM audit_log WHERE action = 'test_immutable';
```
- [ ] ERROR `audit_log is append-only`

---

## 11. UI tests manuales

### 11.1 Admin (`apps/admin` — corriendo localmente)
```bash
cd /Users/franciscoramirez/Developer/cuentax
BFF_URL=https://cuentaxapi.giraffos.com pnpm --filter @cuentax/admin dev
# abrir http://localhost:3001
```
- [ ] `/login` muestra form, login OK redirige a `/dashboard`
- [ ] Sidebar tiene 10 links (Overview, Buscar, Tenants, +Nuevo, Plans, Billing, Rev-share, Audit, Crons, Security)
- [ ] **Dark mode**: click 🌙 → fondo oscuro, persiste tras refresh
- [ ] **Lang toggle**: click 🇨🇱 ES → cambia a 🇺🇸 EN, sidebar y login en inglés
- [ ] **Mobile**: redimensionar ventana <768px → hamburguesa visible, sidebar se oculta
- [ ] Overview muestra 7 KPI cards + 4 sparklines de últimos 12 meses
- [ ] Tenants list: search funcional, click en `app` lleva al detalle
- [ ] Detalle de tenant: usage cards, edit revenue-share inline, suspend/reactivate buttons
- [ ] Plans page muestra 3 planes
- [ ] Billing page lista invoices con filtros
- [ ] Revenue share page muestra runs + bulk close
- [ ] Crons page lista 10 jobs con status
- [ ] Audit log paginado funciona

### 11.2 Web (`apps/web`)
```bash
pnpm --filter @cuentax/web dev
# abrir http://localhost:3000
```
- [ ] Login con cuenta Odoo existente
- [ ] **Bell de notificaciones**: badge con count, dropdown abre y muestra lista
- [ ] `/dashboard/onboarding`: 6 pasos checklist con progreso
- [ ] `/dashboard/honorarios`: lista de PYMEs con inputs editables, proyección actualiza al guardar
- [ ] `/dashboard/billing`: muestra suscripción + invoices + botones "Activar plan"
- [ ] `/dashboard/actividad`: feed agrupado por fecha
- [ ] `/signup` (público): form con check de slug en vivo, plan selector
- [ ] **Impersonation banner**: si usás un JWT con claim `impersonating_admin_id`, aparece banner rojo arriba

### 11.3 Error pages
- [ ] Visitar `/foo-no-existe` en admin → página 404 custom
- [ ] Forzar error en página: `throw` en server component → página `error.tsx`

---

## 12. Operational

### 12.1 Cron `cleanup-magic-links`
```sql
-- Crear un magic-link expirado >30d para validar limpieza
INSERT INTO magic_links (email, token_hash, purpose, expires_at)
VALUES ('cleanup@test.cl', 'aaa', 'first_login', now() - interval '40 days');
```
- [ ] Próximo run a las 03:00 UTC debería borrarlo
- [ ] Verificar manualmente vía endpoint admin/crons/health

### 12.2 Backup script (en prod si se configura)
```bash
DATABASE_URL=postgres://... bash infra/scripts/backup-db.sh
ls -lh /var/backups/cuentax/
```
- [ ] File `cuentax-YYYY-MM-DD.sql.gz` creado
- [ ] Restore test: `gunzip -c cuentax-...sql.gz | psql nuevo_db`

### 12.3 IP allowlist (si se configura)
```bash
# Setear ADMIN_ALLOW_IPS=200.1.2.3 en Coolify env
# Desde una IP no permitida:
curl -sk $BFF/api/admin/me -H "Authorization: Bearer $TOKEN"
```
- [ ] HTTP 403 `ip_not_allowed`

---

## 13. Tests automatizados

```bash
# Unit + integration locales
pnpm -r test
```
- [ ] `@cuentax/tenancy`: 22 tests verdes
- [ ] `@cuentax/billing`: 6 tests verdes
- [ ] `@cuentax/types`: 9 tests verdes (RUT)
- [ ] `@cuentax/bff`: 108 unit + 4 skipped (integration)

```bash
# Integration contra prod DB:
INTEGRATION_DATABASE_URL='postgres://cuentax:Cx2026SecurePass@89.167.46.146:25433/cuentax' \
  pnpm --filter @cuentax/bff test
```
- [ ] 4 integration tests verdes (cleanup correcto al final)

---

## 14. Smoke test pre-deploy

Después de cada deploy, smoke test rápido:
```bash
curl -sk $BFF/health | jq '.dependencies'
TOKEN=$(curl -sk -X POST $BFF/api/admin/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"francisco@giraffos.com","password":"AArkeuec-uA11wgsB0vo_n3O"}' | jq -r '.access_token')
curl -sk -H "Authorization: Bearer $TOKEN" $BFF/api/admin/metrics/overview | jq '.tenants.total'
curl -sk -H "Authorization: Bearer $TOKEN" $BFF/api/admin/crons/health | jq '.data | length'
```
- [ ] health 200 + redis/postgresql ok
- [ ] login 200, /metrics 200 con tenants > 0
- [ ] /crons/health devuelve >= 10 jobs

---

## Limpieza opcional

Después de testear, podés borrar datos de prueba:
```sql
-- Tenants creados durante el test
DELETE FROM tenants WHERE slug LIKE 'test-%' OR slug LIKE 'flood-%' OR slug LIKE 'despacho-test-%';

-- Notifications de prueba
DELETE FROM notifications WHERE title LIKE 'Test%';

-- API keys / webhooks de prueba
UPDATE api_keys SET activo = false WHERE name LIKE 'test%';
UPDATE webhook_endpoints SET activo = false WHERE url LIKE '%webhook.site%';

-- audit_log NO se puede borrar (immutability) — déjalo
```

---

## Si algo falla

1. **Anotá el commit + endpoint + comando exacto**
2. **Logs del BFF**:
   ```bash
   curl -s "https://deploy.giraffos.com/api/v1/applications/qk0wco4csksg8sso84o00s8c/logs?lines=100" \
     -H "Authorization: Bearer $COOLIFY_TOKEN" | jq -r '.logs'
   ```
3. **Rollback**: `git revert <commit-sha> && git push`
4. **Re-deploy**: el commit revertido auto-triggerea redeploy
