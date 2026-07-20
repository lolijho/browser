import { join } from "node:path";
import { WebContentsView, net, type BrowserWindow, type Session, type WebContents } from "electron";
import type {
  BrowserState,
  ContentBounds,
  DeletePageResponse,
  PageCard,
  SetPinnedResponse,
} from "@businessbox/contracts";
import {
  PAGE_IPC_CHANNELS,
  type ExtractedContent,
  type OpenSearchProposal,
} from "@businessbox/contracts";
import { INTERNAL_NEWTAB_URL } from "@businessbox/shared";
import {
  parseOpenSearchDescriptor,
  type ConfigurableSearchEngineManager,
} from "@businessbox/search";
import type { WorkspaceSessionManager } from "./workspace-session-manager";
import { TabStore, type CreatePageInput } from "./tab-store";
import {
  DEFAULT_LIFECYCLE_CONFIG,
  computeDesiredLifecycle,
  type LifecycleConfig,
} from "./lifecycle-rules";

const ALLOWED_NAVIGATION_PROTOCOLS = new Set(["http:", "https:"]);
const LIFECYCLE_TICK_MS = 30_000;
const OPENSEARCH_MAX_BYTES = 65536;

/** Fetch del descriptor OpenSearch: solo https, dimensione limitata. */
async function defaultFetchText(url: string): Promise<string> {
  const response = await net.fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const text = await response.text();
  if (text.length > OPENSEARCH_MAX_BYTES) {
    throw new Error("Descriptor OpenSearch troppo grande");
  }
  return text;
}

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
  searchManager: ConfigurableSearchEngineManager;
  store?: TabStore;
  lifecycleConfig?: LifecycleConfig;
  onStateChange: (snapshot: BrowserState) => void;
  onOpenSearchProposal: (proposal: OpenSearchProposal) => void;
  /** Fetch del descriptor OpenSearch, iniettabile nei test. */
  fetchText?: (url: string) => Promise<string>;
  /** Hook di persistenza (fase 04): assenti nei test del controller. */
  onNavigationCommitted?: (pageId: string, url: string, title: string) => void;
  onSnapshotExtracted?: (
    pageId: string,
    extracted: ExtractedContent,
    meta: { faviconUrl: string | null; scrollPosition: number | null },
  ) => void;
  screenshotsEnabled?: () => boolean;
  onScreenshotCaptured?: (pageId: string, png: Uint8Array) => void;
  onScreenshotDeleted?: (pageId: string) => void;
}

/**
 * Riconcilia il dominio Smart Tabs (TabStore) con i WebContentsView reali:
 * crea/distrugge renderer secondo le regole hot/warm/cold, mantiene attaccata
 * solo la view attiva, instrada eventi e navigazione.
 */
