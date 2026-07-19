/**
 * Allowlist dei canali IPC del desktop.
 * Ogni canale deve essere dichiarato qui e validato con Zod su entrambi i lati.
 * Non esporre mai `ipcRenderer` generico al renderer.
 */
export const IPC_CHANNELS = {
  appGetInfo: "app:get-info",
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export const IPC_CHANNEL_ALLOWLIST: readonly IpcChannel[] = Object.values(IPC_CHANNELS);
