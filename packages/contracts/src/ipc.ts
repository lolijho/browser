/**
 * Allowlist dei canali IPC del desktop.
 * Ogni canale deve essere dichiarato qui e validato con Zod su entrambi i lati.
 * Non esporre mai `ipcRenderer` generico al renderer.
 */
export const IPC_CHANNELS = {
  appGetInfo: "app:get-info",
  appCopyText: "app:copy-text",
  browserGetState: "browser:get-state",
  browserCreatePage: "browser:create-page",
  browserClosePage: "browser:close-page",
  browserActivatePage: "browser:activate-page",
  browserNavigate: "browser:navigate",
  browserGoBack: "browser:go-back",
  browserGoForward: "browser:go-forward",
  browserReload: "browser:reload",
  browserStop: "browser:stop",
  browserSetPinned: "browser:set-pinned",
  browserArchivePage: "browser:archive-page",
  browserDeletePage: "browser:delete-page",
  browserMovePage: "browser:move-page",
  browserDuplicatePage: "browser:duplicate-page",
  browserSetKeepAlive: "browser:set-keep-alive",
  browserOpenDevtools: "browser:open-devtools",
  workspaceCreate: "workspace:create",
  workspaceSwitch: "workspace:switch",
  workboxCreate: "workbox:create",
  searchSetDefault: "search:set-default",
  searchClearWorkspaceDefault: "search:clear-workspace-default",
  searchAddCustom: "search:add-custom",
  searchUpdateCustom: "search:update-custom",
  searchRemoveEngine: "search:remove-engine",
  searchExport: "search:export",
  searchImport: "search:import",
  searchOpenSearchDecision: "search:opensearch-decision",
  searchLocal: "search:local",
  browserSetAllowScreenshot: "browser:set-allow-screenshot",
  browserDeleteScreenshot: "browser:delete-screenshot",
  layoutSetContentBounds: "layout:set-content-bounds",
} as const;

/** Eventi push main → renderer. */
export const IPC_EVENTS = {
  browserState: "event:browser-state",
  uiCommand: "event:ui-command",
  openSearchProposal: "event:opensearch-proposal",
} as const;

/**
 * Canali usati dal preload delle pagine remote (page → main).
 * Sono unidirezionali (send) e il main accetta solo mittenti registrati.
 */
export const PAGE_IPC_CHANNELS = {
  dirtyChanged: "page:dirty-changed",
  scrollChanged: "page:scroll-changed",
  /** main → page: ripristina la posizione di scroll dopo un restore da cold. */
  restoreScroll: "page:restore-scroll",
  /** page → main: trovato un link OpenSearch nella pagina. */
  openSearchDetected: "page:opensearch-detected",
  /** page → main: contenuto estratto (Readability) pronto. */
  snapshotExtracted: "page:snapshot-extracted",
  /** main → page: richiedi una nuova estrazione (navigazione SPA). */
  requestExtract: "page:request-extract",
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
export type IpcEvent = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS];
export type PageIpcChannel = (typeof PAGE_IPC_CHANNELS)[keyof typeof PAGE_IPC_CHANNELS];

export const IPC_CHANNEL_ALLOWLIST: readonly IpcChannel[] = Object.values(IPC_CHANNELS);
export const IPC_EVENT_ALLOWLIST: readonly IpcEvent[] = Object.values(IPC_EVENTS);
export const PAGE_IPC_CHANNEL_ALLOWLIST: readonly PageIpcChannel[] =
  Object.values(PAGE_IPC_CHANNELS);
