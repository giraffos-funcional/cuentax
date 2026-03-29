# Uptime Kuma — Monitoreo Externo de Servicios Giraffos

## Descripcion

Uptime Kuma es una herramienta de monitoreo self-hosted que verifica la disponibilidad de todos los servicios de Giraffos desde fuera de la red. Corre como un contenedor Docker gestionado por Coolify.

## Deployment a Coolify

### Opcion 1: Docker Compose (recomendado)

1. En Coolify (https://deploy.giraffos.com), ir a **Projects > Add New Resource > Docker Compose**
2. Seleccionar el servidor `binario-prod` (65.108.87.158)
3. Pegar el contenido de `docker-compose.yml` o conectar el repositorio GitHub
4. Configurar el dominio: `uptime.giraffos.com`
5. Habilitar SSL automatico (Let's Encrypt)
6. Deploy

### Opcion 2: Servicio Docker directo

1. En Coolify, ir a **Projects > Add New Resource > Docker Image**
2. Imagen: `louislam/uptime-kuma:latest`
3. Puerto: `3001`
4. Volumen persistente: `/app/data`
5. Dominio: `uptime.giraffos.com`
6. Deploy

## Setup Inicial

1. Abrir `https://uptime.giraffos.com`
2. En la primera visita, crear cuenta de administrador
3. Configurar idioma a Espanol si se prefiere
4. Agregar los monitores listados abajo
5. Configurar notificaciones (Telegram + Email)

## Monitores a Configurar

### CuentaX Stack (Critico)

Estos monitores tienen intervalos cortos porque son servicios core del negocio.

| Monitor | URL | Intervalo | Tipo | Respuesta esperada |
|---------|-----|-----------|------|--------------------|
| CuentaX Web | https://cuentax.giraffos.com/api/health | 60s | HTTP(s) | 200 OK |
| CuentaX BFF | https://cuentaxapi.giraffos.com/health | 30s | HTTP(s) | 200 OK |
| CuentaX BFF Ready | https://cuentaxapi.giraffos.com/health/ready | 60s | HTTP(s) | 200 OK |
| CuentaX Odoo | https://cuentaxodoo.giraffos.com/web/health | 60s | HTTP(s) | 200 OK |

### Infraestructura (Critico)

| Monitor | URL | Intervalo | Tipo |
|---------|-----|-----------|------|
| Coolify | https://deploy.giraffos.com | 60s | HTTP(s) |

### Productos SaaS

| Monitor | URL | Intervalo | Tipo |
|---------|-----|-----------|------|
| CRM Doctor Web | https://crmdoctor.giraffos.com | 120s | HTTP(s) |
| CRM Doctor API | https://api.crmdoctor.giraffos.com | 120s | HTTP(s) |
| Kuadra2 | https://kuadra2.com | 120s | HTTP(s) |
| StayPro | https://app.staypro.cl | 120s | HTTP(s) |
| WhatsApp (Waha) | https://whatsapp.giraffos.com | 120s | HTTP(s) |

### Sitios Web Giraffos

| Monitor | URL | Intervalo | Tipo |
|---------|-----|-----------|------|
| Giraffos Web | https://giraffos.com | 120s | HTTP(s) |
| Infra Dashboard | https://infra.giraffos.com | 300s | HTTP(s) |
| GiraShare | https://girashare.giraffos.com | 300s | HTTP(s) |

### Sitios Web de Clientes

| Monitor | URL | Intervalo | Tipo |
|---------|-----|-----------|------|
| Dr. Rubilar | https://drcristobalrubilar.com | 300s | HTTP(s) |
| LatamUSA | https://latamusa.com | 300s | HTTP(s) |
| FranJR | https://franjr.com | 300s | HTTP(s) |
| Dra Nikkita | https://app.dranikkita.com | 300s | HTTP(s) |

## Configuracion de Notificaciones

### Telegram (recomendado para alertas instantaneas)

1. Crear un bot con `@BotFather` en Telegram
2. Obtener el token del bot
3. Crear un grupo o canal para alertas (ej: "Giraffos Alertas")
4. Agregar el bot al grupo
5. Obtener el Chat ID del grupo (usar `@getmyid_bot`)
6. En Uptime Kuma: **Settings > Notifications > Add Notification > Telegram**
7. Ingresar Bot Token y Chat ID

### Email (para resumen diario)

1. En Uptime Kuma: **Settings > Notifications > Add Notification > Email (SMTP)**
2. Configurar SMTP:
   - Host: el servidor SMTP que usen (Gmail, SendGrid, etc.)
   - Puerto: 587 (TLS)
   - Usuario y password
   - Destinatario: equipo@giraffos.com (o el correo del equipo)

### Umbrales de Alerta Recomendados

| Parametro | Valor |
|-----------|-------|
| Retries antes de alerta | 3 |
| Timeout de request | 10 segundos |
| Certificado SSL expirando | Alertar 14 dias antes |
| Alerta de recuperacion | Si (notificar cuando vuelve) |

## Status Page Publica (opcional)

Uptime Kuma permite crear una pagina de estado publica:

1. **Settings > Status Pages > Add Status Page**
2. Slug: `status`
3. URL resultante: `https://uptime.giraffos.com/status/status`
4. Agregar los monitores de CuentaX como grupo principal
5. Compartir con clientes si es necesario

## Mantenimiento

- Los datos se persisten en el volumen Docker `uptime_data`
- Backups: el volumen contiene una base SQLite en `/app/data/kuma.db`
- Para backup manual: `docker cp cuentax-uptime-kuma:/app/data/kuma.db ./kuma-backup.db`
- Actualizar imagen: desde Coolify, hacer redeploy con `latest` tag
