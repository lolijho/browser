import type {
  BrowserState,
  DeletePageResponse,
  PageCard,
  PageLifecycleState,
  SetPinnedResponse,
  WorkBox,
  Workspace,
} from "@businessbox/contracts";
import {
  DEFAULT_WORKSPACE_ID,
  INTERNAL_NEWTAB_URL,
  workspaceSessionPartition,
} from "@businessbox/shared";
import { evaluatePinRequest } from "./pin-rules";

export interface CreatePageInput {
  url?: string;
  workspaceId?: string;
  parentPageId?: string | null;
}

interface WorkspaceRecord extends Workspace {
  lastActivePageId: string | null;
}

/**
 * Stato di dominio di Smart Tabs: workspace, WorkBox e PageCard con le regole
 * deterministiche del prompt 02. Nessuna dipendenza da Electron: il
 * BrowserController riconcilia questo stato con i WebContentsView reali.
 * La persistenza su SQLite arriva con la fase 04.
 */
export class TabStore {
  private readonly workspaces = new Map<string, WorkspaceRecord>();
  private readonly workBoxes = new Map<string, WorkBox>();
  private readonly cards = new Map<string, PageCard>();
  private cardOrder: string[] = [];
  private activeWorkspaceId: string;

  constructor(private readonly now: () => string = () => new Date().toISOString()) {
    const created = this.createWorkspace("Principale", DEFAULT_WORKSPACE_ID);
    this.activeWorkspaceId = created.id;
  }

  // --- workspace ---

  createWorkspace(name: string, id: string = crypto.randomUUID()): Workspace {
    const timestamp = this.now();
    const workspace: WorkspaceRecord = {
      id,
      name,
      description: "",
      order: this.workspaces.size,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastActivePageId: null,
    };
    this.workspaces.set(id, workspace);
    return workspace;
  }

  switchWorkspace(workspaceId: string): void {
    if (!this.workspaces.has(workspaceId)) {
      throw new Error(`Workspace inesistente: ${workspaceId}`);
    }
    this.activeWorkspaceId = workspaceId;
  }

  getActiveWorkspaceId(): string {
    return this.activeWorkspaceId;
  }

  // --- workbox ---

