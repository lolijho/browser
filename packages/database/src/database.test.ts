import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { ExtractedContent, PageCard, WorkBox, Workspace } from "@businessbox/contracts";
import { NodeSqliteDriver } from "./driver.js";
import {
  CURRENT_SCHEMA_VERSION,
  MIGRATIONS,
  getSchemaVersion,
  runMigrations,
} from "./migrations.js";
import { LocalDatabase } from "./local-database.js";
import { Repositories, normalizeUrlForHash } from "./repositories.js";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "bbx-db-"));
}

function makeWorkspace(id = "default"): Workspace {
  const now = new Date().toISOString();
  return { id, name: "Principale", description: "", order: 0, createdAt: now, updatedAt: now };
}

function makeCard(id: string, workspaceId = "default", patch: Partial<PageCard> = {}): PageCard {
  const now = new Date().toISOString();
  return {
    id,
    workspaceId,
    workBoxId: null,
    parentPageId: null,
    url: `https://sito-${id}.example/pagina`,
    title: `Pagina ${id}`,
    domain: `sito-${id}.example`,
    state: "cold",
    pinned: false,
    keepAlive: false,
    dirtyState: false,
    archived: false,
    allowScreenshot: true,
    allowAI: true,
    sessionPartition: `persist:workspace-${workspaceId}`,
    scrollPosition: null,
    faviconUrl: null,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    crashed: false,
    loadError: null,
    hasView: false,
    openedAt: now,
    lastActiveAt: now,
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

function makeExtracted(patch: Partial<ExtractedContent> = {}): ExtractedContent {
  return {
    url: "https://sito-a.example/pagina",
    canonicalUrl: null,
    title: "Listino fotovoltaico 2026",
    description: "Preventivi e prezzi",
    language: "it",
    headings: ["Listino", "Prezzi moduli"],
    text: "Il preventivo per l'impianto fotovoltaico da 6 kW parte da 8.900 euro.",
    openGraph: { "og:title": "Listino" },
    jsonLd: [],
    author: null,
    publishedAt: null,
    links: ["https://sito-a.example/contatti"],
    tablesText: "Modulo A | 320W | 189 euro",
    ...patch,
  };
}

describe("migrazioni", () => {
  it("da database vuoto arriva alla versione corrente", () => {
    const driver = new NodeSqliteDriver(":memory:");
    expect(getSchemaVersion(driver)).toBe(0);
    const applied = runMigrations(driver);
    expect(applied).toEqual(MIGRATIONS.map((m) => m.version));
    expect(getSchemaVersion(driver)).toBe(CURRENT_SCHEMA_VERSION);
    driver.close();
  });

  it("aggiorna da una versione precedente applicando solo le mancanti", () => {
    const driver = new NodeSqliteDriver(":memory:");
    // Simula un'installazione ferma alla v1.
    driver.exec(MIGRATIONS[0]!.sql);
    driver.exec("PRAGMA user_version = 1");
    const applied = runMigrations(driver);
    expect(applied).toEqual(MIGRATIONS.filter((m) => m.version > 1).map((m) => m.version));
    expect(getSchemaVersion(driver)).toBe(CURRENT_SCHEMA_VERSION);
    driver.close();
  });

  it("è idempotente", () => {
    const driver = new NodeSqliteDriver(":memory:");
    runMigrations(driver);
    expect(runMigrations(driver)).toEqual([]);
    driver.close();
  });
});

describe("LocalDatabase", () => {
  it("recupera un file corrotto mettendolo in quarantena", () => {
    const dir = tempDir();
    const path = join(dir, "businessbox.db");
    writeFileSync(path, "questo non è un database sqlite");

    const { db, recoveredFromCorruption } = LocalDatabase.open(path);
    expect(recoveredFromCorruption).toBe(true);
    expect(db.getSchemaVersion()).toBe(CURRENT_SCHEMA_VERSION);
    expect(readdirSync(dir).some((f) => f.includes(".corrupt-"))).toBe(true);
    db.close();
  });

  it("backup con VACUUM INTO e riapertura del backup", () => {
    const dir = tempDir();
    const { db } = LocalDatabase.open(join(dir, "main.db"));
    const repos = new Repositories(db);
    repos.saveBrowserModel([makeWorkspace()], [], [makeCard("a")]);

    const backupPath = join(dir, "backup.db");
    db.backupTo(backupPath);
    db.close();

    const { db: restored, recoveredFromCorruption } = LocalDatabase.open(backupPath);
    expect(recoveredFromCorruption).toBe(false);
    expect(new Repositories(restored).loadPageCards()).toHaveLength(1);
    restored.close();
  });
});

describe("Repositories — persistenza modello browser", () => {
  let db: LocalDatabase;
  let repos: Repositories;

  beforeEach(() => {
    db = LocalDatabase.open(":memory:").db;
    repos = new Repositories(db);
  });

  it("roundtrip: workspaces, workboxes e page_cards sopravvivono", () => {
    const ws = makeWorkspace();
    const now = new Date().toISOString();
    const box: WorkBox = {
      id: "box1",
      workspaceId: ws.id,
      name: "Fornitori",
      description: "",
      order: 0,
      createdAt: now,
      updatedAt: now,
    };
    const cards = [
      makeCard("a", ws.id, { pinned: true, workBoxId: "box1" }),
      makeCard("b", ws.id, { archived: true }),
    ];
    repos.saveBrowserModel([ws], [box], cards);

    const loadedCards = repos.loadPageCards();
    expect(repos.loadWorkspaces()).toHaveLength(1);
    expect(repos.loadWorkBoxes()[0]?.name).toBe("Fornitori");
    expect(loadedCards).toHaveLength(2);
    const a = loadedCards.find((c) => c.id === "a");
    expect(a?.pinned).toBe(true);
    expect(a?.workBoxId).toBe("box1");
    expect(a?.state).toBe("cold");
    expect(a?.hasView).toBe(false);
    expect(a?.sessionPartition).toBe("persist:workspace-default");
    expect(loadedCards.find((c) => c.id === "b")?.archived).toBe(true);
  });

  it("le pagine eliminate spariscono al salvataggio successivo", () => {
    const ws = makeWorkspace();
    repos.saveBrowserModel([ws], [], [makeCard("a"), makeCard("b")]);
    repos.saveBrowserModel([ws], [], [makeCard("a")]);
    expect(repos.loadPageCards().map((c) => c.id)).toEqual(["a"]);
  });

  it("impostazioni chiave/valore JSON", () => {
    repos.setSetting("session", { activeWorkspaceId: "default" });
    expect(repos.getSetting<{ activeWorkspaceId: string }>("session")?.activeWorkspaceId).toBe(
      "default",
    );
    expect(repos.getSetting("inesistente")).toBeNull();
  });
});

describe("Repositories — snapshot, hash e ricerca", () => {
  let db: LocalDatabase;
  let repos: Repositories;

  beforeEach(() => {
    db = LocalDatabase.open(":memory:").db;
    repos = new Repositories(db);
    repos.saveBrowserModel([makeWorkspace()], [], [makeCard("a"), makeCard("b")]);
  });

  it("il content hash evita duplicazioni e re-processing", () => {
    const first = repos.upsertSnapshot("a", makeExtracted(), {
      faviconUrl: null,
      scrollPosition: 0,
    });
    expect(first.changed).toBe(true);
    const second = repos.upsertSnapshot("a", makeExtracted(), {
      faviconUrl: null,
      scrollPosition: 100,
    });
    expect(second.changed).toBe(false);
    expect(second.contentHash).toBe(first.contentHash);
    const third = repos.upsertSnapshot("a", makeExtracted({ text: "Contenuto cambiato" }), {
      faviconUrl: null,
      scrollPosition: 0,
    });
    expect(third.changed).toBe(true);
  });

  it("la ricerca trova il contenuto estratto (testo e tabelle)", () => {
    repos.upsertSnapshot("a", makeExtracted(), { faviconUrl: null, scrollPosition: null });
    const byText = repos.searchLocal({ query: "fotovoltaico preventivo" });
    expect(byText).toHaveLength(1);
    expect(byText[0]?.pageId).toBe("a");
    expect(byText[0]?.snippet.length).toBeGreaterThan(0);

    const byTable = repos.searchLocal({ query: "320W" });
    expect(byTable.map((r) => r.pageId)).toContain("a");

    expect(repos.searchLocal({ query: "inesistente_xyz" })).toHaveLength(0);
  });

  it("filtri: workspace, dominio, archiviate", () => {
    repos.upsertSnapshot("a", makeExtracted(), { faviconUrl: null, scrollPosition: null });
    expect(repos.searchLocal({ query: "fotovoltaico", workspaceId: "default" })).toHaveLength(1);
    expect(repos.searchLocal({ query: "fotovoltaico", workspaceId: "altro" })).toHaveLength(0);
    expect(repos.searchLocal({ query: "fotovoltaico", domain: "sito-a.example" })).toHaveLength(1);
    expect(repos.searchLocal({ query: "fotovoltaico", domain: "sito-x.example" })).toHaveLength(0);
  });

  it("cronologia di navigazione", () => {
    repos.appendNavigation("a", "https://sito-a.example/1", "Uno");
    repos.appendNavigation("a", "https://sito-a.example/2", "Due");
    const rows = db.driver
      .prepare("SELECT url FROM page_navigation_history WHERE page_id = ? ORDER BY id")
      .all("a");
    expect(rows.map((r) => r["url"])).toEqual([
      "https://sito-a.example/1",
      "https://sito-a.example/2",
    ]);
  });

  it("screenshot path e query FTS ostili", () => {
    repos.upsertSnapshot("a", makeExtracted(), { faviconUrl: null, scrollPosition: null });
    repos.setScreenshotPath("a", "/tmp/shot.png");
    expect(repos.getSnapshotMeta("a")?.screenshotPath).toBe("/tmp/shot.png");
    // Sintassi FTS ostile: mai un errore SQL.
    expect(() => repos.searchLocal({ query: 'AND OR NOT "*' })).not.toThrow();
  });
});

describe("normalizeUrlForHash", () => {
  it("rimuove fragment e parametri di tracking, normalizza l'host", () => {
    expect(
      normalizeUrlForHash("https://Example.com/pagina?utm_source=x&q=1&fbclid=abc#sezione"),
    ).toBe("https://example.com/pagina?q=1");
  });
});
