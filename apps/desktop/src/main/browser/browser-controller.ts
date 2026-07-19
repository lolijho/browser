import { WebContentsView, type BrowserWindow, type Session, type WebContents } from "electron";
import type { BrowserState, ContentBounds, PageState } from "@businessbox/contracts";
import { DEFAULT_WORKSPACE_ID, INTERNAL_NEWTAB_URL } from "@businessbox/shared";
import { resolveNavigationInput, type SearchEngineManager } from "@businessbox/search";
import type { WorkspaceSessionManager } from "./workspace-session-manager";
import { evaluatePinRequest } from "./pin-rules";

interface PageEntry {
  readonly id: string;
  readonly workspaceId: string;
  url: string;
  title: string;
  faviconUrl: string | null;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  crashed: boolean;
  loadError: PageState["loadError"];
  pinned: boolean;
  createdAt: string;
  lastActiveAt: string;
  view: WebContentsView | null;
}

const ALLOWED_NAVIGATION_PROTOCOLS = new Set(["http:", "https:"]);

function isAllowedRemoteUrl(rawUrl: string): boolean {
  try {
    return ALLOWED_NAVIGATION_PROTOCOLS.has(new URL(rawUrl).protocol);
  } catch {
    return false;
  }
}

export interface BrowserControllerOptions {
  window: BrowserWindow;
  sessions: WorkspaceSessionManager<Session>;
  searchManager: SearchEngineManager;
  onStateChange: (snapshot: BrowserState) => void;
}

/**
 * Servizio del main process che possiede tutte le pagine remote:
 * creazione/distruzione WebContentsView, navigazione, bounds, eventi
 * (titolo, URL, favicon, loading, crash), popup → nuove pagine.
 */
export class BrowserController {
  private readonly pages = new Map<string, PageEntry>();
  private order: string[] = [];
  private activePageId: string | null = null;
  private attachedView: WebContentsView | null = null;
  private contentBounds: ContentBounds = { x: 0, y: 0, width: 0, height: 0 };
  private targetUrl: string | null = null;

  constructor(private readonly options: BrowserControllerOptions) {}

  // --- API pubblica (chiamata dai handler IPC e dal menu) ---

  createPage(request: { url?: string; workspaceId?: string; activate?: boolean } = {}): PageState {
    const now = new Date().toISOString();
    const page: PageEntry = {
      id: crypto.randomUUID(),
      workspaceId: request.workspaceId ?? DEFAULT_WORKSPACE_ID,
      url: INTERNAL_NEWTAB_URL,
      title: "Nuova pagina",
      faviconUrl: null,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      crashed: false,
      loadError: null,
      pinned: false,
      createdAt: now,
      lastActiveAt: now,
      view: null,
    };
    this.pages.set(page.id, page);
    this.order.push(page.id);

    const targetUrl = request.url;
    if (targetUrl && targetUrl !== INTERNAL_NEWTAB_URL) {
      this.loadUrl(page, targetUrl);
    }
    if (request.activate ?? true) {
      this.activatePage(page.id);
    } else {
      this.emit();
    }
    return this.toPageState(page);
  }

  closePage(pageId: string): void {
    const page = this.mustGet(pageId);
    this.destroyView(page);
    this.pages.delete(pageId);
    this.order = this.order.filter((id) => id !== pageId);

    if (this.activePageId === pageId) {
      this.activePageId = null;
      const fallback = this.order.at(-1);
      if (fallback) {
        this.activatePage(fallback);
        return;
      }
      // Il browser ha sempre una pagina attiva: ricrea una newtab interna.
      this.createPage();
      return;
    }
    this.emit();
  }

  activatePage(pageId: string): void {
    const page = this.mustGet(pageId);
    this.activePageId = pageId;
    page.lastActiveAt = new Date().toISOString();
    this.targetUrl = null;
    this.syncActiveView();
    this.emit();
  }

