#!/usr/bin/env bash
# BusinessBox Browser — migrazione database controllata (fase 08).
#
# Esegue le migrazioni PostgreSQL come step separato e idempotente, usando
# l'advisory lock in `migrate()`: più repliche possono avviarsi senza applicare
# lo schema in parallelo. NON eseguire questo comando in automatico all'avvio di
# ogni replica; lanciarlo una volta per deploy (hook Coolify o manuale).
#
# Uso:
#   ./migrate.sh
#
# Variabili:
#   COMPOSE_FILE   file compose (default: docker-compose.yml)
#   API_SERVICE    nome servizio api (default: api)
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
API_SERVICE="${API_SERVICE:-api}"

echo "[migrate] esecuzione migrazioni via ${API_SERVICE}…"
docker compose -f "${COMPOSE_FILE}" run --rm "${API_SERVICE}" node dist/migrate.js
echo "[migrate] OK"
