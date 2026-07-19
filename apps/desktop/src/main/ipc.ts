import { clipboard, ipcMain, type WebContents } from "electron";
import { z } from "zod";
import {
  IPC_CHANNELS,
  PAGE_IPC_CHANNELS,
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
  setAllowScreenshotRequestSchema,
  setKeepAliveRequestSchema,
  setPinnedRequestSchema,
  setSearchDefaultRequestSchema,
  switchWorkspaceRequestSchema,
  updateCustomEngineRequestSchema,
  type IpcChannel,
} from "@businessbox/contracts";
import type { ConfigurableSearchEngineManager } from "@businessbox/search";
import type { BrowserController } from "./browser/browser-controller";
import type { PersistenceService } from "./persistence";

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
