import { createHash } from "node:crypto";
import type {
  ExtractedContent,
  LocalSearchRequest,
  LocalSearchResult,
  PageCard,
  WorkBox,
  Workspace,
} from "@businessbox/contracts";
import type { LocalDatabase } from "./local-database.js";
import type { SqlValue } from "./driver.js";

/** Stato di sessione persistito (ripristino al riavvio). */
export interface SessionState {
  activeWorkspaceId: string;
  lastActiveByWorkspace: Record<string, string | null>;
}

export interface SnapshotUpsertResult {
  /** false se il contentHash è invariato: nessuna riscrittura, nessun re-processing AI. */
  changed: boolean;
  contentHash: string;
}

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** URL normalizzato per la dedup: host lowercase, niente fragment né parametri di tracking. */
export function normalizeUrlForHash(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    const TRACKING = /^(utm_|fbclid|gclid|mc_eid|ref_src)/i;
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING.test(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function bool(value: SqlValue | undefined): boolean {
  return Number(value ?? 0) === 1;
}

function str(value: SqlValue | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function strOrNull(value: SqlValue | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

/** Accesso dati tipizzato sul database locale. */
export class Repositories {
  constructor(
    private readonly db: LocalDatabase,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  // --- local_settings (chiave/valore JSON) ---

  getSetting<T>(key: string): T | null {
    const row = this.db.driver.prepare("SELECT value FROM local_settings WHERE key = ?").get(key);
    if (!row) {
      return null;
    }
    try {
      return JSON.parse(String(row["value"])) as T;
    } catch {
      return null;
    }
  }

  setSetting(key: string, value: unknown): void {
    this.db.driver
      .prepare(
        `INSERT INTO local_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, JSON.stringify(value), this.now());
  }

  // --- persistenza stato browser (workspaces, workboxes, page_cards) ---

  saveBrowserModel(workspaces: Workspace[], workBoxes: WorkBox[], cards: PageCard[]): void {
    this.db.transaction(() => {
      this.upsertAndPrune("workspaces", workspaces, (w) =>
        this.db.driver
          .prepare(
            `INSERT INTO workspaces (id, name, description, sort_order, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description,
               sort_order=excluded.sort_order, updated_at=excluded.updated_at`,
          )
          .run(w.id, w.name, w.description, w.order, w.createdAt, w.updatedAt),
      );
      this.upsertAndPrune("workboxes", workBoxes, (b) =>
        this.db.driver
          .prepare(
            `INSERT INTO workboxes (id, workspace_id, name, description, sort_order, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description,
               sort_order=excluded.sort_order, updated_at=excluded.updated_at`,
          )
          .run(b.id, b.workspaceId, b.name, b.description, b.order, b.createdAt, b.updatedAt),
      );
      this.upsertAndPrune("page_cards", cards, (c) =>
        this.db.driver
          .prepare(
            `INSERT INTO page_cards (
               id, workspace_id, workbox_id, parent_page_id, url, title, domain, state,
               pinned, keep_alive, dirty_state, archived, allow_screenshot, session_partition,
               scroll_position, favicon_url, opened_at, last_active_at, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               workspace_id=excluded.workspace_id, workbox_id=excluded.workbox_id,
               parent_page_id=excluded.parent_page_id, url=excluded.url, title=excluded.title,
               domain=excluded.domain, state=excluded.state, pinned=excluded.pinned,
               keep_alive=excluded.keep_alive, dirty_state=excluded.dirty_state,
               archived=excluded.archived, allow_screenshot=excluded.allow_screenshot,
               scroll_position=excluded.scroll_position, favicon_url=excluded.favicon_url,
               last_active_at=excluded.last_active_at, updated_at=excluded.updated_at`,
          )
          .run(
            c.id,
            c.workspaceId,
            c.workBoxId,
            c.parentPageId,
            c.url,
            c.title,
            c.domain,
            c.state,
            c.pinned ? 1 : 0,
            c.keepAlive ? 1 : 0,
            c.dirtyState ? 1 : 0,
            c.archived ? 1 : 0,
            c.allowScreenshot ? 1 : 0,
            c.sessionPartition,
            c.scrollPosition,
            c.faviconUrl,
            c.openedAt,
            c.lastActiveAt,
            c.createdAt,
            c.updatedAt,
          ),
      );
    });
  }

  loadWorkspaces(): Workspace[] {
    return this.db.driver
      .prepare("SELECT * FROM workspaces ORDER BY sort_order")
      .all()
      .map((row) => ({
        id: str(row["id"]),
        name: str(row["name"]),
        description: str(row["description"]),
        order: Number(row["sort_order"] ?? 0),
        createdAt: str(row["created_at"]),
        updatedAt: str(row["updated_at"]),
      }));
  }

  loadWorkBoxes(): WorkBox[] {
    return this.db.driver
      .prepare("SELECT * FROM workboxes ORDER BY sort_order")
      .all()
      .map((row) => ({
        id: str(row["id"]),
        workspaceId: str(row["workspace_id"]),
        name: str(row["name"]),
        description: str(row["description"]),
        order: Number(row["sort_order"] ?? 0),
        createdAt: str(row["created_at"]),
        updatedAt: str(row["updated_at"]),
      }));
  }

  /** Le pagine tornano sempre cold e senza renderer: sarà il restore a scaldarle. */
  loadPageCards(): PageCard[] {
    return this.db.driver
      .prepare("SELECT * FROM page_cards ORDER BY created_at")
      .all()
      .map((row) => ({
        id: str(row["id"]),
        workspaceId: str(row["workspace_id"]),
        workBoxId: strOrNull(row["workbox_id"]),
        parentPageId: strOrNull(row["parent_page_id"]),
        url: str(row["url"]),
        title: str(row["title"]),
        domain: str(row["domain"]),
        state: "cold" as const,
        pinned: bool(row["pinned"]),
        keepAlive: bool(row["keep_alive"]),
        dirtyState: false,
        archived: bool(row["archived"]),
        allowScreenshot: bool(row["allow_screenshot"]),
        sessionPartition: str(row["session_partition"]),
        scrollPosition: row["scroll_position"] === null ? null : Number(row["scroll_position"]),
        faviconUrl: strOrNull(row["favicon_url"]),
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
        crashed: false,
        loadError: null,
        hasView: false,
        openedAt: str(row["opened_at"]),
        lastActiveAt: str(row["last_active_at"]),
        createdAt: str(row["created_at"]),
        updatedAt: str(row["updated_at"]),
      }));
  }

  // --- snapshot e indice di ricerca ---

  upsertSnapshot(
    pageId: string,
    extracted: ExtractedContent,
    extra: { faviconUrl: string | null; scrollPosition: number | null },
  ): SnapshotUpsertResult {
    const contentHash = sha256(`${extracted.title}\n${extracted.text}\n${extracted.tablesText}`);
    const existing = this.db.driver
      .prepare("SELECT content_hash FROM page_snapshots WHERE page_id = ?")
      .get(pageId);
    if (existing && String(existing["content_hash"]) === contentHash) {
      return { changed: false, contentHash };
    }

    const timestamp = this.now();
    const domain = safeHostname(extracted.url);
    this.db.transaction(() => {
      this.db.driver
        .prepare(
          `INSERT INTO page_snapshots (
             id, page_id, url, canonical_url, title, domain, favicon_url, description,
             language, headings_json, text, open_graph_json, json_ld_json, author,
             published_at, links_json, tables_text, content_hash, normalized_url_hash,
             scroll_position, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(page_id) DO UPDATE SET
             url=excluded.url, canonical_url=excluded.canonical_url, title=excluded.title,
             domain=excluded.domain, favicon_url=excluded.favicon_url,
             description=excluded.description, language=excluded.language,
             headings_json=excluded.headings_json, text=excluded.text,
             open_graph_json=excluded.open_graph_json, json_ld_json=excluded.json_ld_json,
             author=excluded.author, published_at=excluded.published_at,
             links_json=excluded.links_json, tables_text=excluded.tables_text,
             content_hash=excluded.content_hash,
             normalized_url_hash=excluded.normalized_url_hash,
             scroll_position=excluded.scroll_position, updated_at=excluded.updated_at`,
        )
        .run(
          crypto.randomUUID(),
          pageId,
          extracted.url,
          extracted.canonicalUrl,
          extracted.title,
          domain,
          extra.faviconUrl,
          extracted.description,
          extracted.language,
          JSON.stringify(extracted.headings),
          extracted.text,
          JSON.stringify(extracted.openGraph),
          JSON.stringify(extracted.jsonLd),
          extracted.author,
          extracted.publishedAt,
          JSON.stringify(extracted.links),
          extracted.tablesText,
          contentHash,
          sha256(normalizeUrlForHash(extracted.url)),
          extra.scrollPosition,
          timestamp,
          timestamp,
        );

      this.db.driver.prepare("DELETE FROM page_fts WHERE page_id = ?").run(pageId);
      this.db.driver
        .prepare(
          `INSERT INTO page_fts (page_id, title, url, domain, content, summary, tags, entities, notes)
           VALUES (?, ?, ?, ?, ?, '', '', '', '')`,
        )
        .run(
          pageId,
          extracted.title,
          extracted.url,
          domain,
          `${extracted.headings.join("\n")}\n${extracted.text}\n${extracted.tablesText}`,
        );
    });
    return { changed: true, contentHash };
  }

  setScreenshotPath(pageId: string, screenshotPath: string | null): void {
    this.db.driver
      .prepare("UPDATE page_snapshots SET screenshot_path = ?, updated_at = ? WHERE page_id = ?")
      .run(screenshotPath, this.now(), pageId);
  }

  getSnapshotMeta(pageId: string): { contentHash: string; screenshotPath: string | null } | null {
    const row = this.db.driver
      .prepare("SELECT content_hash, screenshot_path FROM page_snapshots WHERE page_id = ?")
      .get(pageId);
    return row
      ? { contentHash: str(row["content_hash"]), screenshotPath: strOrNull(row["screenshot_path"]) }
      : null;
  }

  // --- cronologia di navigazione ---

  appendNavigation(pageId: string, url: string, title: string): void {
    this.db.driver
      .prepare(
        "INSERT INTO page_navigation_history (page_id, url, title, navigated_at) VALUES (?, ?, ?, ?)",
      )
      .run(pageId, url, title, this.now());
  }

  // --- ricerca locale full-text ---

  searchLocal(request: LocalSearchRequest): LocalSearchResult[] {
    const ftsQuery = buildFtsQuery(request.query);
    if (!ftsQuery) {
      return [];
    }
    const clauses: string[] = [];
    const params: SqlValue[] = [ftsQuery];
    if (request.workspaceId) {
      clauses.push("c.workspace_id = ?");
      params.push(request.workspaceId);
    }
    if (request.workBoxId) {
      clauses.push("c.workbox_id = ?");
      params.push(request.workBoxId);
    }
    if (request.domain) {
      clauses.push("c.domain = ?");
      params.push(request.domain);
    }
    if (request.pinnedOnly) {
      clauses.push("c.pinned = 1");
    }
    if (request.includeArchived === false) {
      clauses.push("c.archived = 0");
    }
    const where = clauses.length > 0 ? `AND ${clauses.join(" AND ")}` : "";
    const rows = this.db.driver
      .prepare(
        `SELECT c.id, c.workspace_id, c.workbox_id, c.title, c.url, c.domain, c.archived, c.pinned,
                snippet(page_fts, 4, '«', '»', '…', 12) AS snip
         FROM page_fts
         JOIN page_cards c ON c.id = page_fts.page_id
         WHERE page_fts MATCH ? ${where}
         ORDER BY rank
         LIMIT ?`,
      )
      .all(...params, request.limit ?? 30);
    return rows.map((row) => ({
      pageId: str(row["id"]),
      workspaceId: str(row["workspace_id"]),
      workBoxId: strOrNull(row["workbox_id"]),
      title: str(row["title"]),
      url: str(row["url"]),
      domain: str(row["domain"]),
      snippet: str(row["snip"]),
      archived: bool(row["archived"]),
      pinned: bool(row["pinned"]),
    }));
  }

  // --- internals ---

  private upsertAndPrune<T extends { id: string }>(
    table: "workspaces" | "workboxes" | "page_cards",
    items: T[],
    upsert: (item: T) => unknown,
  ): void {
    for (const item of items) {
      upsert(item);
    }
    if (items.length === 0) {
      this.db.driver.prepare(`DELETE FROM ${table}`).run();
      return;
    }
    const placeholders = items.map(() => "?").join(",");
    this.db.driver
      .prepare(`DELETE FROM ${table} WHERE id NOT IN (${placeholders})`)
      .run(...items.map((i) => i.id));
  }
}

function safeHostname(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return "";
  }
}

/** Query FTS sicura: ogni token diventa una frase quotata con prefix match. */
function buildFtsQuery(userQuery: string): string {
  const tokens = userQuery
    .split(/\s+/)
    .map((t) => t.replaceAll('"', "").trim())
    .filter((t) => t.length > 0)
    .slice(0, 8);
  if (tokens.length === 0) {
    return "";
  }
  return tokens.map((t) => `"${t}"*`).join(" ");
}
