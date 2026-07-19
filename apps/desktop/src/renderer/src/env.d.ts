import type {
  AppInfo,
  BrowserState,
  ContentBounds,
  CreatePageRequest,
  PageState,
  SetPinnedResponse,
} from "@businessbox/contracts";

declare global {
  interface Window {
    /** Bridge esposto dal preload (vedi src/preload/index.ts). */
    businessbox: {
      getAppInfo(): Promise<AppInfo>;
      getBrowserState(): Promise<BrowserState>;
      createPage(request?: CreatePageRequest): Promise<PageState>;
      closePage(pageId: string): Promise<void>;
      activatePage(pageId: string): Promise<void>;
      navigate(pageId: string, input: string): Promise<void>;
      goBack(pageId: string): Promise<void>;
      goForward(pageId: string): Promise<void>;
      reload(pageId: string): Promise<void>;
      stop(pageId: string): Promise<void>;
      setPinned(pageId: string, pinned: boolean): Promise<SetPinnedResponse>;
      openDevTools(pageId: string): Promise<void>;
      setContentBounds(bounds: ContentBounds): Promise<void>;
      onBrowserState(callback: (payload: unknown) => void): () => void;
      onUiCommand(callback: (payload: unknown) => void): () => void;
    };
  }
}

export {};
