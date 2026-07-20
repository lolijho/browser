# Deploy su Coolify — BusinessBox Browser

Guida riproducibile per il deploy dello stack server (API, worker, dashboard
admin, PostgreSQL con pgvector, Redis) su [Coolify](https://coolify.io).
L'app desktop Electron **non** viene eseguita su Coolify: si distribuisce come
binario (vedi `docs/DESKTOP_RELEASE.md`).

Il **Compose è la fonte di verità**. I file rilevanti:

| File                          | Uso                                                        |
| ----------------------------- | ---------------------------------------------------------- |
| `docker-compose.yml`          | base: servizi, healthcheck, reti, volumi                   |
| `docker-compose.dev.yml`      | override locale (pubblica le porte, valori di sviluppo)    |
| `docker-compose.coolify.yml`  | file da selezionare in Coolify (domini + segreti iniettati) |
| `infra/docker/Dockerfile.*`   | immagini multi-stage non-root per api/worker/admin          |
| `infra/docker/dev.env`        | variabili fittizie per lo sviluppo locale (non segreti)     |
| `infra/scripts/*.sh`          | migrazioni, backup, restore                                 |

## 1. Collegamento repository

1. In Coolify: **Projects → New → Docker Compose**.
2. Sorgente: collega questo repository Git (branch di produzione, es. `main`).
3. Concedi a Coolify l'accesso in sola lettura al repository.
4. Coolify ricostruisce le immagini dal repository a ogni deploy: non serve un
   registry esterno (opzionale, vedi §11).

## 2. Selezione Compose

- **Docker Compose Location**: `docker-compose.coolify.yml`.
- Coolify legge i servizi, le reti (`web`, `internal`) e i volumi
  (`pgdata`, `redisdata`) da quel file.
- Non impostare `container_name`: i nomi li assegna Coolify.

## 3. Domini

Coolify pubblica **solo `api` e `admin`** tramite il suo proxy. Le variabili
magiche nel Compose:

- `SERVICE_FQDN_API_3000` → dominio dell'API (porta 3000).
- `SERVICE_FQDN_ADMIN_3001` → dominio della dashboard (porta 3001).

Assegna in Coolify un dominio a ciascun servizio (es. `api.tuodominio.it` e
`admin.tuodominio.it`). Coolify gestisce automaticamente HTTPS/Let's Encrypt.

PostgreSQL e Redis **non** ricevono domini: restano sulla rete `internal`.

## 4. Variabili e secret

Imposta questi valori in Coolify come **variabili/secret** (mai nel repository).
I segreti sono marcati come tali nella UI Coolify.

```env
# Obbligatorie
NODE_ENV=production
POSTGRES_USER=businessbox
POSTGRES_PASSWORD=<segreto robusto>
POSTGRES_DB=businessbox
JWT_ACCESS_SECRET=<segreto >= 16 caratteri>
ADMIN_API_KEY=<segreto >= 16 caratteri>
PUBLIC_API_URL=https://api.tuodominio.it

# AI (solo se si abilita l'AI; disponibile solo ad api e worker)
OPENROUTER_API_KEY=<segreto>
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

# Opzionali
JWT_ACCESS_TTL_SECONDS=900
JWT_REFRESH_TTL_SECONDS=2592000
CORS_ALLOWED_ORIGINS=https://admin.tuodominio.it
ADMIN_PUBLIC_URL=https://admin.tuodominio.it
LOG_LEVEL=info
SENTRY_DSN=
```

Note:

- Le variabili richieste usano `${VAR:?messaggio}` nel Compose: il deploy
  **fallisce esplicitamente** se mancano, invece di partire con default insicuri.
- `DATABASE_URL` e `REDIS_URL` **non** si impostano a mano: il Compose le
  costruisce verso i servizi interni (`postgres:5432`, `redis:6379`).
- La chiave OpenRouter è iniettata **solo** in `api` e `worker`, mai in `admin`,
  `postgres` o `redis`.
- `JWT_REFRESH_SECRET`/`ENCRYPTION_KEY` citati nello spec **non** sono usati
  dall'API attuale (refresh token ruotati e salvati come hash lato server;
  segreti desktop cifrati con `safeStorage`). Vedi `.env.example`.

## 5. Volumi

Volumi persistenti dichiarati nel Compose (Coolify li mappa su storage durevole):

- `pgdata` → `/var/lib/postgresql/data` (dati PostgreSQL).
- `redisdata` → `/data` (AOF di Redis).
- `miniodata` → `/data` (solo con il profilo `storage`).

Non memorizzare stato applicativo nei container: solo in questi volumi o nel DB.

## 6. Deploy

1. Salva le variabili in Coolify.
2. **Deploy**. Coolify costruisce le immagini (Dockerfile multi-stage, utente
   non-root, `pnpm install --frozen-lockfile`) e avvia lo stack.
3. L'ordine è garantito dai `depends_on` con `condition: service_healthy`:
   `postgres`/`redis` sani → `api` sano → `admin`.

## 7. Migrazioni

Le migrazioni sono un **comando idempotente separato**, non eseguito all'avvio
di ogni replica. Usano un advisory lock PostgreSQL: più repliche non applicano
lo schema in parallelo.

- Manuale (o hook post-deploy Coolify):

  ```bash
  docker compose -f docker-compose.coolify.yml run --rm api node dist/migrate.js
  # oppure, in locale:
  COMPOSE_FILE=docker-compose.yml ./infra/scripts/migrate.sh
  ```

