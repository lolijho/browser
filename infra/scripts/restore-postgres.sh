#!/usr/bin/env bash
# BusinessBox Browser — restore PostgreSQL (fase 08).
#
# Ripristina un backup prodotto da backup-postgres.sh. Supporta file `.sql.gz`
# e `.sql.gz.age` (cifrati). Richiede conferma esplicita perché sovrascrive i
# dati esistenti.
#
# Uso:
#   ./restore-postgres.sh backups/businessbox-YYYYMMDDThhmmssZ.sql.gz
#
# Variabili:
#   COMPOSE_FILE     file compose (default: docker-compose.yml)
#   PG_SERVICE       nome servizio postgres (default: postgres)
#   POSTGRES_USER    utente db (default: businessbox)
#   POSTGRES_DB      nome db (default: businessbox)
#   AGE_IDENTITY     percorso chiave privata `age` per i backup cifrati
#   ASSUME_YES       se "true", salta la conferma interattiva
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
PG_SERVICE="${PG_SERVICE:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-businessbox}"
POSTGRES_DB="${POSTGRES_DB:-businessbox}"
AGE_IDENTITY="${AGE_IDENTITY:-}"
ASSUME_YES="${ASSUME_YES:-false}"

backup_file="${1:-}"
if [[ -z "${backup_file}" || ! -f "${backup_file}" ]]; then
  echo "Uso: $0 <file-di-backup>" >&2
  exit 1
fi

if [[ "${ASSUME_YES}" != "true" ]]; then
  read -r -p "Ripristinare '${backup_file}' su '${POSTGRES_DB}'? Sovrascrive i dati. [scrivi 'si'] " ans
  [[ "${ans}" == "si" ]] || { echo "Annullato."; exit 1; }
fi

# Sorgente decompressa/decifrata inviata a psql sullo stdin.
decode() {
  case "${backup_file}" in
    *.age)
      if [[ -z "${AGE_IDENTITY}" ]]; then
        echo "[restore] ERRORE: backup cifrato ma AGE_IDENTITY non impostata." >&2
        exit 1
      fi
      age -d -i "${AGE_IDENTITY}" "${backup_file}" | gunzip
      ;;
    *.gz) gunzip -c "${backup_file}" ;;
    *) cat "${backup_file}" ;;
  esac
}

echo "[restore] ripristino di ${backup_file} → ${POSTGRES_DB}"
decode | docker compose -f "${COMPOSE_FILE}" exec -T "${PG_SERVICE}" \
  psql --set ON_ERROR_STOP=on -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"

# Verifica minima: conta le tabelle nello schema public.
count="$(docker compose -f "${COMPOSE_FILE}" exec -T "${PG_SERVICE}" \
  psql -tA -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  -c "select count(*) from information_schema.tables where table_schema='public';")"
echo "[restore] tabelle nello schema public dopo il ripristino: ${count// /}"
echo "[restore] OK"