  navigate(pageId: string, input: string): void {
    const page = this.mustGet(pageId);
    const resolved = resolveNavigationInput(input, this.options.searchManager);
    if (resolved === INTERNAL_NEWTAB_URL) {
      this.destroyView(page);
      page.url = INTERNAL_NEWTAB_URL;
      page.title = "Nuova pagina";
      page.faviconUrl = null;
      page.loadError = null;
      page.crashed = false;
      this.syncActiveView();
      this.emit();
      return;
    }
    this.loadUrl(page, resolved);
    this.emit();
  }

  goBack(pageId: string): void {
    const wc = this.mustGet(pageId).view?.webContents;
    if (wc && wc.navigationHistory.canGoBack()) {
      wc.navigationHistory.goBack();
    }
  }

  goForward(pageId: string): void {
    const wc = this.mustGet(pageId).view?.webContents;
    if (wc && wc.navigationHistory.canGoForward()) {
      wc.navigationHistory.goForward();
    }
  }

  reload(pageId: string): void {
    const page = this.mustGet(pageId);
    if (!page.view) {
      return;
    }
    // Copre anche il ripristino post-crash e il retry dalla pagina di errore.
    page.crashed = false;
    page.loadError = null;
    page.view.webContents.reload();
    this.syncActiveView();
    this.emit();
  }

  stop(pageId: string): void {
    this.mustGet(pageId).view?.webContents.stop();
  }

  setPinned(pageId: string, pinned: boolean): { ok: boolean; reason?: string } {
    const page = this.mustGet(pageId);
    const pinnedIds = this.order.filter((id) => this.pages.get(id)?.pinned);
    const verdict = evaluatePinRequest(pinnedIds, pageId, pinned);
    if (verdict.ok) {
      page.pinned = pinned;
      this.emit();
    }
    return verdict;
  }

  openDevTools(pageId: string): void {
    this.mustGet(pageId).view?.webContents.openDevTools({ mode: "detach" });
  }

  setContentBounds(bounds: ContentBounds): void {
    this.contentBounds = bounds;
    this.applyBoundsToAttachedView();
  }

  getActivePageId(): string | null {
    return this.activePageId;
  }

  getSnapshot(): BrowserState {
    return {
      pages: this.order
        .map((id) => this.pages.get(id))
        .filter((page): page is PageEntry => page !== undefined)
        .map((page) => this.toPageState(page)),
      activePageId: this.activePageId,
      targetUrl: this.targetUrl,
    };
  }

  // --- internals ---

