#!/usr/bin/env bash
# CuentaX PostgreSQL Backup Script
# Usage: ./pg-backup.sh [retention_days]
# Runs pg_dump inside the PostgreSQL container, compresses output
# Default retention: 30 days

set -euo pipefail

RETENTION_DAYS="${1:-30}"
BACKUP_DIR="/backups/cuentax"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_NAME="${POSTGRES_DB:-cuentax}"
CONTAINER_NAME="${PG_CONTAINER:-cuentax-postgres-prod}"

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup of database '$DB_NAME'..."

# Run pg_dump inside the container with custom format, pipe to gzip
docker exec "$CONTAINER_NAME" pg_dump -U "${POSTGRES_USER:-cuentax}" -Fc "$DB_NAME" | \
  gzip > "$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.dump.gz"

BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.dump.gz"
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)

echo "[$(date)] Backup complete: $BACKUP_FILE ($BACKUP_SIZE)"

# Verify backup is not empty
if [ ! -s "$BACKUP_FILE" ]; then
  echo "[$(date)] ERROR: Backup file is empty, something went wrong!"
  rm -f "$BACKUP_FILE"
  exit 1
fi

# Clean old backups
DELETED=$(find "$BACKUP_DIR" -name "*.dump.gz" -mtime "+$RETENTION_DAYS" -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[$(date)] Cleaned $DELETED backups older than $RETENTION_DAYS days"
fi

echo "[$(date)] Done. Current backups:"
ls -lh "$BACKUP_DIR"/*.dump.gz 2>/dev/null || echo "  (none)"
