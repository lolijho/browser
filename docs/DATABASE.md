# Database — BusinessBox Browser

Stato fase 00: **nessuno schema ancora implementato**. Questo documento fissa il piano
vincolante; l'implementazione arriva nelle fasi 04 (SQLite locale) e 06 (PostgreSQL).

## Due database, due ruoli

|            | SQLite locale (desktop)                     | PostgreSQL remoto (Coolify)              |
| ---------- | ------------------------------------------- | ---------------------------------------- |
| Ruolo      | Local-first: il browser funziona offline    | Account, organizzazioni, sync, AI usage  |
| Driver     | `better-sqlite3` (ricompilato per Electron) | `pg` + pgvector                          |
| Migrazioni | Versionate, applicate all'avvio dell'app    | Versionate, comando idempotente con lock |
| Fase       | 04                                          | 06                                       |

## Tabelle SQLite locali (fase 04)

`local_settings`, `workspaces`, `workboxes`, `page_cards`, `page_snapshots`,
`page_navigation_history`, `search_engines`, `workspace_search_settings`, `tags`,
`page_tags`, `entities`, `page_entities`, `notes`, `tasks`, `ai_conversations`,
`ai_messages`, `ai_runs`, `classification_rules`, `sync_queue`, `sync_conflicts`.

## Tabelle PostgreSQL remote (fase 06)

`users`, `organizations`, `organization_members`, `devices`, `refresh_tokens`,
`workspaces`, `workspace_members`, `workboxes`, `page_cards`, `page_snapshots`, `tags`,
`page_tags`, `entities`, `page_entities`, `notes`, `tasks`, `ai_conversations`,
`ai_messages`, `ai_runs`, `ai_usage`, `sync_events`, `audit_logs`, `plans`,
`subscriptions`.

## Mappatura sync locale ⇄ remoto

- Le entità di dominio condivise (workspaces, workboxes, page_cards, page_snapshots,
  tags, entities, notes, tasks, ai_*) esistono in entrambi gli schemi; gli ID sono UUID
  generati client-side, quindi coincidono.
- Tabelle **solo locali**: `local_settings`, `search_engines`,
  `workspace_search_settings`, `page_navigation_history`, `classification_rules`,
  `sync_queue`, `sync_conflicts` (stato del client, mai sincronizzate così come sono).
- Tabelle **solo remote**: identità, billing, audit (`users`, `devices`, `plans`, …).
- Il flusso di sync usa `sync_queue` (locale) → `/api/v1/sync` → `sync_events` (remoto);
  i dettagli del protocollo (idempotency, tombstone, conflitti) sono nel prompt 06.
- I flag privacy per PageCard (`allowSync`, `allowAI`, `allowScreenshot`, retention,
  sensitivity) vengono applicati **prima** dell'accodamento: ciò che non è consentito
  non entra mai nella coda di sync.
- Mai sincronizzati: cookie, token, localStorage dei siti, screenshot senza consenso.

## Regole trasversali

- Ogni modifica di schema passa da una migrazione versionata committata.
- `content_hash` e `normalized_url_hash` deduplicano gli snapshot.
- Backup locale e gestione database corrotto: documentati e testati nella fase 04.
- Backup PostgreSQL, restore verificato e retention: fase 08.
