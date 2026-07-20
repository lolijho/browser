import type { SqlDriver } from "./driver.js";

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/**
 * Migrazioni versionate dello schema locale (PRAGMA user_version).
 * Regola: mai modificare una migrazione pubblicata; aggiungerne una nuova.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "schema-core",
    sql: `
      CREATE TABLE local_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE workboxes (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE page_cards (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        workbox_id TEXT REFERENCES workboxes(id) ON DELETE SET NULL,
        parent_page_id TEXT,
        url TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        domain TEXT NOT NULL DEFAULT '',
        state TEXT NOT NULL DEFAULT 'cold' CHECK (state IN ('hot','warm','cold')),
        pinned INTEGER NOT NULL DEFAULT 0,
        keep_alive INTEGER NOT NULL DEFAULT 0,
        dirty_state INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0,
        allow_screenshot INTEGER NOT NULL DEFAULT 1,
        sensitivity TEXT NOT NULL DEFAULT 'normal',
        session_partition TEXT NOT NULL,
        scroll_position REAL,
        favicon_url TEXT,
        opened_at TEXT NOT NULL,
        last_active_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE page_snapshots (
        id TEXT PRIMARY KEY,
        page_id TEXT NOT NULL UNIQUE REFERENCES page_cards(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        canonical_url TEXT,
        title TEXT NOT NULL DEFAULT '',
        domain TEXT NOT NULL DEFAULT '',
        favicon_url TEXT,
        description TEXT,
        language TEXT,
        headings_json TEXT NOT NULL DEFAULT '[]',
        text TEXT NOT NULL DEFAULT '',
        open_graph_json TEXT NOT NULL DEFAULT '{}',
        json_ld_json TEXT NOT NULL DEFAULT '[]',
        author TEXT,
        published_at TEXT,
        links_json TEXT NOT NULL DEFAULT '[]',
        tables_text TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL DEFAULT '',
        content_hash TEXT NOT NULL,
        normalized_url_hash TEXT NOT NULL,
        scroll_position REAL,
        screenshot_path TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE page_navigation_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        page_id TEXT NOT NULL REFERENCES page_cards(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        navigated_at TEXT NOT NULL
      );

      CREATE TABLE search_engines (
        id TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE workspace_search_settings (
        workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
        engine_id TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );

      CREATE TABLE page_tags (
        page_id TEXT NOT NULL REFERENCES page_cards(id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (page_id, tag_id)
      );

      CREATE TABLE entities (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (type, value)
      );

      CREATE TABLE page_entities (
        page_id TEXT NOT NULL REFERENCES page_cards(id) ON DELETE CASCADE,
        entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        confidence REAL NOT NULL DEFAULT 0,
        PRIMARY KEY (page_id, entity_id)
      );

      CREATE TABLE notes (
        id TEXT PRIMARY KEY,
        page_id TEXT REFERENCES page_cards(id) ON DELETE SET NULL,
        workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        page_id TEXT REFERENCES page_cards(id) ON DELETE SET NULL,
        workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        done INTEGER NOT NULL DEFAULT 0,
        due_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE ai_conversations (
        id TEXT PRIMARY KEY,
        workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
        page_id TEXT REFERENCES page_cards(id) ON DELETE SET NULL,
        title TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE ai_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('system','user','assistant')),
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE ai_runs (
        id TEXT PRIMARY KEY,
        conversation_id TEXT REFERENCES ai_conversations(id) ON DELETE SET NULL,
        kind TEXT NOT NULL,
        model TEXT NOT NULL DEFAULT '',
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL
      );

      CREATE TABLE classification_rules (
        id TEXT PRIMARY KEY,
        workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
        pattern TEXT NOT NULL,
        target_workbox_id TEXT REFERENCES workboxes(id) ON DELETE CASCADE,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL CHECK (operation IN ('upsert','delete')),
        payload_json TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE sync_conflicts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        local_json TEXT NOT NULL,
        remote_json TEXT NOT NULL,
        detected_at TEXT NOT NULL,
        resolved INTEGER NOT NULL DEFAULT 0
      );

      CREATE VIRTUAL TABLE page_fts USING fts5(
        page_id UNINDEXED,
        title,
        url,
        domain,
        content,
        summary,
        tags,
        entities,
        notes
      );
    `,
  },
  {
    version: 2,
    name: "indexes",
    sql: `
      CREATE INDEX idx_page_cards_workspace ON page_cards(workspace_id, archived, pinned);
      CREATE INDEX idx_page_cards_workbox ON page_cards(workbox_id);
      CREATE INDEX idx_page_cards_last_active ON page_cards(last_active_at DESC);
      CREATE INDEX idx_snapshots_content_hash ON page_snapshots(content_hash);
      CREATE INDEX idx_snapshots_norm_url ON page_snapshots(normalized_url_hash);
      CREATE INDEX idx_history_page ON page_navigation_history(page_id, navigated_at DESC);
    `,
  },
  {
    version: 3,
    name: "allow-ai",
    sql: `
      ALTER TABLE page_cards ADD COLUMN allow_ai INTEGER NOT NULL DEFAULT 1;
    `,
  },
];

export const CURRENT_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;

export function getSchemaVersion(driver: SqlDriver): number {
  const row = driver.prepare("PRAGMA user_version").get();
  return Number(row?.["user_version"] ?? 0);
}

/** Applica in transazione le migrazioni mancanti; ritorna le versioni applicate. */
export function runMigrations(driver: SqlDriver): number[] {
  const applied: number[] = [];
  const from = getSchemaVersion(driver);
  for (const migration of MIGRATIONS) {
    if (migration.version <= from) {
      continue;
    }
    driver.exec("BEGIN");
    try {
      driver.exec(migration.sql);
      driver.exec(`PRAGMA user_version = ${migration.version}`);
      driver.exec("COMMIT");
    } catch (error) {
      driver.exec("ROLLBACK");
      throw new Error(`Migrazione ${migration.version} (${migration.name}) fallita`, {
        cause: error,
      });
    }
    applied.push(migration.version);
  }
  return applied;
}