  createWorkBox(name: string, workspaceId: string = this.activeWorkspaceId): WorkBox {
    const timestamp = this.now();
    const workBox: WorkBox = {
      id: crypto.randomUUID(),
      workspaceId,
      name,
      description: "",
      order: this.workBoxes.size,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.workBoxes.set(workBox.id, workBox);
    return workBox;
  }

  // --- pagine ---

  createPage(input: CreatePageInput = {}): PageCard {
    const workspaceId = input.workspaceId ?? this.activeWorkspaceId;
    if (!this.workspaces.has(workspaceId)) {
      throw new Error(`Workspace inesistente: ${workspaceId}`);
    }
    const timestamp = this.now();
    const card: PageCard = {
      id: crypto.randomUUID(),
      workspaceId,
      workBoxId: null,
      parentPageId: input.parentPageId ?? null,
      url: input.url ?? INTERNAL_NEWTAB_URL,
      title: "Nuova pagina",
      domain: domainOf(input.url ?? INTERNAL_NEWTAB_URL),
      state: "cold",
      pinned: false,
      keepAlive: false,
      dirtyState: false,
      archived: false,
      sessionPartition: workspaceSessionPartition(workspaceId),
      scrollPosition: null,
      faviconUrl: null,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      crashed: false,
      loadError: null,
      hasView: false,
      openedAt: timestamp,
      lastActiveAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.cards.set(card.id, card);
    this.cardOrder.push(card.id);
    return card;
  }

  /**
   * Regole 1-3 del lifecycle: la nuova pagina attivata diventa l'attiva del suo
   * workspace; la precedente resta "in alto" solo se pinned (le non pinned
   * vivono in sidebar — proiezione della top bar: attiva + pinned).
   */
  activatePage(pageId: string): PageCard {
    const card = this.mustGet(pageId);
    if (card.workspaceId !== this.activeWorkspaceId) {
      this.activeWorkspaceId = card.workspaceId;
    }
    const workspace = this.mustGetWorkspace(card.workspaceId);
    workspace.lastActivePageId = pageId;
    card.lastActiveAt = this.now();
    card.updatedAt = card.lastActiveAt;
    return card;
  }

  getActivePageId(): string | null {
    const workspace = this.mustGetWorkspace(this.activeWorkspaceId);
    const id = workspace.lastActivePageId;
    if (!id) {
      return null;
    }
    const card = this.cards.get(id);
    return card && !card.archived ? id : null;
  }

  setPinned(pageId: string, pinned: boolean, replacePageId?: string): SetPinnedResponse {
    const card = this.mustGet(pageId);
    if (!pinned) {
      card.pinned = false;
      this.touch(card);
      return { ok: true };
    }
    const pinnedIds = this.pagesOf(card.workspaceId)
      .filter((p) => p.pinned && !p.archived)
      .map((p) => p.id);

    const verdict = evaluatePinRequest(pinnedIds, pageId, true);
    if (!verdict.ok) {
      // Regola 5: la quarta pinned richiede di scegliere quale sostituire.
      if (replacePageId && pinnedIds.includes(replacePageId)) {
        const replaced = this.mustGet(replacePageId);
        replaced.pinned = false;
        this.touch(replaced);
      } else {
        return { ...verdict, needsReplacement: true, pinnedIds };
      }
    }
    card.pinned = true;
    card.archived = false;
    this.touch(card);
    return { ok: true };
  }

  /** Regola 6: chiudere dalla barra archivia la PageCard, non la elimina. */
  archivePage(pageId: string, archived: boolean): void {
    const card = this.mustGet(pageId);
    card.archived = archived;
    if (archived) {
      card.pinned = false;
      this.clearActiveIfMatches(card);
    }
    this.touch(card);
  }

  /** Regola 7: l'eliminazione definitiva è esplicita e chiede conferma se dirty. */
  deletePage(pageId: string, force = false): DeletePageResponse {
    const card = this.mustGet(pageId);
    if (card.dirtyState && !force) {
      return {
        ok: false,
        needsConfirmation: true,
        reason: "La pagina ha modifiche non salvate: confermare la chiusura definitiva.",
      };
    }
    this.clearActiveIfMatches(card);
    this.cards.delete(pageId);
    this.cardOrder = this.cardOrder.filter((id) => id !== pageId);
    return { ok: true };
  }

  movePage(pageId: string, workBoxId: string | null): void {
    const card = this.mustGet(pageId);
    if (workBoxId !== null) {
      const workBox = this.workBoxes.get(workBoxId);
      if (!workBox) {
        throw new Error(`WorkBox inesistente: ${workBoxId}`);
      }
      if (workBox.workspaceId !== card.workspaceId) {
        throw new Error("Una pagina può essere spostata solo in WorkBox del suo workspace");
      }
    }
    card.workBoxId = workBoxId;
    this.touch(card);
  }

  duplicatePage(pageId: string): PageCard {
    const source = this.mustGet(pageId);
    const copy = this.createPage({ url: source.url, workspaceId: source.workspaceId });
    copy.title = source.title;
    copy.domain = source.domain;
    copy.workBoxId = source.workBoxId;
    copy.faviconUrl = source.faviconUrl;
    return copy;
  }

  setKeepAlive(pageId: string, keepAlive: boolean): void {
    const card = this.mustGet(pageId);
    card.keepAlive = keepAlive;
    this.touch(card);
  }

  setDirty(pageId: string, dirty: boolean): void {
    const card = this.mustGet(pageId);
    if (card.dirtyState === dirty) {
      return;
    }
    card.dirtyState = dirty;
    // Dirty ⇒ keepAlive temporaneo (prompt 02); rientra quando torna pulita.
    card.keepAlive = dirty ? true : card.keepAlive;
    this.touch(card);
  }

  setScroll(pageId: string, y: number): void {
    const card = this.mustGet(pageId);
    card.scrollPosition = y;
  }

  navigationStarted(pageId: string, url: string): void {
    const card = this.mustGet(pageId);
    card.url = url;
    card.domain = domainOf(url);
    card.dirtyState = false;
    card.loadError = null;
    card.crashed = false;
    this.touch(card);
  }

  /** Aggiornamenti runtime dal controller (loading, titolo, favicon, crash…). */
  patchRuntime(
    pageId: string,
    patch: Partial<
      Pick<
        PageCard,
        | "url"
        | "title"
        | "domain"
        | "faviconUrl"
        | "isLoading"
        | "canGoBack"
        | "canGoForward"
        | "crashed"
        | "loadError"
        | "hasView"
      >
    >,
  ): void {
    const card = this.cards.get(pageId);
    if (!card) {
      return;
    }
    Object.assign(card, patch);
    if (patch.url !== undefined) {
      card.domain = domainOf(patch.url);
    }
    card.updatedAt = this.now();
  }

  setLifecycle(pageId: string, state: PageLifecycleState): void {
    const card = this.cards.get(pageId);
    if (card && card.state !== state) {
      card.state = state;
    }
  }

  /** Pagina di ripiego quando l'attiva viene archiviata/eliminata. */
  pickFallbackPageId(workspaceId: string): string | null {
    const candidates = this.pagesOf(workspaceId)
      .filter((p) => !p.archived)
      .sort((a, b) => Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt));
    return candidates[0]?.id ?? null;
  }

  getCard(pageId: string): PageCard | undefined {
    return this.cards.get(pageId);
  }

  listCards(): PageCard[] {
    return this.cardOrder
      .map((id) => this.cards.get(id))
      .filter((card): card is PageCard => card !== undefined);
  }

  pagesOf(workspaceId: string): PageCard[] {
    return this.listCards().filter((card) => card.workspaceId === workspaceId);
  }

  getSnapshot(targetUrl: string | null): Omit<BrowserState, "searchSettings"> {
    return {
      workspaces: [...this.workspaces.values()]
        .sort((a, b) => a.order - b.order)
        .map(({ lastActivePageId: _ignored, ...workspace }) => workspace),
      workBoxes: [...this.workBoxes.values()].sort((a, b) => a.order - b.order),
      pages: this.listCards(),
      activeWorkspaceId: this.activeWorkspaceId,
      activePageId: this.getActivePageId(),
      targetUrl,
    };
  }

  // --- internals ---

  private clearActiveIfMatches(card: PageCard): void {
    const workspace = this.mustGetWorkspace(card.workspaceId);
    if (workspace.lastActivePageId === card.id) {
      workspace.lastActivePageId = null;
    }
  }

  private touch(card: PageCard): void {
    card.updatedAt = this.now();
  }

  private mustGet(pageId: string): PageCard {
    const card = this.cards.get(pageId);
    if (!card) {
      throw new Error(`Pagina inesistente: ${pageId}`);
    }
    return card;
  }

  private mustGetWorkspace(workspaceId: string): WorkspaceRecord {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace inesistente: ${workspaceId}`);
    }
    return workspace;
  }
}

function domainOf(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.hostname : "";
  } catch {
    return "";
  }
}
