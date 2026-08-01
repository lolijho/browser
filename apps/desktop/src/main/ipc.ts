import { randomUUID } from "node:crypto";
import { clipboard, ipcMain, type WebContents } from "electron";
import { z } from "zod";
import {
  IPC_CHANNELS,
  IPC_EVENTS,
  PAGE_IPC_CHANNELS,
  aiChatCancelRequestSchema,
  aiChatStartRequestSchema,
  aiContextRequestSchema,
  aiWorkBoxContextRequestSchema,
  addCustomEngineRequestSchema,
  archivePageRequestSchema,
  clearWorkspaceDefaultRequestSchema,
  contentBoundsSchema,
  copyTextRequestSchema,
  createPageRequestSchema,
  createWorkBoxRequestSchema,
  createWorkspaceRequestSchema,
  deletePageRequestSchema,
  extractedContentSchema,
  importSearchSettingsRequestSchema,
  localSearchRequestSchema,
  movePageRequestSchema,
  navigateRequestSchema,
  openSearchDecisionRequestSchema,
  openSearchDetectedEventSchema,
  pageDirtyEventSchema,
  pageIdRequestSchema,
  pageScrollEventSchema,
  removeEngineRequestSchema,
  setAllowAiRequestSchema,
  setAllowScreenshotRequestSchema,
  setKeepAliveRequestSchema,
  setPinnedRequestSchema,
  setSearchDefaultRequestSchema,
  switchWorkspaceRequestSchema,
  updateCustomEngineRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  type AiContextResponse,
  type AiPageContextResponse,
  type AiSourcePayload,
  type AuthResult,
  type AuthStatus,
  type IpcChannel,
} from "@businessbox/contracts";
import { sanitizeContentForAI } from "@businessbox/ai";
import type { ConfigurableSearchEngineManager } from "@businessbox/search";
import type { BrowserController } from "./browser/browser-controller";
import type { PersistenceService } from "./persistence";
import type { AuthManager } from "./auth/auth-manager";
import type { AiClient } from "./ai/ai-client";

/** Servizi che richiedono rete/credenziali, iniettati per restare testabili. */
export interface BrowserIpcServices {
  auth: AuthManager;
  ai: AiClient;
}

/** Deve combaciare con `aiSourceSchema.max(8)` lato API. */
const MAX_AI_SOURCES = 8;

type ExclusionReason = AiContextResponse["excluded"][number]["reason"];

/**
 * Normalizza l'esito di login/registrazione. Gli errori diventano un risultato
 * tipizzato invece di un'eccezione IPC: la UI deve poter mostrare il motivo
 * senza che il messaggio attraversi il canale come stack trace.
 */
