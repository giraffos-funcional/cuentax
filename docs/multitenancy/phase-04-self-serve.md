# Fase 04 — Onboarding self-serve

## Objetivo
Que cualquier persona pueda registrarse en `cuentax.cl/registrarse`, elegir su subdominio, validar su email y entrar a su tenant productivo en menos de 3 minutos. Trial 14 días sin tarjeta; conversión a paid antes de que termine.

## Prerrequisitos
- Fase 02 (billing) terminada. Sin cobro automático no hay self-serve real.
- Captcha provider (hCaptcha o Cloudflare Turnstile) configurado.
- SMTP/SendGrid configurado en BFF para emails transaccionales.

## Archivos a crear / modificar

### Nuevos
- `apps/web/src/app/registrarse/page.tsx` — landing del signup
- `apps/web/src/app/registrarse/verificar/page.tsx` — confirmación email
- `apps/web/src/app/onboarding/page.tsx` — wizard multi-step (corre dentro del subdominio del tenant)
- `apps/web/src/app/onboarding/cert-sii/page.tsx`
- `apps/web/src/app/onboarding/primera-empresa/page.tsx`
- `apps/web/src/app/onboarding/caf/page.tsx`
- `apps/web/src/app/onboarding/listo/page.tsx`
- `apps/bff/src/routes/signup.ts`
- `apps/bff/src/services/signup.ts`
- `apps/bff/src/services/email-templates/`
  - `welcome.ts`
  - `trial-ending.ts`
  - `verify-email.ts`
- `apps/bff/src/jobs/trial-reminders.ts` (cron diario)
- `apps/bff/src/__tests__/signup-flow.test.ts`

### Modificar
- Landing existente (`apps/web/src/app/page.tsx`) — CTA "Empezar gratis".
- Middleware tenant — permitir endpoint público `/api/v1/signup` sin tenant context.
- `infra/nginx/nginx.prod.conf` — `apex` (`cuentax.cl` y `www`) sirve la landing y el signup; subdominios sirven el producto.

## Tareas

- [ ] T4.1 — Landing pública mejorada con CTA "Empezar gratis 14 días".
- [ ] T4.2 — Form de signup:
  - Email
  - Nombre del despacho / empresa
  - RUT (validado con dígito verificador)
  - Subdominio deseado (validar regex + reservados + único, autocompletar a partir del nombre)
  - Password (zxcvbn score >= 3)
  - Captcha
  - Aceptación de TyC y privacidad
- [ ] T4.3 — Endpoint `POST /api/v1/signup`:
  1. Validaciones server-side de todo lo anterior.
  2. Crea `tenant` (status=`trialing`, trial_ends_at=+14d).
  3. Crea `users` admin con password hasheado.
  4. Manda email de verificación con token (TTL 24h).
  5. Audit log.
  6. Devuelve `{ verify_url }`.
- [ ] T4.4 — Endpoint `GET /api/v1/signup/verify?token=...`:
  - Valida token.
  - Marca `users.email_verified=true`.
  - Redirige a `https://{slug}.cuentax.cl/onboarding`.
- [ ] T4.5 — Wizard de onboarding dentro del tenant (5 pasos):
  1. Bienvenida.
  2. Subir certificado SII `.pfx` (reutilizar flujo existente).
  3. Crear primera empresa (PYME cliente del contador).
  4. Cargar primer CAF (reutilizar flujo existente).
  5. ¡Listo! con CTA al dashboard.
  - Cada paso es opcional pero recomendado; el usuario puede saltar y completar después.
- [ ] T4.6 — Cron `trial-reminders.ts`:
  - Día 7: email "estás aprovechando Cuentax — agrega tu tarjeta".
  - Día 12: email + banner "trial termina en 2 días".
  - Día 13: último aviso.
  - Día 14: si no agregó tarjeta → tenant queda `trialing` pero con feature gate "modo lectura". 30 días después si no convierte → soft-delete.
- [ ] T4.7 — Customer portal con "agregar tarjeta" linkeado desde los emails y el banner.
- [ ] T4.8 — Tests:
  - Signup completo end-to-end (signup → verify → onboarding → primer DTE).
  - Slug duplicado → 409.
  - Slug reservado → 422.
  - RUT inválido → 422.
  - Captcha fallido → 401.
  - Token de verificación expirado → 410.
  - Trial reminders correctos en día 7/12/13/14.
- [ ] T4.9 — Métricas en admin:
  - Signups del día / semana / mes.
  - Funnel: signup → verify → primer DTE → tarjeta agregada → primer pago.
  - Conversión trial→paid.
- [ ] T4.10 — Documentación: `docs/multitenancy/signup-flow.md` con el funnel completo.

## Comandos

```bash
# Tests
pnpm -w test --filter @cuentax/bff
pnpm -w test --filter @cuentax/web

# E2E (Playwright)
pnpm --filter @cuentax/web exec playwright test signup.spec.ts

# Forzar trial reminders en local
pnpm --filter @cuentax/bff exec tsx scripts/run-trial-reminders.ts --date 2026-05-15

# Smoke test prod (con tenant temporal)
SLUG="qa-$(date +%s)" \
curl -X POST https://cuentax.cl/api/v1/signup \
  -H "Content-Type: application/json" \
  -d "{
    \"email\":\"qa+${SLUG}@cuentax.cl\",
    \"name\":\"QA ${SLUG}\",
    \"rut\":\"77.123.456-7\",
    \"slug\":\"${SLUG}\",
    \"password\":\"...\",
    \"captcha\":\"...\"
  }"
```

## Criterios de aceptación

1. Signup completo en menos de 3 minutos desde landing hasta dashboard del tenant.
2. Email de verificación llega en menos de 60s.
3. Slug colisionados o reservados son rechazados con mensaje claro.
4. Funnel correcto en admin con counts no-cero después de 1 día.
5. Trial reminders disparan en los días correctos.
6. Tenant que no agrega tarjeta queda gated día 14, soft-deleted día 44.
7. Tests E2E Playwright pasan.

## Riesgos

- **Abuso / signups falsos**: captcha + rate limit por IP + verificación email obligatoria + monitor de slugs sospechosos.
- **Subdomain takeover**: si un slug se libera, debe quedar quemado 90d antes de poder reasignarse.
- **DNS lag**: aunque usamos wildcard, algunos resolvers pueden cachear NXDOMAIN. Probar con varios DNS.
- **Email deliverability**: SPF/DKIM/DMARC bien configurados en `cuentax.cl`. SendGrid o equivalente con dominio verificado.
- **Onboarding incompleto**: medir abandono por paso y optimizar.
