import { Menu, type MenuItemConstructorOptions } from "electron";
import { BRANDING } from "@businessbox/shared";

export interface MenuHandlers {
  newPage: () => void;
  reloadActive: () => void;
  goBack: () => void;
  goForward: () => void;
  focusOmnibox: () => void;
  toggleSidebar: () => void;
  toggleAiPanel: () => void;
  openActivePageDevTools: () => void;
}

/** Scorciatoie richieste dal prompt 01, esposte come accelerator di menu (valgono anche quando il focus è nella pagina remota). */
export function buildApplicationMenu(handlers: MenuHandlers): Menu {
  const isMac = process.platform === "darwin";

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: "appMenu" as const }] : []),
    {
      label: "File",
      submenu: [
        {
          label: "Nuova pagina",
          accelerator: "CmdOrCtrl+T",
          click: () => handlers.newPage(),
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "Navigazione",
      submenu: [
        {
          label: "Apri omnibox",
          accelerator: "CmdOrCtrl+L",
          click: () => handlers.focusOmnibox(),
        },
        {
          label: "Ricarica pagina",
          accelerator: "CmdOrCtrl+R",
          click: () => handlers.reloadActive(),
        },
        { type: "separator" },
        {
          label: "Indietro",
          accelerator: "Alt+Left",
          click: () => handlers.goBack(),
        },
        {
          label: "Avanti",
          accelerator: "Alt+Right",
          click: () => handlers.goForward(),
        },
      ],
    },
    {
      label: "Vista",
      submenu: [
        {
          label: "Mostra/nascondi sidebar",
          accelerator: "CmdOrCtrl+B",
          click: () => handlers.toggleSidebar(),
        },
        {
          label: "Mostra/nascondi pannello AI",
          accelerator: "CmdOrCtrl+Shift+A",
          click: () => handlers.toggleAiPanel(),
        },
        { type: "separator" },
        {
          label: "DevTools pagina attiva",
          accelerator: "CmdOrCtrl+Shift+I",
          click: () => handlers.openActivePageDevTools(),
        },
        { role: "toggleDevTools", label: `DevTools shell ${BRANDING.productName}` },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];

  return Menu.buildFromTemplate(template);
}
