#!/usr/bin/env bash
# BusinessBox Browser — backup PostgreSQL (fase 08).
#
# Esegue un dump logico compresso del database, con cifratura opzionale (age)
# e retention. Pensato per essere lanciato da cron/host verso il container
# `postgres` dello stack Compose/Coolify.
#
# Uso:
#   ./backup-postgres.sh
#
# Variabili:
#   COMPOSE_FILE      file compose (default: docker-compose.yml)
#   PG_SERVICE        nome servizio postgres (default: postgres)
#   POSTGRES_USER     utente db (default: businessbox)
#   POSTGRES_DB       nome db (default: businessbox)
#   BACKUP_DIR        cartella di destinazione (default: ./backups)
#   RETENTION_DAYS    giorni di conservazione (default: 14)
#   AGE_RECIPIENT     se impostata, cifra il backup con `age` per questa chiave
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
PG_SERVICE="${PG_SERVICE:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-businessbox}"
POSTGRES_DB="${POSTGRES_DB:-businessbox}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
AGE_RECIPIENT="${AGE_RECIPIENT:-}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "${BACKUP_DIR}"
outfile="${BACKUP_DIR}/${POSTGRES_DB}-${timestamp}.sql.gz"

echo "[backup] dump di ${POSTGRES_DB} → ${outfile}"
# --clean --if-exists rende il dump ripristinabile su un db esistente.
docker compose -f "${COMPOSE_FILE}" exec -T "${PG_SERVICE}" \
  pg_dump --clean --if-exists --no-owner --no-privileges \
  -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  | gzip -9 > "${outfile}"

if [[ -n "${AGE_RECIPIENT}" ]]; then
  if ! command -v age >/dev/null 2>&1; then
    echo "[backup] ERRORE: AGE_RECIPIENT impostata ma 'age' non è installato." >&2
    exit 1
  fi
  echo "[backup] cifratura con age…"
  age -r "${AGE_RECIPIENT}" -o "${outfile}.age" "${outfile}"
  rm -f "${outfile}"
  outfile="${outfile}.age"
fi

size="$(du -h "${outfile}" | cut -f1)"
echo "[backup] completato: ${outfile} (${size})"

echo "[backup] retention: rimuovo backup più vecchi di ${RETENTION_DAYS} giorni"
find "${BACKUP_DIR}" -maxdepth 1 -type f \
  \( -name "${POSTGRES_DB}-*.sql.gz" -o -name "${POSTGRES_DB}-*.sql.gz.age" \) \
  -mtime "+${RETENTION_DAYS}" -print -delete || true

echo "[backup] OK"