async function runAuth(action: () => Promise<AuthStatus>): Promise<AuthResult> {
  try {
    return { ok: true, status: await action() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Registra i canali IPC del browser. Ogni payload è validato con Zod e ogni
 * chiamata è accettata SOLO dal webContents della shell. I canali delle pagine
 * remote (dirty/scroll) sono autenticati tramite l'id del webContents mittente.
 */
export function registerBrowserIpc(
  controller: BrowserController,
  searchManager: ConfigurableSearchEngineManager,
  persistence: PersistenceService,
  shell: WebContents,
  services: BrowserIpcServices,
): void {
  function handle<TSchema extends z.ZodType>(
    channel: IpcChannel,
    schema: TSchema,
    handler: (payload: z.output<TSchema>) => unknown,
  ): void {
    ipcMain.handle(channel, (event, rawPayload: unknown) => {
      if (event.sender !== shell) {
        throw new Error(`Canale ${channel} rifiutato: mittente non autorizzato`);
      }
      return handler(schema.parse(rawPayload ?? {}));
    });
  }

  handle(IPC_CHANNELS.browserGetState, z.object({}), () => controller.getSnapshot());
  handle(IPC_CHANNELS.browserCreatePage, createPageRequestSchema, (payload) =>
    controller.createPage(payload),
  );
  // "Chiudere" dalla barra = archiviare (regola 6); l'eliminazione è browserDeletePage.
  handle(IPC_CHANNELS.browserClosePage, pageIdRequestSchema, ({ pageId }) =>
    controller.archivePage(pageId, true),
  );
  handle(IPC_CHANNELS.browserActivatePage, pageIdRequestSchema, ({ pageId }) =>
    controller.activatePage(pageId),
  );
  handle(IPC_CHANNELS.browserNavigate, navigateRequestSchema, ({ pageId, input, engineId }) =>
    controller.navigate(pageId, input, engineId),
  );
  handle(IPC_CHANNELS.browserGoBack, pageIdRequestSchema, ({ pageId }) =>
    controller.goBack(pageId),
  );
  handle(IPC_CHANNELS.browserGoForward, pageIdRequestSchema, ({ pageId }) =>
    controller.goForward(pageId),
  );
  handle(IPC_CHANNELS.browserReload, pageIdRequestSchema, ({ pageId }) =>
    controller.reload(pageId),
  );
  handle(IPC_CHANNELS.browserStop, pageIdRequestSchema, ({ pageId }) => controller.stop(pageId));
  handle(
    IPC_CHANNELS.browserSetPinned,
    setPinnedRequestSchema,
    ({ pageId, pinned, replacePageId }) => controller.setPinned(pageId, pinned, replacePageId),
  );
  handle(IPC_CHANNELS.browserArchivePage, archivePageRequestSchema, ({ pageId, archived }) =>
    controller.archivePage(pageId, archived),
  );
  handle(IPC_CHANNELS.browserDeletePage, deletePageRequestSchema, ({ pageId, force }) =>
    controller.deletePage(pageId, force ?? false),
  );
  handle(IPC_CHANNELS.browserMovePage, movePageRequestSchema, ({ pageId, workBoxId }) =>
    controller.movePage(pageId, workBoxId),
  );
  handle(IPC_CHANNELS.browserDuplicatePage, pageIdRequestSchema, ({ pageId }) =>
    controller.duplicatePage(pageId),
  );
  handle(IPC_CHANNELS.browserSetKeepAlive, setKeepAliveRequestSchema, ({ pageId, keepAlive }) =>
    controller.setKeepAlive(pageId, keepAlive),
  );
  handle(IPC_CHANNELS.browserOpenDevtools, pageIdRequestSchema, ({ pageId }) =>
    controller.openDevTools(pageId),
  );
  handle(IPC_CHANNELS.workspaceCreate, createWorkspaceRequestSchema, ({ name }) =>
    controller.createWorkspace(name),
  );
  handle(IPC_CHANNELS.workspaceSwitch, switchWorkspaceRequestSchema, ({ workspaceId }) =>
    controller.switchWorkspace(workspaceId),
  );
  handle(IPC_CHANNELS.workboxCreate, createWorkBoxRequestSchema, ({ name }) =>
    controller.createWorkBox(name),
  );
  handle(IPC_CHANNELS.appCopyText, copyTextRequestSchema, ({ text }) => clipboard.writeText(text));

  // --- motori di ricerca (fase 03) ---
  handle(
    IPC_CHANNELS.searchSetDefault,
    setSearchDefaultRequestSchema,
    ({ engineId, scope, workspaceId }) => {
      const result = searchManager.setDefault(scope, engineId, workspaceId);
      controller.emitState();
      return { ok: result.ok, ...(result.reason ? { reason: result.reason } : {}) };
    },
  );
  handle(
    IPC_CHANNELS.searchClearWorkspaceDefault,
    clearWorkspaceDefaultRequestSchema,
    ({ workspaceId }) => {
      searchManager.clearWorkspaceDefault(workspaceId);
      controller.emitState();
    },
  );
  handle(IPC_CHANNELS.searchAddCustom, addCustomEngineRequestSchema, (payload) => {
    const result = searchManager.addCustomEngine(payload);
    controller.emitState();
    return { ok: result.ok, ...(result.reason ? { reason: result.reason } : {}) };
  });
  handle(
    IPC_CHANNELS.searchUpdateCustom,
    updateCustomEngineRequestSchema,
    ({ engineId, patch }) => {
      const result = searchManager.updateCustomEngine(engineId, patch);
      controller.emitState();
      return { ok: result.ok, ...(result.reason ? { reason: result.reason } : {}) };
    },
  );
  handle(IPC_CHANNELS.searchRemoveEngine, removeEngineRequestSchema, ({ engineId }) => {
    const result = searchManager.removeEngine(engineId);
    controller.emitState();
    return { ok: result.ok, ...(result.reason ? { reason: result.reason } : {}) };
  });
  handle(IPC_CHANNELS.searchExport, z.object({}), () => ({
    json: searchManager.exportSettings(),
  }));
  handle(IPC_CHANNELS.searchImport, importSearchSettingsRequestSchema, ({ json }) => {
    const result = searchManager.importSettings(json);
    controller.emitState();
    return { ok: result.ok, ...(result.reason ? { reason: result.reason } : {}) };
  });
  handle(IPC_CHANNELS.searchOpenSearchDecision, openSearchDecisionRequestSchema, (payload) =>
    controller.decideOpenSearch(payload.proposalId, payload.accept),
  );
  handle(IPC_CHANNELS.searchLocal, localSearchRequestSchema, (request) => ({
    results: persistence.searchLocal(request),
  }));
  handle(
    IPC_CHANNELS.browserSetAllowScreenshot,
    setAllowScreenshotRequestSchema,
    ({ pageId, allow }) => controller.setAllowScreenshot(pageId, allow),
  );
  handle(IPC_CHANNELS.browserDeleteScreenshot, pageIdRequestSchema, ({ pageId }) =>
    controller.deleteScreenshot(pageId),
  );
  handle(IPC_CHANNELS.browserSetAllowAi, setAllowAiRequestSchema, ({ pageId, allow }) =>
    controller.setAllowAI(pageId, allow),
  );
  /**
   * Costruisce la fonte AI di una pagina. Punto unico in cui il contenuto esce
   * dal main verso l'AI: qui si applicano SEMPRE `allowAI` e la sanitizzazione.
   */
  function buildSource(pageId: string): { source: AiSourcePayload } | { reason: ExclusionReason } {
    const card = controller.getPageCard(pageId);
    if (!card || !card.allowAI) {
      return { reason: "ai-disabilitata" };
    }
    const snapshot = persistence.getSnapshotText(pageId);
    if (!snapshot) {
      return { reason: "nessun-contenuto" };
    }
    return {
      source: {
        id: pageId,
        title: sanitizeContentForAI(snapshot.title).slice(0, 300),
        url: snapshot.url.slice(0, 2048),
        text: sanitizeContentForAI(snapshot.text).slice(0, 60_000),
      },
    };
  }

  /** Contesto multi-fonte con motivo di esclusione esplicito (M6). */
  function buildContext(pageIds: readonly string[]): AiContextResponse {
    const sources: AiSourcePayload[] = [];
    const excluded: AiContextResponse["excluded"] = [];
    for (const pageId of pageIds) {
      if (sources.length >= MAX_AI_SOURCES) {
        excluded.push({ pageId, reason: "limite-fonti" });
        continue;
      }
      const built = buildSource(pageId);
      if ("source" in built) {
        sources.push(built.source);
      } else {
        excluded.push({ pageId, reason: built.reason });
      }
    }
    return { sources, excluded };
  }

  // Contesto AI mono-pagina (compatibilità): rispetta allowAI e sanitizza.
  handle(
    IPC_CHANNELS.aiGetPageContext,
    pageIdRequestSchema,
    ({ pageId }): AiPageContextResponse => {
      const card = controller.getPageCard(pageId);
      if (!card || !card.allowAI) {
        return { allowAI: false, source: null };
      }
      const built = buildSource(pageId);
      return { allowAI: true, source: "source" in built ? built.source : null };
    },
  );

  handle(IPC_CHANNELS.aiGetContext, aiContextRequestSchema, ({ pageIds }): AiContextResponse =>
    buildContext(pageIds),
  );

  handle(
    IPC_CHANNELS.aiGetWorkBoxContext,
    aiWorkBoxContextRequestSchema,
    ({ workBoxId }): AiContextResponse =>
      buildContext(
        controller
          .getSnapshot()
          .pages.filter((page) => page.workBoxId === workBoxId && !page.archived)
          .map((page) => page.id),
      ),
  );

  /**
   * Chat AI. La richiesta HTTP parte dal main perché deve allegare l'access
   * token: il renderer non lo vede mai. I chunk tornano come eventi correlati
   * da `runId`, così più run concorrenti non si mescolano.
   */
  const activeRuns = new Map<string, AbortController>();

  handle(IPC_CHANNELS.aiChatStart, aiChatStartRequestSchema, async (request) => {
    const { sources, excluded } = buildContext(request.pageIds);
    const runId = randomUUID();
    const abort = new AbortController();
    activeRuns.set(runId, abort);

    void (async () => {
      try {
        for await (const chunk of services.ai.streamChat({
          messages: request.messages,
          sources,
          ...(request.reasoningEffort ? { reasoningEffort: request.reasoningEffort } : {}),
          signal: abort.signal,
        })) {
          if (shell.isDestroyed()) {
            break;
          }
          shell.send(IPC_EVENTS.aiChatChunk, { runId, chunk });
        }
      } finally {
        activeRuns.delete(runId);
      }
    })();

    return { runId, sources, excluded };
  });

  handle(IPC_CHANNELS.aiChatCancel, aiChatCancelRequestSchema, ({ runId }) => {
    activeRuns.get(runId)?.abort();
    activeRuns.delete(runId);
  });

  // --- Autenticazione: i token restano nel main, il renderer vede solo lo stato ---

  handle(IPC_CHANNELS.authGetStatus, z.object({}).optional(), () => services.auth.getStatus());

  handle(IPC_CHANNELS.authLogin, loginRequestSchema, async ({ email, password }) =>
    runAuth(() => services.auth.login(email, password)),
  );

  handle(IPC_CHANNELS.authRegister, registerRequestSchema, async ({ email, password }) =>
    runAuth(() => services.auth.register(email, password)),
  );

  handle(IPC_CHANNELS.authLogout, z.object({}).optional(), () => services.auth.logout());

  services.auth.onChange((status) => {
    if (!shell.isDestroyed()) {
      shell.send(IPC_EVENTS.authState, status);
    }
  });
  handle(IPC_CHANNELS.layoutSetContentBounds, contentBoundsSchema, (bounds) =>
    controller.setContentBounds(bounds),
  );

  // Canali dal preload delle pagine remote: send unidirezionale, mittente mappato
  // dal controller (webContents id → pageId), payload validato.
  ipcMain.on(PAGE_IPC_CHANNELS.dirtyChanged, (event, rawPayload: unknown) => {
    const parsed = pageDirtyEventSchema.safeParse(rawPayload);
    if (parsed.success) {
      controller.handlePageDirtyEvent(event.sender.id, parsed.data.dirty);
    }
  });
  ipcMain.on(PAGE_IPC_CHANNELS.scrollChanged, (event, rawPayload: unknown) => {
    const parsed = pageScrollEventSchema.safeParse(rawPayload);
    if (parsed.success) {
      controller.handlePageScrollEvent(event.sender.id, parsed.data.y);
    }
  });
  ipcMain.on(PAGE_IPC_CHANNELS.openSearchDetected, (event, rawPayload: unknown) => {
    const parsed = openSearchDetectedEventSchema.safeParse(rawPayload);
    if (parsed.success) {
      controller.handleOpenSearchDetected(event.sender.id, parsed.data.href, parsed.data.title);
    }
  });
  ipcMain.on(PAGE_IPC_CHANNELS.snapshotExtracted, (event, rawPayload: unknown) => {
    const parsed = extractedContentSchema.safeParse(rawPayload);
    if (parsed.success) {
      controller.handleSnapshotExtracted(event.sender.id, parsed.data);
    }
  });
}
