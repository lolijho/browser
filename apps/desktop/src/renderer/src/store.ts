import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import {
  browserStateSchema,
  openSearchProposalSchema,
  uiCommandSchema,
  type BrowserState,
  type OpenSearchProposal,
} from "@businessbox/contracts";
import { DEFAULT_WORKSPACE_ID } from "@businessbox/shared";

interface PendingPin {
  pageId: string;
  pinnedIds: string[];
}

interface PendingDelete {
  pageId: string;
  reason: string;
}

interface ShellStore {
  browser: BrowserState;
  sidebarOpen: boolean;
  aiPanelOpen: boolean;
  /** Incrementato per chiedere il focus dell'omnibox (scorciatoia Ctrl/Cmd+L). */
  omniboxFocusToken: number;
  notice: string | null;
  searchQuery: string;
  pendingPin: PendingPin | null;
  pendingDelete: PendingDelete | null;
  openSearchProposal: OpenSearchProposal | null;
  showEngineManager: boolean;

  setBrowserState: (state: BrowserState) => void;
  toggleSidebar: () => void;
  toggleAiPanel: () => void;
  requestOmniboxFocus: () => void;
  setNotice: (message: string | null) => void;
  setSearchQuery: (query: string) => void;
  setPendingPin: (pending: PendingPin | null) => void;
  setPendingDelete: (pending: PendingDelete | null) => void;
  setOpenSearchProposal: (proposal: OpenSearchProposal | null) => void;
  setShowEngineManager: (show: boolean) => void;
}

export const useShellStore = create<ShellStore>((set) => ({
  browser: {
    workspaces: [],
    workBoxes: [],
    pages: [],
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
    activePageId: null,
    targetUrl: null,
    searchSettings: {
      engines: [],
      globalDefaultEngineId: "google",
      privateDefaultEngineId: "brave",
      workspaceDefaults: {},
    },
  },
  sidebarOpen: true,
  aiPanelOpen: false,
  omniboxFocusToken: 0,
  notice: null,
  searchQuery: "",
  pendingPin: null,
  pendingDelete: null,
  openSearchProposal: null,
  showEngineManager: false,

  setBrowserState: (state) => set({ browser: state }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleAiPanel: () => set((s) => ({ aiPanelOpen: !s.aiPanelOpen })),
  requestOmniboxFocus: () => set((s) => ({ omniboxFocusToken: s.omniboxFocusToken + 1 })),
  setNotice: (message) => set({ notice: message }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setPendingPin: (pending) => set({ pendingPin: pending }),
  setPendingDelete: (pending) => set({ pendingDelete: pending }),
  setOpenSearchProposal: (proposal) => set({ openSearchProposal: proposal }),
  setShowEngineManager: (show) => set({ showEngineManager: show }),
}));

/** Collega gli eventi push del main allo store, validando i payload con Zod. */
export function connectShellStore(): () => void {
  const { setBrowserState, toggleSidebar, toggleAiPanel, requestOmniboxFocus } =
    useShellStore.getState();

  void window.businessbox.getBrowserState().then((snapshot) => {
    setBrowserState(browserStateSchema.parse(snapshot));
  });

  const offState = window.businessbox.onBrowserState((payload) => {
    const parsed = browserStateSchema.safeParse(payload);
    if (parsed.success) {
      setBrowserState(parsed.data);
    }
  });

  const offCommand = window.businessbox.onUiCommand((payload) => {
    const parsed = uiCommandSchema.safeParse(payload);
    if (!parsed.success) {
      return;
    }
    switch (parsed.data.command) {
      case "focus-omnibox":
        requestOmniboxFocus();
        break;
      case "toggle-sidebar":
        toggleSidebar();
        break;
      case "toggle-ai-panel":
        toggleAiPanel();
        break;
    }
  });

  const offProposal = window.businessbox.onOpenSearchProposal((payload) => {
    const parsed = openSearchProposalSchema.safeParse(payload);
    if (parsed.success) {
      useShellStore.getState().setOpenSearchProposal(parsed.data);
    }
  });

  return () => {
    offState();
    offCommand();
    offProposal();
  };
}

export function useActivePage() {
  return useShellStore((s) => s.browser.pages.find((p) => p.id === s.browser.activePageId) ?? null);
}

/** Pagine del workspace attivo. */
export function useWorkspacePages() {
  // zustand v5: un selettore che ritorna un NUOVO array a ogni chiamata manda
  // useSyncExternalStore in loop infinito (React #185). `useShallow` memoizza
  // e confronta shallow, restituendo un riferimento stabile quando il contenuto
  // non cambia.
  return useShellStore(
    useShallow((s) => s.browser.pages.filter((p) => p.workspaceId === s.browser.activeWorkspaceId)),
  );
}

/** Motore di default effettivo per il workspace attivo (override → globale). */
export function useActiveSearchEngine() {
  return useShellStore((s) => {
    const settings = s.browser.searchSettings;
    const overrideId = settings.workspaceDefaults[s.browser.activeWorkspaceId];
    const engineId = overrideId ?? settings.globalDefaultEngineId;
    return (
      settings.engines.find((e) => e.id === engineId) ??
      settings.engines.find((e) => e.id === settings.globalDefaultEngineId) ??
      null
    );
  });
}
