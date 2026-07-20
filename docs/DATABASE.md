# Database — BusinessBox Browser

Stato: **schema locale SQLite implementato (fase 04)** in `@businessbox/database`.
Lo schema PostgreSQL remoto arriva nella fase 06.

## Due database, due ruoli

|            | SQLite locale (desktop)                  | PostgreSQL remoto (Coolify)              |
| ---------- | ---------------------------------------- | ---------------------------------------- |
| Ruolo      | Local-first: il browser funziona offline | Account, organizzazioni, sync, AI usage  |
| Driver     | `node:sqlite` (vedi sotto)               | `pg` + pgvector                          |
| Migrazioni | Versionate, applicate all'avvio dell'app | Versionate, comando idempotente con lock |
| Fase       | 04 ✅                                    | 06                                       |

## Driver: valutazione better-sqlite3 vs node:sqlite

`better-sqlite3` (indicato dal prompt 04 come opzione da valutare) richiede la
ricompilazione nativa per l'ABI di Electron a ogni upgrade (electron-rebuild,
toolchain C++, download di header). **`node:sqlite`** — integrato in Node ≥22.5 e
nell'Electron corrente — offre la stessa API sincrona, include **FTS5** e azzera
la superficie di build nativa e di supply-chain. La scelta è incapsulata
nell'interfaccia `SqlDriver` (`packages/database/src/driver.ts`):
better-sqlite3 resta un'opzione drop-in se servissero le sue performance.

## Operatività (implementata e testata)

- **Migrazioni**: `PRAGMA user_version`, lista in `migrations.ts` (v1 schema core,
  v2 indici); applicate in transazione all'apertura; testate da database vuoto,
  da versione precedente e per idempotenza. Mai modificare una migrazione
  pubblicata: aggiungerne una nuova.
- **Database corrotto**: all'apertura viene eseguito `integrity_check`; in caso
  di errore il file è messo in quarantena (`businessbox.db.corrupt-<ts>`) e il
  database viene ricreato vuoto. Nessuna perdita silenziosa: il file resta sul
  disco per un eventuale recupero manuale.
- **Backup locale**: `LocalDatabase.backupTo(path)` usa `VACUUM INTO` (copia
  consistente anche a database aperto); il ripristino è la semplice apertura del
  file di backup (testato).
- **Ricerca full-text**: tabella virtuale FTS5 `page_fts` (titolo, URL, dominio,
  contenuto estratto, summary, tag, entità, note) aggiornata a ogni snapshot;
  query utente convertite in frasi quotate con prefix-match (mai errori di
  sintassi FTS da input ostile).
- **Dedup**: `content_hash` (sha256 di titolo+testo+tabelle) evita riscritture e
  re-processing AI; `normalized_url_hash` normalizza host, fragment e parametri
  di tracking (utm_*, fbclid, gclid…).

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
