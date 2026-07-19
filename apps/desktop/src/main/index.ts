import { join } from "node:path";
import { existsSync } from "node:fs";
import { BrowserWindow, Menu, app, ipcMain, session, type Session } from "electron";
import { IPC_CHANNELS, IPC_EVENTS, type UiCommand } from "@businessbox/contracts";
import { WORKSPACE_SESSION_PREFIX, BRANDING } from "@businessbox/shared";
import { ConfigurableSearchEngineManager } from "@businessbox/search";
import { buildAppInfo } from "./app-info";
import { BrowserController } from "./browser/browser-controller";
import { TabStore } from "./browser/tab-store";
import { WorkspaceSessionManager } from "./browser/workspace-session-manager";
import { registerBrowserIpc } from "./ipc";
import { buildApplicationMenu } from "./menu";
import { PersistenceService } from "./persistence";
import { PermissionManager, type PermissionKind } from "./security/permission-manager";
import { isRiskyDownload, sanitizeFilename, uniqueFilename } from "./security/download-safety";

// Sicurezza obbligatoria (CLAUDE.md): sandbox globale per tutti i renderer.
app.enableSandbox();

/** Permessi browser (fase 07): deny-by-default, decisi per dominio+workspace. */
const permissionManager = new PermissionManager();

/** Mappa i nomi permesso di Electron ai nostri PermissionKind sorvegliati. */
function toPermissionKind(electronPermission: string): PermissionKind | null {
  const map: Record<string, PermissionKind> = {
    media: "camera",
    audioCapture: "microphone",
    videoCapture: "camera",
    geolocation: "geolocation",
    notifications: "notifications",
    midi: "midi",
    midiSysex: "midi",
    "clipboard-read": "clipboard-read",
    "display-capture": "display-capture",
  };
  return map[electronPermission] ?? null;
}

/**
 * Crea la sessione di un workspace con permessi deny-by-default.
 * Un permesso è concesso solo se l'utente lo ha esplicitamente approvato per
 * quel (dominio, workspace); ogni altro caso è negato. I download passano dal
 * controllo di sicurezza (estensioni rischiose, nomi sanitizzati).
 */
function createWorkspaceSession(partition: string): Session {
  const workspaceSession = session.fromPartition(partition);
  const workspaceId = partition.startsWith(WORKSPACE_SESSION_PREFIX)
    ? partition.slice(WORKSPACE_SESSION_PREFIX.length)
    : partition;

  workspaceSession.setPermissionRequestHandler((_wc, permission, callback, details) => {
    const kind = toPermissionKind(permission);
    const requestingUrl = details?.requestingUrl ?? "";
    if (!kind) {
      callback(false);
      return;
    }
    // Deny-by-default: concesso solo se già approvato per dominio+workspace.
    callback(permissionManager.check(workspaceId, requestingUrl, kind) === "granted");
  });
  workspaceSession.setPermissionCheckHandler((_wc, permission, origin) => {
    const kind = toPermissionKind(permission);
    return kind !== null && permissionManager.check(workspaceId, origin, kind) === "granted";
  });

  workspaceSession.on("will-download", (_event, item) => {
    const safeName = uniqueFilename(sanitizeFilename(item.getFilename()), (name) =>
      existsSync(join(app.getPath("downloads"), name)),
    );
    item.setSavePath(join(app.getPath("downloads"), safeName));
    if (isRiskyDownload(safeName)) {
      // Nessuna esecuzione automatica: il file viene solo salvato; la conferma
      // esplicita per le estensioni rischiose è gestita dalla UI di download.
      console.warn(`[download] estensione rischiosa: ${safeName} (nessuna esecuzione automatica)`);
    }
  });

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
  const searchManager = new ConfigurableSearchEngineManager();

  // --- persistenza locale (fase 04): carica prima di creare il controller ---
  const persistence = new PersistenceService(app.getPath("userData"));
  if (persistence.recoveredFromCorruption) {
    console.warn(
      "[db] database locale corrotto: messo in quarantena (.corrupt-*) e ricreato vuoto.",
    );
  }
  const store = new TabStore();
  const loaded = persistence.load();
  store.hydrate({
    workspaces: loaded.workspaces,
    workBoxes: loaded.workBoxes,
    cards: loaded.cards,
    session: loaded.session,
  });
  if (loaded.searchSettingsJson) {
    searchManager.importSettings(loaded.searchSettingsJson);
  }

  const controller = new BrowserController({
    window,
    sessions,
    searchManager,
    store,
    onStateChange: (snapshot) => {
      if (!shell.isDestroyed()) {
        shell.send(IPC_EVENTS.browserState, snapshot);
      }
      persistence.scheduleSave(snapshot, store.getSessionState());
    },
    onOpenSearchProposal: (proposal) => {
      if (!shell.isDestroyed()) {
        shell.send(IPC_EVENTS.openSearchProposal, proposal);
      }
    },
    onNavigationCommitted: (pageId, url, title) => persistence.recordNavigation(pageId, url, title),
    onSnapshotExtracted: (pageId, extracted, meta) =>
      persistence.storeExtracted(pageId, extracted, meta),
    screenshotsEnabled: () => persistence.screenshotsEnabled(),
    onScreenshotCaptured: (pageId, png) => persistence.saveScreenshot(pageId, png),
    onScreenshotDeleted: (pageId) => persistence.deleteScreenshot(pageId),
  });

  registerBrowserIpc(controller, searchManager, persistence, shell);

  app.on("will-quit", () => {
    controller.dispose();
    persistence.close();
  });

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

  controller.start();
  window.on("closed", () => controller.dispose());

  window.once("ready-to-show", () => {
    window.show();
    // Ripristina la sessione precedente (o crea una newtab al primo avvio).
    controller.restoreSession();
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
