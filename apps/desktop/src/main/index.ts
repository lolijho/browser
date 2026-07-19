import { join } from "node:path";
import { BrowserWindow, Menu, app, ipcMain, session, type Session } from "electron";
import { IPC_CHANNELS, IPC_EVENTS, type UiCommand } from "@businessbox/contracts";
import { BRANDING } from "@businessbox/shared";
import { StaticSearchEngineManager } from "@businessbox/search";
import { buildAppInfo } from "./app-info";
import { BrowserController } from "./browser/browser-controller";
import { WorkspaceSessionManager } from "./browser/workspace-session-manager";
import { registerBrowserIpc } from "./ipc";
import { buildApplicationMenu } from "./menu";

// Sicurezza obbligatoria (CLAUDE.md): sandbox globale per tutti i renderer.
app.enableSandbox();

/** Crea la sessione di un workspace con permessi deny-by-default. */
function createWorkspaceSession(partition: string): Session {
  const workspaceSession = session.fromPartition(partition);
  workspaceSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  workspaceSession.setPermissionCheckHandler(() => false);
  return workspaceSession;
}

function createMainWindow(): void {
  const window = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 620,
    title: BRANDING.productName,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const shell = window.webContents;

  // La shell stessa non deve mai aprire finestre né navigare altrove.
  shell.setWindowOpenHandler(() => ({ action: "deny" }));
  shell.on("will-navigate", (event) => event.preventDefault());

  const sessions = new WorkspaceSessionManager<Session>(createWorkspaceSession);
  const searchManager = new StaticSearchEngineManager();

  const controller = new BrowserController({
    window,
    sessions,
    searchManager,
    onStateChange: (snapshot) => {
      if (!shell.isDestroyed()) {
        shell.send(IPC_EVENTS.browserState, snapshot);
      }
    },
  });

  registerBrowserIpc(controller, shell);

  const sendUiCommand = (command: UiCommand["command"]): void => {
    if (!shell.isDestroyed()) {
      shell.send(IPC_EVENTS.uiCommand, { command } satisfies UiCommand);
    }
  };

  const withActivePage = (action: (pageId: string) => void): void => {
    const activeId = controller.getActivePageId();
    if (activeId) {
      action(activeId);
    }
  };

  Menu.setApplicationMenu(
    buildApplicationMenu({
      newPage: () => controller.createPage(),
      reloadActive: () => withActivePage((id) => controller.reload(id)),
      goBack: () => withActivePage((id) => controller.goBack(id)),
      goForward: () => withActivePage((id) => controller.goForward(id)),
      focusOmnibox: () => {
        shell.focus();
        sendUiCommand("focus-omnibox");
      },
      toggleSidebar: () => sendUiCommand("toggle-sidebar"),
      toggleAiPanel: () => sendUiCommand("toggle-ai-panel"),
      openActivePageDevTools: () => withActivePage((id) => controller.openDevTools(id)),
    }),
  );

  window.once("ready-to-show", () => {
    window.show();
    // La shell parte con una newtab interna già attiva.
    controller.createPage();
  });

  const devServerUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

void app.whenReady().then(() => {
  // Deny-by-default anche per la sessione della shell.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => {
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

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
