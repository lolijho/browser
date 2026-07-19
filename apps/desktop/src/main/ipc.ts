import { ipcMain, type WebContents } from "electron";
import { z } from "zod";
import {
  IPC_CHANNELS,
  contentBoundsSchema,
  createPageRequestSchema,
  navigateRequestSchema,
  pageIdRequestSchema,
  setPinnedRequestSchema,
  type IpcChannel,
} from "@businessbox/contracts";
import type { BrowserController } from "./browser/browser-controller";

/**
 * Registra i canali IPC del browser. Ogni payload è validato con Zod e ogni
 * chiamata è accettata SOLO dal webContents della shell (mai dalle pagine remote,
 * che comunque non hanno preload né accesso a ipcRenderer).
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
  handle(IPC_CHANNELS.browserClosePage, pageIdRequestSchema, ({ pageId }) =>
    controller.closePage(pageId),
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
  handle(IPC_CHANNELS.browserSetPinned, setPinnedRequestSchema, ({ pageId, pinned }) =>
    controller.setPinned(pageId, pinned),
  );
  handle(IPC_CHANNELS.browserOpenDevtools, pageIdRequestSchema, ({ pageId }) =>
    controller.openDevTools(pageId),
  );
  handle(IPC_CHANNELS.layoutSetContentBounds, contentBoundsSchema, (bounds) =>
    controller.setContentBounds(bounds),
  );
}
