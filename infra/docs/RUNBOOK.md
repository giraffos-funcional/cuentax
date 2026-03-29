# CuentaX Production Runbook

**Ultima actualizacion**: 2026-03-29
**Servidor**: binario-prod (65.108.87.158)
**Coolify**: https://deploy.giraffos.com
**Auth**: `Authorization: Bearer $COOLIFY_API_TOKEN`

---

## 1. Mapa de Servicios

| Servicio | Container | URL / Puerto | Health Check | Coolify UUID |
|----------|-----------|--------------|--------------|--------------|
| Web (Next.js) | cuentax-web-prod | https://cuentax.giraffos.com | `GET /api/health` (3000) | `vkscocgg04scwg04wsow8wsk` |
| BFF (Fastify) | cuentax-bff-prod | https://cuentaxapi.giraffos.com | `GET /health` (4000) | `qk0wco4csksg8sso84o00s8c` |
| SII Bridge (FastAPI) | cuentax-sii-bridge-prod | interno (8000) | `GET /api/v1/health` | `isg4o4gg00wkko0888s0wgco` |
| Odoo 18 | cuentax-odoo-prod | https://cuentaxodoo.giraffos.com | `GET /web/health` (8069) | (docker service) |
| PostgreSQL 16 | cuentax-postgres-prod | interno (5432) | `pg_isready` | - |
| Redis 7 | cuentax-redis-prod | interno (6379) | `redis-cli ping` | - |
| Nginx | cuentax-nginx-prod | :80 / :443 | `GET /health` | - |

### Check rapido de todos los servicios

```bash
# Desde cualquier maquina con acceso
curl -s -o /dev/null -w "%{http_code}" https://cuentax.giraffos.com
curl -s -o /dev/null -w "%{http_code}" https://cuentaxapi.giraffos.com/health
curl -s -o /dev/null -w "%{http_code}" https://cuentaxodoo.giraffos.com/web/health

# Desde el servidor (SSH)
ssh root@65.108.87.158
docker ps --format "table {{.Names}}\t{{.Status}}" | grep cuentax
```

---

## 2. Incidentes Comunes y Recuperacion

### A. Web app caida (502/503)

**Sintomas**: Usuarios ven error 502 o pagina en blanco. `curl` retorna 502.

**Diagnostico**:
```bash
# Verificar estado
curl -s -o /dev/null -w "%{http_code}" https://cuentax.giraffos.com

# Verificar container
ssh root@65.108.87.158 "docker ps -a | grep cuentax-web"
ssh root@65.108.87.158 "docker logs --tail 50 cuentax-web-prod"
```

**Solucion**:
```bash
# Opcion 1: Restart via Coolify API
curl -X POST https://deploy.giraffos.com/api/v1/applications/vkscocgg04scwg04wsow8wsk/restart \
  -H "Authorization: Bearer $COOLIFY_API_TOKEN"

# Opcion 2: Restart directo en servidor
ssh root@65.108.87.158 "docker restart cuentax-web-prod"

# Opcion 3: Rebuild completo via Coolify
curl -X POST https://deploy.giraffos.com/api/v1/deploy \
  -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"uuid":"vkscocgg04scwg04wsow8wsk","force_rebuild":true}'
```

**Verificacion**: `curl -s https://cuentax.giraffos.com` retorna 200.

---

### B. BFF caido (API no responde)

**Sintomas**: La web carga pero no muestra datos. Errores de red en consola del browser. Login falla.

**Diagnostico**:
```bash
curl -s https://cuentaxapi.giraffos.com/health
ssh root@65.108.87.158 "docker logs --tail 100 cuentax-bff-prod"

# Revisar si es problema de dependencias (postgres/redis)
ssh root@65.108.87.158 "docker ps | grep -E 'postgres|redis'"
```

**Solucion**:
```bash
# Restart via Coolify
curl -X POST https://deploy.giraffos.com/api/v1/applications/qk0wco4csksg8sso84o00s8c/restart \
  -H "Authorization: Bearer $COOLIFY_API_TOKEN"

# Si es problema de conexion a DB, revisar postgres primero (seccion D)
```

**Verificacion**: `curl -s https://cuentaxapi.giraffos.com/health` retorna `{"status":"ok"}`.

---

### C. SII Bridge caido (emision DTE falla)

**Sintomas**: Emision de boletas/facturas retorna error. Wizard de certificacion SII falla. BFF loguea errores de conexion a sii-bridge.

**Diagnostico**:
```bash
# Desde el servidor (servicio interno, no expuesto)
ssh root@65.108.87.158 "docker exec cuentax-bff-prod curl -s http://sii-bridge:8000/api/v1/health"
ssh root@65.108.87.158 "docker logs --tail 100 cuentax-sii-bridge-prod"

# Revisar si el problema es del SII (servicio externo)
ssh root@65.108.87.158 "docker exec cuentax-sii-bridge-prod curl -s -o /dev/null -w '%{http_code}' https://maullin.sii.cl/cgi_dte/UPL/DTEUpload"
```

