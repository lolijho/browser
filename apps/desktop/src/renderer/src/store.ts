import { create } from "zustand";
import { browserStateSchema, uiCommandSchema, type BrowserState } from "@businessbox/contracts";

interface ShellStore {
  browser: BrowserState;
  sidebarOpen: boolean;
  aiPanelOpen: boolean;
  /** Incrementato per chiedere il focus dell'omnibox (scorciatoia Ctrl/Cmd+L). */
  omniboxFocusToken: number;
  pinError: string | null;

  setBrowserState: (state: BrowserState) => void;
  toggleSidebar: () => void;
  toggleAiPanel: () => void;
  requestOmniboxFocus: () => void;
  setPinError: (message: string | null) => void;
}

export const useShellStore = create<ShellStore>((set) => ({
  browser: { pages: [], activePageId: null, targetUrl: null },
  sidebarOpen: true,
  aiPanelOpen: false,
  omniboxFocusToken: 0,
  pinError: null,

  setBrowserState: (state) => set({ browser: state }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleAiPanel: () => set((s) => ({ aiPanelOpen: !s.aiPanelOpen })),
  requestOmniboxFocus: () => set((s) => ({ omniboxFocusToken: s.omniboxFocusToken + 1 })),
  setPinError: (message) => set({ pinError: message }),
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

  return () => {
    offState();
    offCommand();
  };
}

export function useActivePage() {
  return useShellStore((s) => s.browser.pages.find((p) => p.id === s.browser.activePageId) ?? null);
}
