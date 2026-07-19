import { clipboard, ipcMain, type WebContents } from "electron";
import { z } from "zod";
import {
  IPC_CHANNELS,
  PAGE_IPC_CHANNELS,
  archivePageRequestSchema,
  contentBoundsSchema,
  copyTextRequestSchema,
  createPageRequestSchema,
  createWorkBoxRequestSchema,
  createWorkspaceRequestSchema,
  deletePageRequestSchema,
  movePageRequestSchema,
  navigateRequestSchema,
  pageDirtyEventSchema,
  pageIdRequestSchema,
  pageScrollEventSchema,
  setKeepAliveRequestSchema,
  setPinnedRequestSchema,
  switchWorkspaceRequestSchema,
  type IpcChannel,
} from "@businessbox/contracts";
import type { BrowserController } from "./browser/browser-controller";

/**
 * Registra i canali IPC del browser. Ogni payload è validato con Zod e ogni
 * chiamata è accettata SOLO dal webContents della shell. I canali delle pagine
 * remote (dirty/scroll) sono autenticati tramite l'id del webContents mittente.
 */
export function registerBrowserIpc(controller: BrowserController, shell: WebContents): void {
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
  handle(IPC_CHANNELS.browserNavigate, navigateRequestSchema, ({ pageId, input }) =>
    controller.navigate(pageId, input),
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
}
