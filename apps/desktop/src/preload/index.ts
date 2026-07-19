import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS, type AppInfo } from "@businessbox/contracts";

/**
 * Bridge minimo e tipizzato verso il renderer.
 * Mai esporre `ipcRenderer` direttamente: ogni metodo mappa un canale
 * dell'allowlist definita in @businessbox/contracts.
 */
const bridge = {
  getAppInfo: (): Promise<AppInfo> =>
    ipcRenderer.invoke(IPC_CHANNELS.appGetInfo) as Promise<AppInfo>,
};

export type BusinessBoxBridge = typeof bridge;

contextBridge.exposeInMainWorld("businessbox", bridge);