- In Coolify: aggiungi un **Post-deployment Command** sul servizio `api`:
  `node dist/migrate.js`.

Esegui la migrazione **una volta per deploy**, prima di indirizzare traffico
nuovo verso schemi modificati.

## 8. Healthcheck

Ogni servizio espone un healthcheck reale (nessun `sleep`, nessun finto `ok`):

| Servizio | Check                                             |
| -------- | ------------------------------------------------- |
| api      | `GET http://127.0.0.1:3000/health/live`           |
| worker   | `GET http://127.0.0.1:3002/health/ready` (Redis)  |
| admin    | `GET http://127.0.0.1:3001/api/health`            |
| postgres | `pg_isready -U $POSTGRES_USER -d $POSTGRES_DB`     |
| redis    | `redis-cli ping`                                  |

Coolify mostra lo stato `healthy/unhealthy` e non instrada verso container non
sani. Verifica rapida dei domini pubblici:

```bash
curl -fsS https://api.tuodominio.it/health/ready
curl -fsS https://admin.tuodominio.it/api/health
```

## 9. Backup

- **PostgreSQL** (dump logico compresso, retention, cifratura opzionale `age`):

  ```bash
  POSTGRES_USER=businessbox POSTGRES_DB=businessbox \
    COMPOSE_FILE=docker-compose.coolify.yml \
    ./infra/scripts/backup-postgres.sh
  ```

  Pianifica il backup via cron/host o **Scheduled Task** di Coolify. Imposta
  `AGE_RECIPIENT` per cifrare il dump a riposo; `RETENTION_DAYS` per la pulizia.

- **Restore verificato** (conta le tabelle dopo il ripristino):

  ```bash
  ./infra/scripts/restore-postgres.sh backups/businessbox-<timestamp>.sql.gz
  ```

- **Storage oggetti** (se usi MinIO/S3): replica il bucket con `mc mirror` o le
  policy di versioning/replica del provider.
- **Retention**: default 14 giorni sui dump locali; adegua alla tua policy.
- **Cifratura**: dump cifrati con `age` (chiave gestita fuori dal repo).
- **Test periodico**: esegui il restore su un ambiente di staging almeno una
  volta al mese e verifica il conteggio tabelle/una query applicativa.

## 10. Rollback

- **Applicazione**: in Coolify, **Deployments → Redeploy** di una versione
  precedente (Coolify conserva la history dei deploy). Coolify ricostruisce
  dall'immagine/commit precedente.
- **Schema DB**: le migrazioni sono additive quando possibile. Per rollback di
  schema, ripristina il backup PostgreSQL più recente compatibile (§9) prima di
  ripristinare la versione applicativa corrispondente.
- Effettua un backup **prima** di ogni deploy che tocca lo schema.

## 11. Update

1. Push sul branch di produzione.
2. La CI (`.github/workflows/docker-build.yml`) valida config, costruisce le
   immagini e testa l'avvio dello stack.
3. Coolify ridispiega tramite auto-deploy (webhook Git) o **Redeploy** manuale.
4. Esegui le migrazioni (§7) se lo schema è cambiato.
5. **Push su registry (opzionale)**: se configuri i secret `REGISTRY_URL`,
   `REGISTRY_USERNAME`, `REGISTRY_TOKEN`, `REGISTRY_NAMESPACE`, la CI pubblica le
   immagini; altrimenti Coolify ricostruisce dal repository.
6. **Webhook Coolify (opzionale)**: imposta i secret `COOLIFY_WEBHOOK_URL` e
   `COOLIFY_TOKEN` per far avviare il deploy dalla CI. Nessun token è scritto nel
   workflow.

## 12. Troubleshooting

| Sintomo                                   | Causa probabile / Rimedio                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| Deploy fallisce con "variable ... missing" | Manca una variabile `${VAR:?}`. Impostala nei secret Coolify (§4).             |
| `api` resta `unhealthy`                    | DB/Redis non raggiungibili o `DATABASE_URL` errata. Controlla i log di `api`.  |
| `admin` non mostra dati                    | `ADMIN_API_KEY` diversa tra `api` e `admin`, o `PUBLIC_API_URL` errata.        |
| `worker` `unhealthy`                       | `REDIS_URL` non valida o Redis non pronto. Verifica il servizio `redis`.       |
| Migrazione bloccata                        | Advisory lock trattenuto da un run precedente interrotto: riprova, è idempotente. |
| Nessun HTTPS                               | Dominio non assegnato in Coolify o DNS non propagato verso il server.          |
| Postgres non raggiungibile "da fuori"      | È voluto: è solo sulla rete `internal`. Usa lo `docker-compose.dev.yml` in locale. |
| Log assenti                                | I servizi loggano su stdout/stderr; usa i log di Coolify o `docker compose logs`. |

### Prova locale completa

```bash
docker compose --env-file infra/docker/dev.env \
  -f docker-compose.yml -f docker-compose.dev.yml up --build -d
# migrazioni
docker compose --env-file infra/docker/dev.env \
  -f docker-compose.yml -f docker-compose.dev.yml run --rm api node dist/migrate.js
# healthcheck
curl -fsS http://localhost:3000/health/ready
curl -fsS http://localhost:3001/api/health
# stop
docker compose --env-file infra/docker/dev.env \
  -f docker-compose.yml -f docker-compose.dev.yml down -v
```
