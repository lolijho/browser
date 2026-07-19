# Prompt 06 — Backend, autenticazione e sincronizzazione

## Obiettivo

Implementare i servizi remoti necessari a account, organizzazioni, sincronizzazione, AI e amministrazione, mantenendo il browser pienamente utilizzabile offline.

## PostgreSQL

Schema multi-tenant minimo:

- users
- organizations
- organization_members
- devices
- refresh_tokens
- workspaces
- workspace_members
- workboxes
- page_cards
- page_snapshots
- tags
- page_tags
- entities
- page_entities
- notes
- tasks
- ai_conversations
- ai_messages
- ai_runs
- ai_usage
- sync_events
- audit_logs
- plans
- subscriptions

Ogni query tenant-aware deve verificare server-side l'appartenenza dell'utente.

## Autenticazione

Implementa:

- registrazione;
- login;
- logout;
- verifica email predisposta;
- reset password;
- access token breve;
- refresh token rotation;
- revoca dispositivo;
- rate limit;
- password hashing moderno.

Nel desktop:

- access token solo in memoria;
- refresh token protetto con `safeStorage`;
- nessun token nel localStorage;
- logout con cancellazione sicura.

## API

Versiona `/api/v1` e implementa moduli:

```text
/auth
/users
/organizations
/workspaces
/workboxes
/pages
/sync
/search
/ai
/devices
/admin
```

Genera OpenAPI.

## Sincronizzazione local-first

Usa:

- UUID generati client-side;
- mutation queue;
- idempotency key;
- `syncVersion`;
- tombstone per eliminazioni;
- retry con backoff;
- modalità offline;
- conflitti espliciti per note e spostamenti concorrenti;
- last-write-wins solo per campi semplici e documentati.

Non sincronizzare cookie, token o localStorage dei siti.

Ogni PageCard deve supportare:

- `allowSync`;
- `allowAI`;
- `allowScreenshot`;
- retention policy;
- sensitivity.

## Worker

BullMQ deve gestire:

- classificazioni differite;
- riassunti;
- embeddings;
- deduplicazione;
- cleanup;
- email transazionali;
- elaborazioni sync pesanti.

Job idempotenti e osservabili.

## Dashboard admin

Implementa pagine per:

- utenti;
- organizzazioni;
- dispositivi;
- piani;
- consumo AI;
- code worker;
- feature flags;
- versioni desktop;
- audit log;
- salute servizi.

Gli amministratori non devono vedere per default il contenuto privato delle pagine.

## Criteri di accettazione

- Registrazione e login funzionano.
- Refresh rotation e revoca dispositivo sono testati.
- Un utente non può accedere ai tenant altrui.
- Il desktop lavora offline e sincronizza al ritorno della rete.
- Retry non duplica record.
- I flag privacy impediscono sync e upload non consentiti.
- Worker e dashboard mostrano stato reale, non mock.