**Solucion**:
```bash
# Restart via Coolify
curl -X POST https://deploy.giraffos.com/api/v1/applications/isg4o4gg00wkko0888s0wgco/restart \
  -H "Authorization: Bearer $COOLIFY_API_TOKEN"

# Si el SII esta caido: no hay nada que hacer, monitorear https://www.sii.cl
# Comunicar a usuarios que es problema externo del SII
```

**Importante**: Si el ambiente es certificacion (`SII_AMBIENTE=certificacion`), el endpoint del SII es `maullin.sii.cl`. En produccion real sera `palena.sii.cl`.

---

### D. PostgreSQL caido

**Sintomas**: BFF retorna 500 en todas las requests autenticadas. Odoo muestra error de conexion. Logs del BFF muestran `ECONNREFUSED` o `connection terminated`.

**Diagnostico**:
```bash
ssh root@65.108.87.158 "docker ps -a | grep postgres"
ssh root@65.108.87.158 "docker logs --tail 50 cuentax-postgres-prod"

# Revisar espacio en disco (causa comun)
ssh root@65.108.87.158 "df -h"
ssh root@65.108.87.158 "docker exec cuentax-postgres-prod df -h /var/lib/postgresql/data"

# Verificar que postgres acepta conexiones
ssh root@65.108.87.158 "docker exec cuentax-postgres-prod pg_isready -U cuentax"
```

**Solucion**:
```bash
# Restart container
ssh root@65.108.87.158 "docker restart cuentax-postgres-prod"

# Esperar a que este healthy (10-15 seg)
ssh root@65.108.87.158 "docker inspect --format='{{.State.Health.Status}}' cuentax-postgres-prod"

# Si disco lleno: limpiar logs viejos y WAL files
ssh root@65.108.87.158 "docker exec cuentax-postgres-prod sh -c 'pg_isready -U cuentax && echo OK'"

# Despues de restaurar postgres, restart BFF y Odoo (dependen de postgres)
ssh root@65.108.87.158 "docker restart cuentax-bff-prod cuentax-odoo-prod"
```

**CRITICO**: Si postgres no arranca despues de restart, verificar que el volumen `postgres_data` no este corrupto. Revisar backups antes de tomar acciones destructivas.

---

### E. Redis caido

**Sintomas**: Usuarios pierden sesion (se desloguean solos). BFF loguea errores de conexion a Redis. Funcionalidades de cache lentas.

**Diagnostico**:
```bash
ssh root@65.108.87.158 "docker ps -a | grep redis"
ssh root@65.108.87.158 "docker logs --tail 50 cuentax-redis-prod"
ssh root@65.108.87.158 "docker exec cuentax-redis-prod redis-cli -a \$REDIS_PASSWORD ping"
```

**Solucion**:
```bash
ssh root@65.108.87.158 "docker restart cuentax-redis-prod"

# Verificar
ssh root@65.108.87.158 "docker exec cuentax-redis-prod redis-cli -a \$REDIS_PASSWORD ping"
# Debe responder PONG
```

**Nota**: Al reiniciar Redis los usuarios tendran que volver a loguearse. Redis tiene AOF habilitado (`appendonly yes`) asi que datos persistidos deberian recuperarse.

---

### F. Odoo caido

**Sintomas**: Autenticacion falla si usa Odoo como backend de auth. Features de contabilidad no disponibles. BFF loguea errores de conexion a `http://odoo:8069`.

**Diagnostico**:
```bash
curl -s -o /dev/null -w "%{http_code}" https://cuentaxodoo.giraffos.com/web/health
ssh root@65.108.87.158 "docker logs --tail 100 cuentax-odoo-prod"

# Odoo tiene start_period de 120s, puede tardar en arrancar
ssh root@65.108.87.158 "docker inspect --format='{{.State.Health.Status}}' cuentax-odoo-prod"
```

**Solucion**:
```bash
ssh root@65.108.87.158 "docker restart cuentax-odoo-prod"

# Odoo tarda ~2 minutos en arrancar completamente
# Monitorear hasta que este healthy
watch -n 5 'ssh root@65.108.87.158 "docker inspect --format={{.State.Health.Status}} cuentax-odoo-prod"'
```

**Nota**: Si Odoo no arranca, verificar que PostgreSQL este funcionando primero (Odoo depende de postgres).

---

### G. Servidor completo caido (binario-prod)

**Sintomas**: TODOS los servicios CuentaX inaccesibles. Ping al servidor falla.

**Diagnostico**:
```bash
# Verificar conectividad
ping -c 3 65.108.87.158

# Si no responde, ir a Hetzner
# Dashboard: https://console.hetzner.cloud
# Servidor: binario-prod
```

