import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  IPC_EVENTS,
  type AppInfo,
  type BrowserState,
  type ContentBounds,
  type CreatePageRequest,
  type PageState,
  type SetPinnedResponse,
} from "@businessbox/contracts";

/**
 * Bridge minimo e tipizzato verso il renderer della shell.
 * Ogni metodo mappa un canale dell'allowlist di @businessbox/contracts:
 * `ipcRenderer` non è mai esposto, né esiste un invoke generico.
 */

function subscribe(eventName: string, callback: (payload: unknown) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: unknown): void => {
    callback(payload);
  };
  ipcRenderer.on(eventName, listener);
  return () => {
    ipcRenderer.removeListener(eventName, listener);
  };
}

const bridge = {
  getAppInfo: (): Promise<AppInfo> =>
    ipcRenderer.invoke(IPC_CHANNELS.appGetInfo) as Promise<AppInfo>,

  getBrowserState: (): Promise<BrowserState> =>
    ipcRenderer.invoke(IPC_CHANNELS.browserGetState, {}) as Promise<BrowserState>,

  createPage: (request: CreatePageRequest = {}): Promise<PageState> =>
    ipcRenderer.invoke(IPC_CHANNELS.browserCreatePage, request) as Promise<PageState>,

  closePage: (pageId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.browserClosePage, { pageId }) as Promise<void>,

  activatePage: (pageId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.browserActivatePage, { pageId }) as Promise<void>,

  navigate: (pageId: string, input: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.browserNavigate, { pageId, input }) as Promise<void>,

  goBack: (pageId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.browserGoBack, { pageId }) as Promise<void>,

  goForward: (pageId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.browserGoForward, { pageId }) as Promise<void>,

  reload: (pageId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.browserReload, { pageId }) as Promise<void>,

  stop: (pageId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.browserStop, { pageId }) as Promise<void>,

  setPinned: (pageId: string, pinned: boolean): Promise<SetPinnedResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.browserSetPinned, {
      pageId,
      pinned,
    }) as Promise<SetPinnedResponse>,

  openDevTools: (pageId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.browserOpenDevtools, { pageId }) as Promise<void>,

  setContentBounds: (bounds: ContentBounds): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.layoutSetContentBounds, bounds) as Promise<void>,

  onBrowserState: (callback: (payload: unknown) => void): (() => void) =>
    subscribe(IPC_EVENTS.browserState, callback),

  onUiCommand: (callback: (payload: unknown) => void): (() => void) =>
    subscribe(IPC_EVENTS.uiCommand, callback),
};

export type BusinessBoxBridge = typeof bridge;

contextBridge.exposeInMainWorld("businessbox", bridge);
