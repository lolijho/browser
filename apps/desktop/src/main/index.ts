import { join } from "node:path";
import { BrowserWindow, app, ipcMain, session, shell } from "electron";
import { IPC_CHANNELS } from "@businessbox/contracts";
import { BRANDING } from "@businessbox/shared";
import { buildAppInfo } from "./app-info";

// Sicurezza obbligatoria (CLAUDE.md): sandbox globale per tutti i renderer.
app.enableSandbox();

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: BRANDING.productName,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window.show());

  // Nessuna finestra arbitraria: i link esterni HTTPS vanno al browser di sistema.
  // Dalla fase 01 i popup diventeranno nuove PageCard gestite dal browser controller.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  const devServerUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

void app.whenReady().then(() => {
  // Permessi deny-by-default: la gestione granulare per dominio/workspace arriva nella fase 07.
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  ipcMain.handle(IPC_CHANNELS.appGetInfo, () =>
    buildAppInfo({
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron ?? "unknown",
      chromeVersion: process.versions.chrome ?? "unknown",
      nodeVersion: process.versions.node ?? "unknown",
    }),
  );

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
