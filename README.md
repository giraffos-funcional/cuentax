# Giraffos SII 🇨🇱

> **Plataforma de Facturación Electrónica con conexión directa al SII Chile**  
> Stack: Next.js 14 + Fastify BFF + Odoo 18 + Python FastAPI (SII Bridge)

[![CI Status](https://github.com/giraffos-funcional/giraffos-sii/actions/workflows/ci.yml/badge.svg)](https://github.com/giraffos-funcional/giraffos-sii/actions)

---

## 🏗️ Arquitectura

```
apps/
├── web/          → Frontend Next.js 14 + TypeScript + Tailwind
├── bff/          → Backend For Frontend (Fastify + TypeScript + Zod)
└── sii-bridge/   → Puente SII Chile (Python FastAPI + signxml + zeep)

infra/
└── odoo/         → Configuración Odoo 18 + módulos custom

.github/
└── workflows/    → CI/CD (lint, test, deploy Coolify)
```

## 🚀 Inicio Rápido

### Prerequisitos
- Docker + Docker Compose
- Node.js 20+ y pnpm 8+
- Python 3.11+

### Development con Docker Compose

```bash
# 1. Clonar e instalar dependencias Node.js
git clone https://github.com/giraffos-funcional/giraffos-sii
cd giraffos-sii
pnpm install

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores

# 3. Levantar todos los servicios
docker-compose -f docker-compose.dev.yml up --build

# Servicios disponibles:
# → http://localhost:3000   Frontend (Next.js)
# → http://localhost:4000   BFF (Fastify)
# → http://localhost:8001   SII Bridge (FastAPI)
# → http://localhost:8069   Odoo 18
# → http://localhost:8001/docs  API docs SII Bridge
```

### Solo SII Bridge (Python local)

```bash
cd apps/sii-bridge
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Copiar .env
cp ../../.env.example .env

uvicorn app.main:app --reload --port 8001
# → http://localhost:8001/docs
```

## 📦 Módulos Funcionales

| # | Módulo | Sprint |
|---|--------|--------|
| 1 | Configuración y Certificación SII | Sprint 1 |
| 2 | Validación y Cumplimiento Normativo | Sprint 1 |
| 3 | Emisión de DTEs (Factura, Boleta, NC, ND) | Sprint 2 |
| 4 | Gestión del Ciclo de Vida de Documentos | Sprint 3 |
| 5 | Gestión de Cotizaciones | Sprint 3 |
| 6 | Administración de Folios (CAF) | Sprint 2 |
| 7 | Consulta y Reportería (LCV, F29) | Sprint 4 |
| 8 | Anulaciones y Documentos de Ajuste | Sprint 4 |
| 9 | APIs Públicas y Webhooks | Sprint 5 |
| 10 | Maestro de Datos (Clientes, Productos) | Sprint 3 |
| 11 | Documentos de Exportación (tipos 110-113) | Sprint 5 |

## 🔑 Certificado Digital SII

Para firmar DTEs necesitas un certificado digital PFX/P12 emitido para el ambiente de certificación del SII.

```bash
# Una vez que tienes el certificado:
mkdir -p secrets/
cp /path/to/tu-certificado.pfx secrets/certificado.pfx

# Actualizar en .env:
SII_CERT_PATH=/secrets/certificado.pfx
SII_CERT_PASSWORD=tu_contraseña
SII_RUT_EMPRESA=12345678-9
```

## 👥 Equipo

Proyecto desarrollado por el equipo **Giraffos** siguiendo metodología Kanban + OKRs.

| Rol | Responsable |
|-----|-------------|
| Tech Lead & Arquitecto | Marcus |
| Security Lead | Victor |
| DevOps & Infra | Alex |
| Backend Engineer | David |
| UX/UI & Frontend | Mia & Lucas |
| QA Engineer | Sofia |
| Product Manager | Elena |

## 📋 Roadmap

Ver [`implementation_plan.md`](../../.gemini/antigravity/brain/*/implementation_plan.md) para el plan completo de 6 sprints.

---

> **Ambientes SII:** Certificación → `maullin.sii.cl` | Producción → `palena.sii.cl`