  private mustGet(pageId: string): PageEntry {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Pagina inesistente: ${pageId}`);
    }
    return page;
  }

  private loadUrl(page: PageEntry, url: string): void {
    if (!isAllowedRemoteUrl(url)) {
      page.loadError = { code: 0, description: "Protocollo non consentito", failedUrl: url };
      this.syncActiveView();
      return;
    }
    page.loadError = null;
    page.crashed = false;
    this.ensureView(page);
    void page.view?.webContents.loadURL(url);
  }

  private ensureView(page: PageEntry): void {
    if (page.view) {
      return;
    }
    const view = new WebContentsView({
      webPreferences: {
        session: this.options.sessions.getSession(page.workspaceId),
        // Nessun preload: le pagine remote non ricevono alcuna API privilegiata.
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    page.view = view;
    this.wireWebContents(page, view.webContents);
    this.syncActiveView();
  }

  private wireWebContents(page: PageEntry, wc: WebContents): void {
    wc.setWindowOpenHandler(({ url }) => {
      // I popup diventano nuove pagine nello stesso workspace, mai finestre arbitrarie.
      if (isAllowedRemoteUrl(url)) {
        this.createPage({ url, workspaceId: page.workspaceId, activate: true });
      }
      return { action: "deny" };
    });

    wc.on("will-navigate", (event, url) => {
      if (!isAllowedRemoteUrl(url)) {
        event.preventDefault();
      }
    });

    wc.on("will-attach-webview", (event) => {
      event.preventDefault();
    });

    wc.on("did-start-loading", () => {
      page.isLoading = true;
      this.emit();
    });

    wc.on("did-stop-loading", () => {
      page.isLoading = false;
      this.updateNavigationState(page, wc);
      this.emit();
    });

    wc.on("page-title-updated", (_event, title) => {
      page.title = title;
      this.emit();
    });

    wc.on("page-favicon-updated", (_event, favicons) => {
      const candidate = favicons.find((f) => f.startsWith("https://")) ?? null;
      page.faviconUrl = candidate;
      this.emit();
    });

    wc.on("did-navigate", (_event, url) => {
      page.url = url;
      page.loadError = null;
      this.updateNavigationState(page, wc);
      this.syncActiveView();
      this.emit();
    });

    wc.on("did-navigate-in-page", (_event, url, isMainFrame) => {
      if (isMainFrame) {
        page.url = url;
        this.updateNavigationState(page, wc);
        this.emit();
      }
    });

    wc.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      // -3 = ERR_ABORTED (navigazione interrotta volontariamente): non è un errore.
      if (!isMainFrame || errorCode === -3) {
        return;
      }
      page.isLoading = false;
      page.loadError = { code: errorCode, description: errorDescription, failedUrl: validatedURL };
      this.syncActiveView();
      this.emit();
    });

    wc.on("render-process-gone", (_event, details) => {
      if (details.reason === "clean-exit") {
        return;
      }
      page.crashed = true;
      page.isLoading = false;
      this.syncActiveView();
      this.emit();
    });

    wc.on("update-target-url", (_event, url) => {
      if (page.id === this.activePageId) {
        this.targetUrl = url === "" ? null : url;
        this.emit();
      }
    });
  }

  private updateNavigationState(page: PageEntry, wc: WebContents): void {
    page.canGoBack = wc.navigationHistory.canGoBack();
    page.canGoForward = wc.navigationHistory.canGoForward();
  }

  /**
   * Mantiene attaccata alla finestra SOLO la view della pagina attiva,
   * e solo se in condizione di essere mostrata (niente crash/errore):
   * negli altri casi la shell React rende la pagina interna corrispondente.
   */
  private syncActiveView(): void {
    const active = this.activePageId ? this.pages.get(this.activePageId) : undefined;
    const shouldShow =
      active && active.view && !active.crashed && !active.loadError ? active.view : null;

    if (this.attachedView === shouldShow) {
      this.applyBoundsToAttachedView();
      return;
    }
    if (this.attachedView) {
      this.options.window.contentView.removeChildView(this.attachedView);
      this.attachedView = null;
    }
    if (shouldShow) {
      this.options.window.contentView.addChildView(shouldShow);
      this.attachedView = shouldShow;
      this.applyBoundsToAttachedView();
    }
  }

  private applyBoundsToAttachedView(): void {
    if (!this.attachedView) {
      return;
    }
    this.attachedView.setBounds({
      x: Math.round(this.contentBounds.x),
      y: Math.round(this.contentBounds.y),
      width: Math.round(this.contentBounds.width),
      height: Math.round(this.contentBounds.height),
    });
  }

  private destroyView(page: PageEntry): void {
    if (!page.view) {
      return;
    }
    if (this.attachedView === page.view) {
      this.options.window.contentView.removeChildView(page.view);
      this.attachedView = null;
    }
    page.view.webContents.close();
    page.view = null;
  }

  private toPageState(page: PageEntry): PageState {
    return {
      id: page.id,
      workspaceId: page.workspaceId,
      url: page.url,
      title: page.title,
      faviconUrl: page.faviconUrl,
      isLoading: page.isLoading,
      canGoBack: page.canGoBack,
      canGoForward: page.canGoForward,
      crashed: page.crashed,
      loadError: page.loadError,
      pinned: page.pinned,
      hasView: page.view !== null,
      createdAt: page.createdAt,
      lastActiveAt: page.lastActiveAt,
    };
  }

  private emit(): void {
    this.options.onStateChange(this.getSnapshot());
  }
}
