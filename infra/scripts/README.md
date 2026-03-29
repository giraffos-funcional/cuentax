# CuentaX Infrastructure Scripts

## Backup

```bash
# Manual backup (default: 30 days retention)
./pg-backup.sh

# Custom retention (e.g., 7 days)
./pg-backup.sh 7

# Cron (daily at 3am)
0 3 * * * /path/to/infra/scripts/pg-backup.sh >> /var/log/cuentax-backup.log 2>&1
```

## Restore

```bash
./pg-restore.sh /backups/cuentax/cuentax_20260329_030000.dump.gz
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_DB` | `cuentax` | Database name |
| `POSTGRES_USER` | `cuentax` | Database user |
| `PG_CONTAINER` | `cuentax-postgres-prod` | Docker container name |
