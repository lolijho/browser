/**
 * Allowlist dei canali IPC del desktop.
 * Ogni canale deve essere dichiarato qui e validato con Zod su entrambi i lati.
 * Non esporre mai `ipcRenderer` generico al renderer.
 */
export const IPC_CHANNELS = {
  appGetInfo: "app:get-info",
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
  browserOpenDevtools: "browser:open-devtools",
  layoutSetContentBounds: "layout:set-content-bounds",
} as const;

/** Eventi push main → renderer. */
export const IPC_EVENTS = {
  browserState: "event:browser-state",
  uiCommand: "event:ui-command",
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
export type IpcEvent = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS];

export const IPC_CHANNEL_ALLOWLIST: readonly IpcChannel[] = Object.values(IPC_CHANNELS);
export const IPC_EVENT_ALLOWLIST: readonly IpcEvent[] = Object.values(IPC_EVENTS);
