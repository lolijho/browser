import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BrowserState, ExtractedContent } from "@businessbox/contracts";
import type { LocalSearchRequest, LocalSearchResult } from "@businessbox/contracts";
import { LocalDatabase, Repositories, LOCAL_DATABASE_FILENAME } from "@businessbox/database";
import type { TabSessionState } from "./browser/tab-store";

const SAVE_DEBOUNCE_MS = 800;

const SETTING_SESSION = "session.state";
const SETTING_SEARCH = "search.settings";
const SETTING_SCREENSHOTS_ENABLED = "screenshots.enabled";

/**
 * Ponte tra il dominio in-memory (TabStore/SearchEngineManager) e SQLite:
 * carica all'avvio, salva con debounce a ogni mutazione, flush alla chiusura.
 */
export class PersistenceService {
  readonly repos: Repositories;
  private readonly db: LocalDatabase;
  readonly recoveredFromCorruption: boolean;
  private readonly screenshotsDir: string;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private pending: { state: BrowserState; session: TabSessionState } | null = null;

  constructor(userDataDir: string) {
    const opened = LocalDatabase.open(join(userDataDir, LOCAL_DATABASE_FILENAME));
    this.db = opened.db;
    this.recoveredFromCorruption = opened.recoveredFromCorruption;
    this.repos = new Repositories(this.db);
    this.screenshotsDir = join(userDataDir, "screenshots");
    mkdirSync(this.screenshotsDir, { recursive: true });
  }

  load(): {
    workspaces: ReturnType<Repositories["loadWorkspaces"]>;
    workBoxes: ReturnType<Repositories["loadWorkBoxes"]>;
    cards: ReturnType<Repositories["loadPageCards"]>;
    session: TabSessionState | null;
    searchSettingsJson: string | null;
  } {
    const searchSettings = this.repos.getSetting<unknown>(SETTING_SEARCH);
    return {
      workspaces: this.repos.loadWorkspaces(),
      workBoxes: this.repos.loadWorkBoxes(),
      cards: this.repos.loadPageCards(),
      session: this.repos.getSetting<TabSessionState>(SETTING_SESSION),
      searchSettingsJson: searchSettings ? JSON.stringify(searchSettings) : null,
    };
  }

  scheduleSave(state: BrowserState, session: TabSessionState): void {
    this.pending = { state, session };
    if (this.saveTimer) {
      return;
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, SAVE_DEBOUNCE_MS);
  }

  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const pending = this.pending;
    if (!pending) {
      return;
    }
    this.pending = null;
    this.repos.saveBrowserModel(
      pending.state.workspaces,
      pending.state.workBoxes,
      pending.state.pages,
    );
    this.repos.setSetting(SETTING_SESSION, pending.session);
    this.repos.setSetting(SETTING_SEARCH, pending.state.searchSettings);
  }

  screenshotsEnabled(): boolean {
    return this.repos.getSetting<boolean>(SETTING_SCREENSHOTS_ENABLED) ?? true;
  }

  recordNavigation(pageId: string, url: string, title: string): void {
    try {
      this.repos.appendNavigation(pageId, url, title);
    } catch {
      // La pagina potrebbe non essere ancora persistita: la cronologia è best-effort.
    }
  }

  storeExtracted(
    pageId: string,
    extracted: ExtractedContent,
    meta: { faviconUrl: string | null; scrollPosition: number | null },
  ): void {
    try {
      this.repos.upsertSnapshot(pageId, extracted, meta);
    } catch {
      // Snapshot best-effort: la card potrebbe non essere ancora salvata (debounce).
    }
  }

  saveScreenshot(pageId: string, png: Uint8Array): void {
    try {
      const path = join(this.screenshotsDir, `${pageId}.png`);
      writeFileSync(path, png);
      this.repos.setScreenshotPath(pageId, path);
    } catch {
      // Best-effort.
    }
  }

  deleteScreenshot(pageId: string): void {
    const path = join(this.screenshotsDir, `${pageId}.png`);
    if (existsSync(path)) {
      rmSync(path);
    }
    try {
      this.repos.setScreenshotPath(pageId, null);
    } catch {
      // Nessuno snapshot: niente da aggiornare.
    }
  }

  searchLocal(request: LocalSearchRequest): LocalSearchResult[] {
    return this.repos.searchLocal(request);
  }

  getSnapshotText(pageId: string): { title: string; url: string; text: string } | null {
    return this.repos.getSnapshotText(pageId);
  }

  close(): void {
    this.flush();
    this.db.close();
  }
}
