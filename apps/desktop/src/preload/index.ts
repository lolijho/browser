import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  IPC_EVENTS,
  type AddCustomEngineRequest,
  type AiChatStartRequest,
  type AiChatStartResponse,
  type AiContextResponse,
  type AiPageContextResponse,
  type AuthResult,
  type AuthStatus,
  type AppInfo,
  type BrowserState,
  type ContentBounds,
  type CreatePageRequest,
  type DeletePageResponse,
  type EngineMutationResponse,
  type ExportSearchSettingsResponse,
  type LocalSearchRequest,
  type LocalSearchResponse,
  type PageCard,
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

  createPage: (request: CreatePageRequest = {}): Promise<PageCard> =>
    ipcRenderer.invoke(IPC_CHANNELS.browserCreatePage, request) as Promise<PageCard>,

  closePage: (pageId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.browserClosePage, { pageId }) as Promise<void>,

  activatePage: (pageId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.browserActivatePage, { pageId }) as Promise<void>,

  navigate: (pageId: string, input: string, engineId?: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.browserNavigate, {
      pageId,
      input,
      engineId,
    }) as Promise<void>,

  goBack: (pageId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.browserGoBack, { pageId }) as Promise<void>,

  goForward: (pageId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.browserGoForward, { pageId }) as Promise<void>,

  reload: (pageId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.browserReload, { pageId }) as Promise<void>,

  stop: (pageId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.browserStop, { pageId }) as Promise<void>,

  setPinned: (
    pageId: string,
    pinned: boolean,
    replacePageId?: string,
  ): Promise<SetPinnedResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.browserSetPinned, {
      pageId,
      pinned,
      replacePageId,
    }) as Promise<SetPinnedResponse>,

  archivePage: (pageId: string, archived: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.browserArchivePage, { pageId, archived }) as Promise<void>,

  deletePage: (pageId: string, force?: boolean): Promise<DeletePageResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.browserDeletePage, {
      pageId,
      force,
    }) as Promise<DeletePageResponse>,

  movePage: (pageId: string, workBoxId: string | null): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.browserMovePage, { pageId, workBoxId }) as Promise<void>,

  duplicatePage: (pageId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.browserDuplicatePage, { pageId }) as Promise<void>,

  setKeepAlive: (pageId: string, keepAlive: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.browserSetKeepAlive, { pageId, keepAlive }) as Promise<void>,

  createWorkspace: (name: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.workspaceCreate, { name }) as Promise<void>,

  switchWorkspace: (workspaceId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.workspaceSwitch, { workspaceId }) as Promise<void>,

  createWorkBox: (name: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.workboxCreate, { name }) as Promise<void>,

  copyText: (text: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.appCopyText, { text }) as Promise<void>,

  setSearchDefault: (
    engineId: string,
    scope: "global" | "workspace" | "private",
    workspaceId?: string,
  ): Promise<EngineMutationResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.searchSetDefault, {
      engineId,
      scope,
      workspaceId,
    }) as Promise<EngineMutationResponse>,

  clearWorkspaceSearchDefault: (workspaceId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.searchClearWorkspaceDefault, { workspaceId }) as Promise<void>,

  addCustomEngine: (request: AddCustomEngineRequest): Promise<EngineMutationResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.searchAddCustom, request) as Promise<EngineMutationResponse>,

  removeEngine: (engineId: string): Promise<EngineMutationResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.searchRemoveEngine, {
      engineId,
    }) as Promise<EngineMutationResponse>,

  exportSearchSettings: (): Promise<ExportSearchSettingsResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.searchExport, {}) as Promise<ExportSearchSettingsResponse>,

  importSearchSettings: (json: string): Promise<EngineMutationResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.searchImport, { json }) as Promise<EngineMutationResponse>,

  decideOpenSearch: (proposalId: string, accept: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.searchOpenSearchDecision, {
      proposalId,
      accept,
    }) as Promise<void>,

  searchLocal: (request: LocalSearchRequest): Promise<LocalSearchResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.searchLocal, request) as Promise<LocalSearchResponse>,

  setAllowScreenshot: (pageId: string, allow: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.browserSetAllowScreenshot, {
      pageId,
      allow,
    }) as Promise<void>,

  deleteScreenshot: (pageId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.browserDeleteScreenshot, { pageId }) as Promise<void>,

  setAllowAi: (pageId: string, allow: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.browserSetAllowAi, { pageId, allow }) as Promise<void>,

  aiGetPageContext: (pageId: string): Promise<AiPageContextResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.aiGetPageContext, {
      pageId,
    }) as Promise<AiPageContextResponse>,

  onOpenSearchProposal: (callback: (payload: unknown) => void): (() => void) =>
    subscribe(IPC_EVENTS.openSearchProposal, callback),

  openDevTools: (pageId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.browserOpenDevtools, { pageId }) as Promise<void>,

  setContentBounds: (bounds: ContentBounds): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.layoutSetContentBounds, bounds) as Promise<void>,

  // --- Contesto AI multi-fonte (M6) ---

  aiGetContext: (pageIds: string[]): Promise<AiContextResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.aiGetContext, { pageIds }) as Promise<AiContextResponse>,

  aiGetWorkBoxContext: (workBoxId: string): Promise<AiContextResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.aiGetWorkBoxContext, {
      workBoxId,
    }) as Promise<AiContextResponse>,

  /** Avvia una chat AI: il token resta nel main, qui tornano solo i chunk. */
  aiChatStart: (request: AiChatStartRequest): Promise<AiChatStartResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.aiChatStart, request) as Promise<AiChatStartResponse>,

  aiChatCancel: (runId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.aiChatCancel, { runId }) as Promise<void>,

  onAiChatChunk: (callback: (payload: unknown) => void): (() => void) =>
    subscribe(IPC_EVENTS.aiChatChunk, callback),

  // --- Autenticazione (nessun token attraversa questo bridge) ---

  authGetStatus: (): Promise<AuthStatus> =>
    ipcRenderer.invoke(IPC_CHANNELS.authGetStatus, {}) as Promise<AuthStatus>,

  authLogin: (email: string, password: string): Promise<AuthResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.authLogin, { email, password }) as Promise<AuthResult>,

  authRegister: (email: string, password: string): Promise<AuthResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.authRegister, { email, password }) as Promise<AuthResult>,

  authLogout: (): Promise<AuthStatus> =>
    ipcRenderer.invoke(IPC_CHANNELS.authLogout, {}) as Promise<AuthStatus>,

  onAuthState: (callback: (payload: unknown) => void): (() => void) =>
    subscribe(IPC_EVENTS.authState, callback),

  onBrowserState: (callback: (payload: unknown) => void): (() => void) =>
    subscribe(IPC_EVENTS.browserState, callback),

  onUiCommand: (callback: (payload: unknown) => void): (() => void) =>
    subscribe(IPC_EVENTS.uiCommand, callback),
};

export type BusinessBoxBridge = typeof bridge;

contextBridge.exposeInMainWorld("businessbox", bridge);
