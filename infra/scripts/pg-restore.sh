#!/usr/bin/env bash
# CuentaX PostgreSQL Restore Script
# Usage: ./pg-restore.sh <backup_file>
# Restores a pg_dump backup to the database

set -euo pipefail

BACKUP_FILE="${1:?Usage: $0 <backup_file.dump.gz>}"
DB_NAME="${POSTGRES_DB:-cuentax}"
CONTAINER_NAME="${PG_CONTAINER:-cuentax-postgres-prod}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "[$(date)] WARNING: This will REPLACE the '$DB_NAME' database!"
echo "Backup file: $BACKUP_FILE"
read -p "Are you sure? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

echo "[$(date)] Restoring from $BACKUP_FILE..."
gunzip -c "$BACKUP_FILE" | docker exec -i "$CONTAINER_NAME" pg_restore \
  -U "${POSTGRES_USER:-cuentax}" \
  -d "$DB_NAME" \
  --clean --if-exists

echo "[$(date)] Restore complete."
