# Prompt 08 — Docker e deploy su Coolify

## Obiettivo

Preparare un deploy riproducibile su Coolify per API, worker, dashboard, PostgreSQL e Redis. L'app Electron non deve essere eseguita su Coolify.

## Compose

Crea:

- `docker-compose.yml`
- `docker-compose.dev.yml`
- `docker-compose.coolify.yml`

Servizi:

- api
- worker
- admin
- postgres con pgvector
- redis
- minio opzionale, attivabile tramite profilo o compose separato

## Regole Coolify

- Il Compose è la fonte di verità.
- Nessun `container_name` fisso.
- Healthcheck reali.
- Volumi persistenti.
- Reti private.
- Non esporre PostgreSQL e Redis.
- Pubblicare soltanto API e admin tramite domini Coolify.
- Log su stdout/stderr.
- Graceful shutdown.
- Migrazioni controllate.
- Secret solo in Coolify.
- Variabili required con `${VARIABLE:?message}` dove appropriato.

## Variabili

Documenta almeno:

```env
NODE_ENV=production
DATABASE_URL=
REDIS_URL=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
ENCRYPTION_KEY=
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=z-ai/glm-5.2
OPENROUTER_HTTP_REFERER=
OPENROUTER_APP_TITLE=BusinessBox Browser
OPENROUTER_REASONING_EFFORT=high
OPENROUTER_PROVIDER_SORT=price
OPENROUTER_ALLOW_FALLBACKS=true
OPENROUTER_REQUIRE_PARAMETERS=true
OPENROUTER_DATA_COLLECTION=deny
OPENROUTER_ZDR=true
PUBLIC_API_URL=
ADMIN_PUBLIC_URL=
CORS_ALLOWED_ORIGINS=
LOG_LEVEL=info
SENTRY_DSN=
```

## Dockerfile

Usa build multi-stage, utente non-root, immagini ridotte e lockfile frozen. Non copiare `.env` nelle immagini.

## Migrazioni

Crea un comando idempotente per migrare il database. Non eseguire migrazioni concorrenti da ogni replica senza lock.

## Backup

Documenta:

- backup PostgreSQL;
- restore verificato;
- backup storage;
- retention;
- cifratura;
- test periodico del ripristino.

## Documentazione

Crea `docs/COOLIFY_DEPLOY.md` con:

1. collegamento repository;
2. selezione Compose;
3. domini;
4. variabili e secret;
5. volumi;
6. deploy;
7. migrazioni;
8. healthcheck;
9. backup;
10. rollback;
11. update;
12. troubleshooting.

## CI

Crea workflow per:

- lint, typecheck, unit test;
- build immagini;
- test avvio Compose;
- push registry opzionale;
- webhook/deploy Coolify documentato, senza secret hardcoded.

## Criteri di accettazione

- `docker compose config` passa.
- Lo stack parte in locale.
- Healthcheck API, worker e admin funzionano.
- API comunica con PostgreSQL e Redis tramite rete privata.
- OpenRouter key è disponibile solo ai servizi necessari.
- Database e Redis non sono pubblicamente esposti.
- La procedura Coolify è riproducibile.
