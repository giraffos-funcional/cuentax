# CUENTAX — Plataforma SaaS Contable Tributaria

> Motor de facturación electrónica DTE para Chile.  
> Multi-empresa · SII compliance · Stack moderno

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)](https://typescriptlang.org)
[![Python](https://img.shields.io/badge/Python-3.12-green)](https://python.org)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org)
[![Fastify](https://img.shields.io/badge/Fastify-4.x-red)](https://fastify.io)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-teal)](https://fastapi.tiangolo.com)

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│  Web (Next.js 14)  ─────────── :3000                        │
│  SWR + Zustand + Tailwind                                    │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP (cookie auth)
┌────────────────────▼────────────────────────────────────────┐
│  BFF (Fastify + TypeScript)  ── :4000                       │
│  Auth · DTE · CAF · SII · Contacts · Products · Reports     │
│  Drizzle ORM (PostgreSQL) · Redis sessions · Status Poller  │
└────────────────────┬────────────────────────────────────────┘
        ┌────────────┴───────────┐
        │ Internal HTTP          │ JSON-RPC
┌───────▼──────┐         ┌──────▼──────────┐
│ SII Bridge   │         │ Odoo 18          │
│ FastAPI :8000│         │ ERP back-office  │
│ XML DTE      │         │ :8069            │
│ Firma RSA    │         └─────────────────┘
│ SOAP SII     │
└──────┬───────┘
       │ SOAP
┌──────▼───────────────────────────────────────┐
│  SII Chile                                   │
│  maullin.sii.cl (cert) | palena.sii.cl (prod)│
└──────────────────────────────────────────────┘
```

---

## Stack Técnico

| Capa | Tecnología | Puerto |
|------|-----------|--------|
| Frontend | Next.js 14 + Tailwind + SWR | 3000 |
| BFF | Fastify 4 + TypeScript + Drizzle | 4000 |
| SII Bridge | FastAPI + Python 3.12 + lxml | 8000 |
| Base de datos | PostgreSQL 16 | 5432 |
| Cache/Sesiones | Redis 7 | 6379 |
| ERP | Odoo 18 | 8069 |

---

## Funcionalidades

### Documentos Tributarios (DTEs)
- ✅ Tipos 33, 39, 41, 56, 61, 110, 111, 112, 113
- ✅ Generación XML según esquema SII Chile
- ✅ Firma digital XMLDSig RSA-SHA1 (certificado PFX)
- ✅ Gestión de folios (CAF) multi-empresa
- ✅ Envío SOAP a SII (certificación y producción)
- ✅ Polling automático de estado (track_id)
- ✅ Anulaciones: Notas de Crédito y Débito

### Reportes Tributarios
- ✅ Libro de Compra/Venta (LCV)
- ✅ Precálculo F29 (IVA débito + PPM)
- ✅ Estadísticas mensuales

### Gestión
- ✅ Multi-empresa (company_id en todas las entidades)
- ✅ Maestro de Contactos (clientes y proveedores)
- ✅ Catálogo de Productos/Servicios con IVA automático
- ✅ Cotizaciones con conversión a DTE
- ✅ API Pública con autenticación por API Key
- ✅ Webhooks con firma HMAC-SHA256

### Seguridad
- ✅ Auth Odoo 18 + JWT (access 15min + refresh 7d)
- ✅ Access tokens en memoria, refresh en cookies HttpOnly
- ✅ Redis blacklist de tokens inválidos
- ✅ Rate limiting por IP
- ✅ Certificado digital en memoria (nunca en disco)
- ✅ Audit log completo de operaciones

---

## Arranque Rápido

### Requisitos
- Docker + Docker Compose
- Node.js 20+
- pnpm 9+
- Python 3.12 (opcional si usas Docker para bridge)

### 1. Configurar Variables de Entorno

```bash
cp .env.example .env
# Edita .env con tus valores reales
```

### 2. Levantar Infraestructura

```bash
docker compose -f docker-compose.dev.yml up -d
# Levanta: PostgreSQL + Redis + Odoo + SII Bridge

# Con herramientas de UI:
docker compose -f docker-compose.dev.yml --profile tools up -d
# Agrega: Adminer (DB) :8080 + RedisInsight :5540
```

### 3. Aplicar Schema de Base de Datos

```bash
cd apps/bff
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

### 4. BFF (Backend For Frontend)

```bash
cd apps/bff
pnpm dev        # http://localhost:4000
pnpm test       # 28 tests unitarios
```

### 5. Frontend

```bash
cd apps/web
pnpm dev        # http://localhost:3000
```

### 6. SII Bridge (si no usas Docker)

```bash
cd apps/sii-bridge
pip install -r requirements.txt
uvicorn app.main:app --reload   # http://localhost:8000/docs
pytest tests/                   # 20 tests unitarios
```

---

## Endpoints BFF

```
# Auth
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
GET    /api/v1/auth/me

# DTE
POST   /api/v1/dte/emitir          ← Emitir DTE al SII
GET    /api/v1/dte                  ← Listar DTEs de la empresa
GET    /api/v1/dte/:trackId/status  ← Consultar estado en SII
POST   /api/v1/dte/anular           ← Anular DTE (genera NC)
GET    /api/v1/dte/:trackId/pdf     ← PDF del DTE

# CAF
POST   /api/v1/caf/load             ← Cargar CAF XML
GET    /api/v1/caf/status           ← Estado de folios

# SII
POST   /api/v1/sii/certificate/load ← Cargar certificado PFX
GET    /api/v1/sii/certificate/status
GET    /api/v1/sii/connectivity
GET    /api/v1/sii/bridge-health

# Maestros
GET/POST /api/v1/contacts
PUT/DELETE /api/v1/contacts/:id
GET/POST /api/v1/products
PUT/DELETE /api/v1/products/:id

# Reportes
GET    /api/v1/reportes/lcv?mes=3&year=2026&libro=ventas
GET    /api/v1/reportes/f29?mes=3&year=2026
GET    /api/v1/reportes/stats
```

---

## Certificado Digital SII

El sistema está preparado para recibir un certificado digital real.

1. Obtén tu certificado `.pfx` del SII o de una CA autorizada (ej. E-CERT Chile)
2. Cárgalo desde el panel: **Configuración SII → Certificado Digital**
3. El certificado se almacena **en memoria del proceso** (nunca en disco)

Para ambiente de **certificación** (`maullin.sii.cl`), el SII provee certificados de prueba en su portal [https://misiir.sii.cl](https://misiir.sii.cl).

---

## Variables de Entorno Críticas

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis URL |
| `JWT_SECRET` | Secret >= 32 chars para access tokens |
| `JWT_REFRESH_SECRET` | Secret >= 32 chars para refresh tokens |
| `INTERNAL_SECRET` | Secreto compartido BFF↔SII Bridge |
| `SII_BRIDGE_URL` | URL interna del SII Bridge |
| `ODOO_URL` | URL de Odoo 18 |

Ver `.env.example` para la lista completa.

---

## Próximos Pasos (Hoja de Ruta)

- [ ] **Generación PDF**: WeasyPrint en SII Bridge para PDF de DTEs
- [ ] **Módulo Odoo**: Custom module para sincronizar DTEs con el ERP
- [ ] **Dashboard real**: Conectar métricas del Panel a la DB
- [ ] **Plan limits**: Enforcement de límites de DTEs por plan
- [ ] **Multi-tenant isolation**: Row-Level Security en PostgreSQL
- [ ] **CI/CD**: GitHub Actions + deploy a Coolify
- [ ] **Certificación SII**: Testing completo con folios reales en maullin.sii.cl

---

## Equipo

| Rol | Responsabilidad |
|-----|----------------|
| **Arq. Técnico** | Diseño BFF + SII Bridge |
| **Mia (UX/UI)** | Design system, todos los componentes |
| **Backend** | Python SII Bridge, firma XML |
| **Francisco** | Product Owner, arquitectura |

---

> CUENTAX — Hecho en Chile 🇨🇱 · giraffos-funcional/cuentax