export class BrowserController {
  private readonly store: TabStore;
  private readonly lifecycleConfig: LifecycleConfig;
  private readonly views = new Map<string, WebContentsView>();
  private readonly wcIdToPageId = new Map<number, string>();
  private attachedView: WebContentsView | null = null;
  private contentBounds: ContentBounds = { x: 0, y: 0, width: 0, height: 0 };
  private targetUrl: string | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly options: BrowserControllerOptions) {
    this.store = options.store ?? new TabStore();
    this.lifecycleConfig = options.lifecycleConfig ?? DEFAULT_LIFECYCLE_CONFIG;
  }

  start(): void {
    this.tickTimer = setInterval(() => this.update(), LIFECYCLE_TICK_MS);
  }

  dispose(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  // --- API pubblica ---

  createPage(request: CreatePageInput & { activate?: boolean } = {}): PageCard {
    const card = this.store.createPage(request);
    if (card.url !== INTERNAL_NEWTAB_URL) {
      this.loadUrl(card.id, card.url);
    }
    if (request.activate ?? true) {
      this.store.activatePage(card.id);
      this.targetUrl = null;
    }
    this.update();
    return card;
  }

  activatePage(pageId: string): void {
    this.store.activatePage(pageId);
    this.targetUrl = null;
    this.restoreIfCold(pageId);
    this.update();
  }

  navigate(pageId: string, input: string, engineOverrideId?: string): void {
    const card = this.store.getCard(pageId);
    const resolved = this.options.searchManager.resolveNavigation(input, {
      ...(card ? { workspaceId: card.workspaceId } : {}),
      ...(engineOverrideId ? { engineOverrideId } : {}),
    });
    if (resolved === INTERNAL_NEWTAB_URL) {
      this.destroyView(pageId);
      this.store.navigationStarted(pageId, INTERNAL_NEWTAB_URL);
      this.store.patchRuntime(pageId, { title: "Nuova pagina", faviconUrl: null });
      this.update();
      return;
    }
    this.loadUrl(pageId, resolved);
    this.update();
  }

  goBack(pageId: string): void {
    const wc = this.views.get(pageId)?.webContents;
    if (wc && wc.navigationHistory.canGoBack()) {
      wc.navigationHistory.goBack();
    }
  }

  goForward(pageId: string): void {
    const wc = this.views.get(pageId)?.webContents;
    if (wc && wc.navigationHistory.canGoForward()) {
      wc.navigationHistory.goForward();
    }
  }

  reload(pageId: string): void {
    const card = this.store.getCard(pageId);
    if (!card) {
      return;
    }
    const view = this.views.get(pageId);
    if (!view) {
      // Pagina cold: il reload è un restore nella stessa session partition.
      this.restoreIfCold(pageId);
      this.update();
      return;
    }
    this.store.patchRuntime(pageId, { crashed: false, loadError: null });
    view.webContents.reload();
    this.update();
  }

  stop(pageId: string): void {
    this.views.get(pageId)?.webContents.stop();
  }

  setPinned(pageId: string, pinned: boolean, replacePageId?: string): SetPinnedResponse {
    const result = this.store.setPinned(pageId, pinned, replacePageId);
    this.update();
    return result;
  }

  archivePage(pageId: string, archived: boolean): void {
    this.store.archivePage(pageId, archived);
    if (archived) {
      this.ensureActivePage();
    }
    this.update();
  }

  deletePage(pageId: string, force = false): DeletePageResponse {
    const result = this.store.deletePage(pageId, force);
    if (result.ok) {
      this.destroyView(pageId);
      this.ensureActivePage();
    }
    this.update();
    return result;
  }

  movePage(pageId: string, workBoxId: string | null): void {
    this.store.movePage(pageId, workBoxId);
    this.update();
  }

  duplicatePage(pageId: string): void {
    const copy = this.store.duplicatePage(pageId);
    if (copy.url !== INTERNAL_NEWTAB_URL) {
      this.loadUrl(copy.id, copy.url);
    }
    this.store.activatePage(copy.id);
    this.update();
  }

  setKeepAlive(pageId: string, keepAlive: boolean): void {
    this.store.setKeepAlive(pageId, keepAlive);
    this.update();
  }

  createWorkspace(name: string): void {
    const workspace = this.store.createWorkspace(name);
    this.store.switchWorkspace(workspace.id);
    this.ensureActivePage();
    this.update();
  }

  switchWorkspace(workspaceId: string): void {
    this.store.switchWorkspace(workspaceId);
    this.ensureActivePage();
    this.targetUrl = null;
    this.update();
  }

  createWorkBox(name: string): void {
    this.store.createWorkBox(name);
    this.update();
  }

  openDevTools(pageId: string): void {
    this.views.get(pageId)?.webContents.openDevTools({ mode: "detach" });
  }

  setContentBounds(bounds: ContentBounds): void {
    this.contentBounds = bounds;
    this.applyBoundsToAttachedView();
  }

  getActivePageId(): string | null {
    return this.store.getActivePageId();
  }

  getSnapshot(): BrowserState {
    return {
      ...this.store.getSnapshot(this.targetUrl),
      searchSettings: this.options.searchManager.getSettingsSnapshot(),
    };
  }

  /** Ri-emette lo snapshot (usato dopo mutazioni delle impostazioni di ricerca). */
  emitState(): void {
    this.emit();
  }

  /** Eventi dal preload delle pagine remote, autenticati dal webContents id. */
  handlePageDirtyEvent(webContentsId: number, dirty: boolean): void {
    const pageId = this.wcIdToPageId.get(webContentsId);
    if (pageId) {
      this.store.setDirty(pageId, dirty);
      this.update();
    }
  }

  handlePageScrollEvent(webContentsId: number, y: number): void {
    const pageId = this.wcIdToPageId.get(webContentsId);
    if (pageId) {
      this.store.setScroll(pageId, y);
    }
  }

  private readonly openSearchProposals = new Map<string, OpenSearchProposal>();
  private readonly openSearchSeen = new Set<string>();
  private readonly extractTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly screenshotTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private scheduleExtractRequest(pageId: string, wc: WebContents): void {
    const existing = this.extractTimers.get(pageId);
    if (existing) {
      clearTimeout(existing);
    }
    this.extractTimers.set(
      pageId,
      setTimeout(() => {
        this.extractTimers.delete(pageId);
        if (!wc.isDestroyed()) {
          wc.send(PAGE_IPC_CHANNELS.requestExtract);
        }
      }, 2000),
    );
  }

  private scheduleScreenshot(pageId: string, wc: WebContents): void {
    const card = this.store.getCard(pageId);
    if (
      !card ||
      !card.allowScreenshot ||
      (this.options.screenshotsEnabled && !this.options.screenshotsEnabled()) ||
      !this.options.onScreenshotCaptured
    ) {
      return;
    }
    const existing = this.screenshotTimers.get(pageId);
    if (existing) {
      clearTimeout(existing);
    }
    this.screenshotTimers.set(
      pageId,
      setTimeout(() => {
        this.screenshotTimers.delete(pageId);
        // Solo la pagina attiva e visibile: capturePage su view nascoste è inaffidabile.
        if (wc.isDestroyed() || this.store.getActivePageId() !== pageId) {
          return;
        }
        void wc
          .capturePage()
          .then((image) => {
            if (!image.isEmpty()) {
              this.options.onScreenshotCaptured?.(pageId, image.toPNG());
            }
          })
          .catch(() => {
            // Screenshot best-effort: mai bloccare la navigazione.
          });
      }, 1500),
    );
  }

  /**
   * OpenSearch (prompt 03): il rilevamento produce SOLO una proposta.
   * L'installazione avviene esclusivamente con la conferma esplicita
   * dell'utente (decideOpenSearch).
   */
  handleOpenSearchDetected(webContentsId: number, href: string, title?: string): void {
    const pageId = this.wcIdToPageId.get(webContentsId);
    if (!pageId) {
      return;
    }
    let descriptorUrl: URL;
    try {
      descriptorUrl = new URL(href);
    } catch {
      return;
    }
    if (descriptorUrl.protocol !== "https:" || this.openSearchSeen.has(descriptorUrl.href)) {
      return;
    }
    this.openSearchSeen.add(descriptorUrl.href);

    const fetchText = this.options.fetchText ?? defaultFetchText;
    void fetchText(descriptorUrl.href)
      .then((xml) => {
        const descriptor = parseOpenSearchDescriptor(xml);
        if (!descriptor) {
          return;
        }
        const alreadyInstalled = this.options.searchManager
          .listEngines()
          .some((engine) => engine.searchUrlTemplate === descriptor.searchUrlTemplate);
        if (alreadyInstalled) {
          return;
        }
        const proposal: OpenSearchProposal = {
          proposalId: crypto.randomUUID(),
          pageId,
          name: title?.trim() || descriptor.shortName,
          keyword: new URL(descriptor.searchUrlTemplate.replace("%s", "q")).hostname,
          searchUrlTemplate: descriptor.searchUrlTemplate,
          sourceUrl: descriptorUrl.href,
        };
        this.openSearchProposals.set(proposal.proposalId, proposal);
        this.options.onOpenSearchProposal(proposal);
      })
      .catch(() => {
        // Descriptor irraggiungibile o non valido: nessuna proposta.
      });
  }

  /** Contenuto estratto dal preload: instradato alla persistenza (fase 04). */
  handleSnapshotExtracted(webContentsId: number, extracted: ExtractedContent): void {
    const pageId = this.wcIdToPageId.get(webContentsId);
    const card = pageId ? this.store.getCard(pageId) : undefined;
    if (!pageId || !card) {
      return;
    }
    this.options.onSnapshotExtracted?.(pageId, extracted, {
      faviconUrl: card.faviconUrl,
      scrollPosition: card.scrollPosition,
    });
  }

  setAllowScreenshot(pageId: string, allow: boolean): void {
    this.store.setAllowScreenshot(pageId, allow);
    if (!allow) {
      this.options.onScreenshotDeleted?.(pageId);
    }
    this.update();
  }

  setAllowAI(pageId: string, allow: boolean): void {
    this.store.setAllowAI(pageId, allow);
    this.update();
  }

  getPageCard(pageId: string): PageCard | undefined {
    return this.store.getCard(pageId);
  }

  deleteScreenshot(pageId: string): void {
    this.options.onScreenshotDeleted?.(pageId);
  }

  /**
   * Ripristino al riavvio: riattiva l'ultima pagina del workspace attivo
   * (ricreandola nella stessa partizione) e ricrea le pinned entro il limite;
   * tutte le altre restano cold.
   */
  restoreSession(): void {
    const activeId = this.store.getActivePageId();
    if (activeId) {
      this.activatePage(activeId);
    } else {
      this.ensureActivePage();
    }
    const pinned = this.store
      .pagesOf(this.store.getActiveWorkspaceId())
      .filter((p) => p.pinned && !p.archived)
      .slice(0, this.lifecycleConfig.maxHot - 1);
    for (const page of pinned) {
      this.restoreIfCold(page.id);
    }
    this.update();
  }

  decideOpenSearch(proposalId: string, accept: boolean): void {
    const proposal = this.openSearchProposals.get(proposalId);
    this.openSearchProposals.delete(proposalId);
    if (!proposal || !accept) {
      return;
    }
    this.options.searchManager.addOpenSearchEngine({
      name: proposal.name,
      keyword: proposal.keyword,
      searchUrlTemplate: proposal.searchUrlTemplate,
    });
    this.emit();
  }

  // --- internals ---

  private ensureActivePage(): void {
    if (this.store.getActivePageId()) {
      return;
    }
    const fallback = this.store.pickFallbackPageId(this.store.getActiveWorkspaceId());
    if (fallback) {
      this.store.activatePage(fallback);
      this.restoreIfCold(fallback);
      return;
    }
    const card = this.store.createPage();
    this.store.activatePage(card.id);
  }

  private restoreIfCold(pageId: string): void {
    const card = this.store.getCard(pageId);
    if (!card || this.views.has(pageId) || card.url === INTERNAL_NEWTAB_URL) {
      return;
    }
    this.loadUrl(pageId, card.url);
  }

  private loadUrl(pageId: string, url: string): void {
    const card = this.store.getCard(pageId);
    if (!card) {
      return;
    }
    if (!isAllowedRemoteUrl(url)) {
      this.store.patchRuntime(pageId, {
        loadError: { code: 0, description: "Protocollo non consentito", failedUrl: url },
      });
      return;
    }
    this.store.navigationStarted(pageId, url);
    const view = this.ensureView(card);
    void view.webContents.loadURL(url);
  }

  private ensureView(card: PageCard): WebContentsView {
    const existing = this.views.get(card.id);
    if (existing) {
      return existing;
    }
    const workspaceSession = this.options.sessions.getSession(card.workspaceId);
    const expectedPartition = this.options.sessions.getPartition(card.workspaceId);
    if (expectedPartition !== card.sessionPartition) {
      throw new Error(
        `Partizione incoerente per la pagina ${card.id}: ${card.sessionPartition} ≠ ${expectedPartition}`,
      );
    }
    const view = new WebContentsView({
      webPreferences: {
        session: workspaceSession,
        // Preload isolato: solo dirty-state e scroll, nulla è esposto alla pagina.
        preload: join(__dirname, "../preload/page.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    this.views.set(card.id, view);
    this.wcIdToPageId.set(view.webContents.id, card.id);
    this.store.patchRuntime(card.id, { hasView: true });
    this.wireWebContents(card.id, card.workspaceId, view.webContents);
    return view;
  }

  private wireWebContents(pageId: string, workspaceId: string, wc: WebContents): void {
    wc.setWindowOpenHandler(({ url }) => {
      // I popup diventano nuove PageCard figlie, mai finestre arbitrarie.
      if (isAllowedRemoteUrl(url)) {
        this.createPage({ url, workspaceId, parentPageId: pageId, activate: true });
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
      this.store.patchRuntime(pageId, { isLoading: true });
      this.update();
    });

    wc.on("did-stop-loading", () => {
      this.store.patchRuntime(pageId, {
        isLoading: false,
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
      });
      this.scheduleScreenshot(pageId, wc);
      this.update();
    });

    wc.on("did-finish-load", () => {
      const card = this.store.getCard(pageId);
      if (card?.scrollPosition && card.scrollPosition > 0) {
        wc.send(PAGE_IPC_CHANNELS.restoreScroll, { y: card.scrollPosition });
      }
    });

    wc.on("page-title-updated", (_event, title) => {
      this.store.patchRuntime(pageId, { title });
      this.update();
    });

    wc.on("page-favicon-updated", (_event, favicons) => {
      this.store.patchRuntime(pageId, {
        faviconUrl: favicons.find((f) => f.startsWith("https://")) ?? null,
      });
      this.update();
    });

    wc.on("did-navigate", (_event, url) => {
      this.store.patchRuntime(pageId, {
        url,
        loadError: null,
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
      });
      this.options.onNavigationCommitted?.(pageId, url, wc.getTitle());
      this.update();
    });

    wc.on("did-navigate-in-page", (_event, url, isMainFrame) => {
      if (isMainFrame) {
        this.store.patchRuntime(pageId, {
          url,
          canGoBack: wc.navigationHistory.canGoBack(),
          canGoForward: wc.navigationHistory.canGoForward(),
        });
        this.options.onNavigationCommitted?.(pageId, url, wc.getTitle());
        // SPA: chiedi una nuova estrazione con debounce (mai bloccante).
        this.scheduleExtractRequest(pageId, wc);
        this.update();
      }
    });

    wc.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      // -3 = ERR_ABORTED (navigazione interrotta volontariamente): non è un errore.
      if (!isMainFrame || errorCode === -3) {
        return;
      }
      this.store.patchRuntime(pageId, {
        isLoading: false,
        loadError: { code: errorCode, description: errorDescription, failedUrl: validatedURL },
      });
      this.update();
    });

    wc.on("render-process-gone", (_event, details) => {
      if (details.reason === "clean-exit") {
        return;
      }
      this.store.patchRuntime(pageId, { crashed: true, isLoading: false });
      this.update();
    });

    wc.on("update-target-url", (_event, url) => {
      if (pageId === this.store.getActivePageId()) {
        this.targetUrl = url === "" ? null : url;
        this.emit();
      }
    });
  }

  /** Riconciliazione: applica hot/warm/cold, distrugge i renderer cold, attacca l'attiva. */
  private update(): void {
    const cards = this.store.listCards();
    const desired = computeDesiredLifecycle(
      cards.map((card) => ({
        id: card.id,
        workspaceId: card.workspaceId,
        pinned: card.pinned,
        archived: card.archived,
        keepAlive: card.keepAlive,
        dirtyState: card.dirtyState,
        hasRenderer: this.views.has(card.id),
        lastActiveAt: card.lastActiveAt,
      })),
      this.store.getActivePageId(),
      this.store.getActiveWorkspaceId(),
      this.lifecycleConfig,
      Date.now(),
    );

    for (const [pageId, state] of desired) {
      if (state === "cold" && this.views.has(pageId)) {
        this.destroyView(pageId);
      }
      this.store.setLifecycle(pageId, state);
    }

    this.syncActiveView();
    this.emit();
  }

  private syncActiveView(): void {
    const activeId = this.store.getActivePageId();
    const activeCard = activeId ? this.store.getCard(activeId) : undefined;
    const view = activeId ? (this.views.get(activeId) ?? null) : null;
    const shouldShow =
      activeCard && view && !activeCard.crashed && !activeCard.loadError ? view : null;

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

  private destroyView(pageId: string): void {
    const view = this.views.get(pageId);
    if (!view) {
      return;
    }
    if (this.attachedView === view) {
      this.options.window.contentView.removeChildView(view);
      this.attachedView = null;
    }
    this.wcIdToPageId.delete(view.webContents.id);
    view.webContents.close();
    this.views.delete(pageId);
    this.store.patchRuntime(pageId, {
      hasView: false,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      crashed: false,
    });
  }

  private emit(): void {
    this.options.onStateChange(this.getSnapshot());
  }
}