**Solucion**:
```bash
# 1. Reiniciar desde Hetzner Dashboard (Reset button)
# 2. Esperar ~2-3 minutos a que arranque
# 3. Verificar SSH
ssh root@65.108.87.158 "uptime"

# 4. Verificar que Docker arranco
ssh root@65.108.87.158 "docker ps | grep cuentax"

# 5. Si los containers no arrancaron (tienen restart: always, deberian)
ssh root@65.108.87.158 "cd /path/to/cuentax && docker compose -f docker-compose.prod.yml up -d"

# 6. Verificar Coolify
curl -s https://deploy.giraffos.com/api/v1/healthcheck
```

**Orden de arranque**: PostgreSQL -> Redis -> SII Bridge -> BFF -> Web -> Odoo -> Nginx (definido por `depends_on` en docker-compose).

---

### H. Nginx caido (SSL/proxy errors)

**Sintomas**: Todos los servicios publicos dan error, pero containers internos estan corriendo.

**Diagnostico**:
```bash
ssh root@65.108.87.158 "docker logs --tail 50 cuentax-nginx-prod"
ssh root@65.108.87.158 "docker exec cuentax-nginx-prod nginx -t"  # test config
```

**Solucion**:
```bash
ssh root@65.108.87.158 "docker restart cuentax-nginx-prod"

# Si el problema es config
ssh root@65.108.87.158 "docker exec cuentax-nginx-prod nginx -t && docker exec cuentax-nginx-prod nginx -s reload"
```

---

## 3. Coolify API Quick Reference

**Base URL**: `https://deploy.giraffos.com/api/v1`
**Auth Header**: `Authorization: Bearer $COOLIFY_API_TOKEN`

```bash
# Estado de una aplicacion
curl -s https://deploy.giraffos.com/api/v1/applications/{uuid} \
  -H "Authorization: Bearer $COOLIFY_API_TOKEN" | jq '.status'

# Restart
curl -X POST https://deploy.giraffos.com/api/v1/applications/{uuid}/restart \
  -H "Authorization: Bearer $COOLIFY_API_TOKEN"

# Deploy (rebuild)
curl -X POST https://deploy.giraffos.com/api/v1/deploy \
  -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"uuid":"{uuid}","force_rebuild":true}'
```

### UUIDs CuentaX

| Servicio | UUID |
|----------|------|
| Web | `vkscocgg04scwg04wsow8wsk` |
| BFF | `qk0wco4csksg8sso84o00s8c` |
| SII Bridge | `isg4o4gg00wkko0888s0wgco` |

---

## 4. Escalacion

### Nivel 1 — Operador on-call (0-5 min)

- Verificar health endpoints de todos los servicios
- Restart del container afectado via Coolify API o `docker restart`
- Si el restart soluciona el problema, documentar y seguir monitoreando 15 min

### Nivel 2 — Ingeniero backend (5-30 min)

- Revisar logs de los containers (`docker logs`)
- Verificar conectividad entre servicios (red Docker interna)
- Revisar espacio en disco, memoria, CPU del servidor
- Revisar si hubo un deploy reciente que pudo causar el problema
- Rollback del ultimo deploy si es necesario

### Nivel 3 — Infraestructura / servidor (30+ min)

- Problemas a nivel de servidor (disco, red, kernel)
- Contactar Hetzner support si el servidor no responde
- Restaurar backups de base de datos si hay corrupcion
- Revisar configuracion de Coolify si el problema es de networking/SSL

---

## 5. Comandos de Emergencia

```bash
# Ver todos los containers CuentaX y su estado
ssh root@65.108.87.158 "docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep cuentax"

# Restart de TODOS los servicios CuentaX (orden correcto via compose)
ssh root@65.108.87.158 "cd /path/to/cuentax && docker compose -f docker-compose.prod.yml restart"

# Ver uso de recursos por container
ssh root@65.108.87.158 "docker stats --no-stream | grep cuentax"

# Ver espacio en disco
ssh root@65.108.87.158 "df -h && docker system df"

# Limpiar imagenes Docker antiguas (si disco lleno)
ssh root@65.108.87.158 "docker image prune -a --filter 'until=168h' -f"

# Ver logs en tiempo real de un servicio
ssh root@65.108.87.158 "docker logs -f --tail 100 cuentax-bff-prod"
```

---

## 6. Checklist Post-Incidente

- [ ] Servicio verificado funcionando por al menos 15 minutos
- [ ] Causa raiz identificada (o hipotesis documentada)
- [ ] Timeline del incidente documentado en canal #incidents
- [ ] Si hubo perdida de datos: evaluar impacto y comunicar
- [ ] Action items creados con owner y fecha limite
- [ ] Runbook actualizado si se descubrio algo nuevo
