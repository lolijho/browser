import type {
  AppInfo,
  BrowserState,
  ContentBounds,
  CreatePageRequest,
  DeletePageResponse,
  PageCard,
  SetPinnedResponse,
} from "@businessbox/contracts";

declare global {
  interface Window {
    /** Bridge esposto dal preload della shell (vedi src/preload/index.ts). */
    businessbox: {
      getAppInfo(): Promise<AppInfo>;
      getBrowserState(): Promise<BrowserState>;
      createPage(request?: CreatePageRequest): Promise<PageCard>;
      closePage(pageId: string): Promise<void>;
      activatePage(pageId: string): Promise<void>;
      navigate(pageId: string, input: string): Promise<void>;
      goBack(pageId: string): Promise<void>;
      goForward(pageId: string): Promise<void>;
      reload(pageId: string): Promise<void>;
      stop(pageId: string): Promise<void>;
      setPinned(
        pageId: string,
        pinned: boolean,
        replacePageId?: string,
      ): Promise<SetPinnedResponse>;
      archivePage(pageId: string, archived: boolean): Promise<void>;
      deletePage(pageId: string, force?: boolean): Promise<DeletePageResponse>;
      movePage(pageId: string, workBoxId: string | null): Promise<void>;
      duplicatePage(pageId: string): Promise<void>;
      setKeepAlive(pageId: string, keepAlive: boolean): Promise<void>;
      createWorkspace(name: string): Promise<void>;
      switchWorkspace(workspaceId: string): Promise<void>;
      createWorkBox(name: string): Promise<void>;
      copyText(text: string): Promise<void>;
      openDevTools(pageId: string): Promise<void>;
      setContentBounds(bounds: ContentBounds): Promise<void>;
      onBrowserState(callback: (payload: unknown) => void): () => void;
      onUiCommand(callback: (payload: unknown) => void): () => void;
    };
  }
}

export {};
