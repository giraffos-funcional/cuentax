# Plan: CuentaX Mobile App — iOS + Android (Expo React Native)

## Context

CuentaX es un SaaS contable chileno para PYMEs con web app completa (Next.js 14 + Fastify BFF + 120+ endpoints). El BFF ya soporta auth por body (no solo cookies), OCR via Claude Vision, AI Chat SSE, y todas las operaciones CRUD. Necesitamos una app nativa para iOS y Android que aproveche cámara, biometría, push notifications y offline — features que la PWA no cubre bien. Framework elegido: **Expo (React Native)** por compatibilidad con el equipo TypeScript/React y codebase sharing.

**URLs producción**: cuentax.giraffos.com (web), cuentaxapi.giraffos.com (BFF), cuentaxbridge.giraffos.com (SII)

---

## Arquitectura Target

```
cuentax/
  apps/
    web/          (Next.js — existente)
    bff/          (Fastify — existente, cambios menores)
    sii-bridge/   (FastAPI — sin cambios)
    mobile/       (NUEVO — Expo React Native)
  packages/
    types/        (NUEVO — tipos TS + Zod schemas compartidos)
    api-client/   (NUEVO — Axios wrapper platform-agnostic)
    stores/       (NUEVO — Zustand stores con persistence pluggable)
    theme/        (NUEVO — design tokens como JS objects)
```

---

## FASE 0 — Shared Packages (3-4 días)

### 0.1 `packages/types` | **Software Architect** | Complejidad: M
- Extraer tipos de `apps/web/src/hooks/index.ts` (líneas 1000-1032: Gasto, CreateGastoDTO, etc.)
- Extraer tipos de `apps/web/src/stores/auth.store.ts` (User, Company, AuthState)
- Extraer Zod schemas de `apps/bff/src/routes/gastos.ts` (líneas 23-63)
- Crear: `packages/types/src/{auth,dte,gastos,contacts,products,ocr,chat,api,reports}.ts`

### 0.2 `packages/api-client` | **Backend Architect** | Complejidad: M | Depende: 0.1
- Extraer de `apps/web/src/lib/api-client.ts` (401 interceptor, token queue)
- Hacer platform-agnostic via dependency injection: `getAccessToken()`, `setAccessToken()`, `onAuthFailure()`
- Web inyecta localStorage/window, Mobile inyecta SecureStore/navigation
- Modificar `apps/web/src/lib/api-client.ts` → re-exportar desde `@cuentax/api-client`

### 0.3 `packages/stores` | **Frontend Developer** | Complejidad: S | Depende: 0.1
- Extraer `auth.store.ts` y `chat.store.ts` con storage configurable
- Web usa localStorage, Mobile usa expo-secure-store

### 0.4 `packages/theme` | **UX Architect** | Complejidad: S | Sin dependencias
- Mapear CSS vars de `apps/web/src/app/globals.css` a objetos JS
- colors, spacing (4px grid), typography, shadows
- Exportar tanto nombres CSS (web) como valores raw (RN)

### 0.5 Monorepo config | **Software Architect** | Complejidad: S | Depende: 0.1-0.4
- Actualizar `turbo.json` con packages build tasks
- Crear `tsconfig.base.json` root si falta

**Paralelismo**: 0.1 + 0.4 en paralelo → 0.2 + 0.3 en paralelo → 0.5

---

## FASE 1 — Scaffold + Auth + Dashboard (5-7 días)

