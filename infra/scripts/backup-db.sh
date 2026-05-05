#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# CUENTAX — Postgres backup script
# ─────────────────────────────────────────────────────────────────────
#
# Designed to run from the prod server via cron OR from a CI/CD job.
# Default config is for the cuentax-postgres on Coolify.
#
# Storage strategy:
#   - Backups landed in $BACKUP_DIR with daily filename
#     (cuentax-YYYY-MM-DD.sql.gz)
#   - Local retention: keep last 14 dailies
#   - Optional offsite: when AWS_S3_BUCKET / B2_BUCKET / RCLONE_REMOTE
#     is set, sync the file there
#
# Cron suggestion (daily at 02:30 CLT):
#   30 5 * * *  /opt/cuentax/backup-db.sh >> /var/log/cuentax/backup.log 2>&1
#
# Required env (defaults shown):
#   DATABASE_URL   — full Postgres URL
#   BACKUP_DIR     — /var/backups/cuentax
#   RETENTION_DAYS — 14
#
# Optional offsite:
#   AWS_S3_BUCKET   — s3://my-bucket/cuentax/
#   AWS_PROFILE     — aws CLI profile
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

DATABASE_URL="${DATABASE_URL:-}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/cuentax}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
AWS_S3_BUCKET="${AWS_S3_BUCKET:-}"

if [[ -z "${DATABASE_URL}" ]]; then
  echo "ERROR: DATABASE_URL not set" >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"
TS=$(date +%Y-%m-%d)
FILE="${BACKUP_DIR}/cuentax-${TS}.sql.gz"

echo "[$(date -Iseconds)] Starting backup → ${FILE}"

# pg_dump: clean script, no owners, gzip on the fly.
pg_dump --clean --no-owner --no-privileges "${DATABASE_URL}" \
  | gzip -9 > "${FILE}"

SIZE=$(du -h "${FILE}" | cut -f1)
echo "[$(date -Iseconds)] Dump done: ${SIZE}"

# Retention: prune old dailies.
find "${BACKUP_DIR}" -name 'cuentax-*.sql.gz' -mtime +${RETENTION_DAYS} -print -delete

# Optional offsite copy (S3).
if [[ -n "${AWS_S3_BUCKET}" ]]; then
  if command -v aws >/dev/null 2>&1; then
    echo "[$(date -Iseconds)] Uploading to ${AWS_S3_BUCKET}"
    aws s3 cp "${FILE}" "${AWS_S3_BUCKET}/" --quiet
    echo "[$(date -Iseconds)] S3 upload OK"
  else
    echo "WARNING: aws CLI not installed; skipping offsite upload" >&2
  fi
fi

echo "[$(date -Iseconds)] Backup complete"