### 1.1 Expo Project Scaffold | **Frontend Developer** | Complejidad: L
Crear `apps/mobile/` con:
- Expo Router (file-based routing)
- Metro config para monorepo (watchFolders packages/*)
- `eas.json` con perfiles development/preview/production
- Estructura de carpetas: `src/app/`, `src/hooks/`, `src/components/`, `src/lib/`

**Navegación (Tab Bar + Stacks):**
```
Root → (auth)/login, biometric-unlock
     → (tabs)/index(Dashboard), scan(OCR), documents(DTEs), more(Settings)
     → (stacks)/dte/[id], gasto/new, gasto/[id], emitir/, contacts/, chat, settings
```
Tab bar: Dashboard | **Scan** (center, raised FAB violeta) | Documentos | Más

**Dependencias clave**: expo ~52, expo-router ~4, expo-camera, expo-image-picker, expo-local-authentication, expo-secure-store, expo-notifications, @tanstack/react-query ^5, zustand, zod, @cuentax/*

### 1.2 Mobile API Client | **Backend Architect** | Complejidad: M | Depende: 0.2, 1.1
- `apps/mobile/src/lib/api-client.ts` — init `@cuentax/api-client` con SecureStore
- `apps/mobile/src/lib/secure-storage.ts` — expo-secure-store wrapper
- Refresh token en POST body (BFF ya lo soporta: `auth.ts` línea 65-67)

### 1.3 Auth + Biometría | **Security Engineer** + **Frontend Developer** | Complejidad: M
- Security Engineer: `biometrics.ts` (Face ID/fingerprint via expo-local-authentication)
- Frontend: login.tsx (email+password), biometric-unlock.tsx, use-auth.ts hook
- AppState listener para biometric re-auth al volver del background

### 1.4 Dashboard | **Frontend Developer** | Complejidad: M | Depende: 1.2
- KPIs horizontales (ventas, compras, IVA neto)
- Quick Actions (Escanear, Emitir, Gasto)
- Documentos recientes (últimos 5)
- Resumen gastos mensual
- Pull-to-refresh

**Paralelismo**: 1.1 → (1.2 + 1.3-security en paralelo) → (1.3-frontend + 1.4 en paralelo)

---

## FASE 2 — Camera OCR + Gastos (KILLER FEATURE) (5-6 días)

### 2.1 Camera OCR Scanner | **Frontend Developer** | Complejidad: L
- `scan.tsx` — expo-camera con preview, shutter, flash toggle, gallery picker
- `CameraView.tsx` — guía de encuadre para documentos
- `ReviewImage.tsx` — preview con retake/procesar
- `OCRResults.tsx` — datos extraídos editables con indicadores de confianza
- Comprimir imagen a <1MB antes de upload (expo-image-manipulator)
- POST multipart a `/api/v1/ocr/process` (max 5MB, JPEG/PNG/WebP)

### 2.2 Expense CRUD | **Frontend Developer** | Complejidad: M
- `gasto/new.tsx` — formulario pre-llenado desde OCR o manual
- `gasto/[id].tsx` — detalle/edición
- `GastoForm.tsx` — selector categoría (16 categorías), montos auto-calculados, foto
- `use-gastos.ts` — TanStack Query hooks para CRUD + stats
- Validación Zod desde `@cuentax/types`

### 2.3 Image Utils | **Frontend Developer** | Complejidad: S | Paralelo con 2.1
- `image-utils.ts` — compressImage(), createFormData(), getImageSize()

---

## FASE 3 — Emisión DTE + Documentos (5-6 días)

### 3.1 DTE List/Detail | **Frontend Developer** | Complejidad: M
- `documents.tsx` — FlatList filtrable (estado, tipo, fecha), pull-to-refresh
- `dte/[id].tsx` — detalle, badge SII status, download PDF, anular
- `use-dte.ts` — hooks con auto-poll status (15s interval)

### 3.2 Quick DTE Emission | **Frontend Developer** + **UX Architect** | Complejidad: L
- Wizard mobile 5 pasos: Tipo → Receptor → Items → Totales → Confirmar
- ContactSelector con autocomplete, LineItemEditor, TotalsCard
- `use-contacts.ts`, `use-products.ts` hooks

### 3.3 PDF Share | **Frontend Developer** | Complejidad: S | Paralelo con 3.1
- `file-utils.ts` — download PDF (expo-file-system), share (expo-sharing)

---

## FASE 4 — Push Notifications + Offline (5-7 días)

### 4.1a Push BFF | **Backend Architect** | Complejidad: L | Sin dependencias mobile
Crear en BFF:
- `routes/push-tokens.ts` — POST/DELETE endpoints para Expo push tokens
- `services/push-notification.service.ts` — Expo Push API + BullMQ queue
- `db/schema/push-tokens.ts` — tabla push_tokens
- Modificar: `server.ts` (registrar ruta), `jobs/dte-status-poller.ts` (trigger push)

**Triggers**: DTE aceptado/rechazado, pago recibido, folios bajos (<10)

### 4.1b Push Mobile | **Frontend Developer** | Complejidad: M | Depende: 4.1a
- `notifications.ts` — register, handle received/response, deep links
- `use-notifications.ts` — setup en root layout

### 4.2 Offline Mode | **Frontend Developer** | Complejidad: L | Independiente de 4.1
- TanStack Query `persistQueryClient` con AsyncStorage
- Cache: últimos 50 DTEs, contactos full, productos full, stats
- `offline-queue.ts` — cola mutations offline, replay on reconnect
- `OfflineBanner.tsx` — banner amarillo cuando sin conexión
- `@react-native-community/netinfo` para monitoreo

---

## FASE 5 — AI Chat + Features Secundarias (5-6 días)

### 5.1 AI Chat | **Frontend Developer** | Complejidad: M
- `chat.tsx` — full screen, FlatList invertido, streaming text
- SSE via `react-native-sse` (polyfill para RN)
- MessageBubble, StreamingText, ToolResultCard components

### 5.2 Contactos | **Frontend Developer** | Complejidad: S
- Lista searchable + detalle/edición

### 5.3 Settings | **Frontend Developer** | Complejidad: S
- Perfil, company switcher, biometric toggle, push toggle, SII status, folios, logout

**Paralelismo**: 5.1 + 5.2 + 5.3 todas en paralelo

---

## FASE 6 — App Store / Play Store (4-5 días)

### 6.1 EAS Build + CI/CD | **giraffos-coolify-deployer** | Complejidad: M
- `eas.json` con 3 perfiles (dev/preview/production)
- `.github/workflows/mobile.yml` — typecheck en PR, EAS Build en merge, EAS Submit en tag
- OTA updates via EAS Update para cambios JS-only

### 6.2 Store Assets | **UX Architect** | Complejidad: M
- App icon 1024x1024, splash screen, adaptive icon Android
- Screenshots: iPhone 6.7", iPhone 5.5", iPad, Pixel 7
- Descripción en español, keywords SII/contabilidad/PYME
- Privacy policy URL

### 6.3 Security Review | **Security Engineer** | Complejidad: M
- Verificar: SecureStore para tokens, no datos sensibles en AsyncStorage
- Certificate pinning, deep link validation, ProGuard Android
- Biometric flow sin bypass

---

## Agent Matrix

| Fase | Tarea | Agente | Paralelo? |
|------|-------|--------|-----------|
| 0.1 | types | Software Architect | ✅ con 0.4 |
| 0.2 | api-client | Backend Architect | Después de 0.1 |
| 0.3 | stores | Frontend Developer | Después de 0.1 |
| 0.4 | theme | UX Architect | ✅ con 0.1 |
| 0.5 | monorepo | Software Architect | Después de 0.1-0.4 |
| 1.1 | scaffold | Frontend Developer | Después de 0.5 |
| 1.2 | api mobile | Backend Architect | ✅ con 1.3a |
| 1.3a | biometrics | Security Engineer | ✅ con 1.2 |
| 1.3b | auth screens | Frontend Developer | Después de 1.2+1.3a |
| 1.4 | dashboard | Frontend Developer | ✅ con 1.3b |
| 2.1 | camera OCR | Frontend Developer | ✅ con 2.3 |
| 2.2 | expense CRUD | Frontend Developer | Después de 2.1 |
| 3.1 | DTE list | Frontend Developer | ✅ con 3.3 |
| 3.2 | DTE emission | Frontend + UX | Después de 3.1 |
| 4.1a | push BFF | Backend Architect | ✅ independiente |
| 4.1b | push mobile | Frontend Developer | Después de 4.1a |
| 4.2 | offline | Frontend Developer | ✅ con 4.1 |
| 5.1-5.3 | chat+contacts+settings | Frontend Developer | Todas en paralelo |
| 6.1 | CI/CD | giraffos-coolify-deployer | — |
| 6.2 | assets | UX Architect | — |
| 6.3 | security | Security Engineer | — |
| Todos | PR reviews | Code Reviewer | Per-PR |

---

## Verificación

1. **Fase 0**: `pnpm build` desde root — packages compilan, web sigue funcionando con imports desde `@cuentax/*`
2. **Fase 1**: `expo start --dev-client` — app bootea, login funciona contra BFF staging, biometric prompt aparece
3. **Fase 2**: Escanear boleta real con cámara → OCR extrae datos → gasto creado en DB (verificar en web)
4. **Fase 3**: Emitir factura desde mobile → verificar en SII maullin que llega
5. **Fase 4**: Cambiar estado DTE en BFF → push notification llega al device. Modo avión → ver datos cached → reconectar → queue se procesa
6. **Fase 5**: Chat responde con datos reales de la empresa, contactos CRUD funcional
7. **Fase 6**: `eas build --platform all --profile preview` genera APK/IPA instalables

## Timeline Estimado

| Fase | Duración | Acumulado |
|------|----------|-----------|
| 0 | 3-4 días | Semana 1 |
| 1 | 5-7 días | Semana 2 |
| 2 | 5-6 días | Semana 3 |
| 3 | 5-6 días | Semana 4 |
| 4 | 5-7 días | Semana 5 |
| 5 | 5-6 días | Semana 6 |
| 6 | 4-5 días | Semana 7 |
| **Total** | **~7 semanas** | — |
