import type {
  AddCustomEngineRequest,
  AiChatStartRequest,
  AiChatStartResponse,
  AiContextResponse,
  AiPageContextResponse,
  AppInfo,
  AuthResult,
  AuthStatus,
  BrowserState,
  ContentBounds,
  CreatePageRequest,
  DeletePageResponse,
  EngineMutationResponse,
  ExportSearchSettingsResponse,
  LocalSearchRequest,
  LocalSearchResponse,
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
      navigate(pageId: string, input: string, engineId?: string): Promise<void>;
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
      setSearchDefault(
        engineId: string,
        scope: "global" | "workspace" | "private",
        workspaceId?: string,
      ): Promise<EngineMutationResponse>;
      clearWorkspaceSearchDefault(workspaceId: string): Promise<void>;
      addCustomEngine(request: AddCustomEngineRequest): Promise<EngineMutationResponse>;
      removeEngine(engineId: string): Promise<EngineMutationResponse>;
      exportSearchSettings(): Promise<ExportSearchSettingsResponse>;
      importSearchSettings(json: string): Promise<EngineMutationResponse>;
      decideOpenSearch(proposalId: string, accept: boolean): Promise<void>;
      searchLocal(request: LocalSearchRequest): Promise<LocalSearchResponse>;
      setAllowScreenshot(pageId: string, allow: boolean): Promise<void>;
      deleteScreenshot(pageId: string): Promise<void>;
      setAllowAi(pageId: string, allow: boolean): Promise<void>;
      aiGetPageContext(pageId: string): Promise<AiPageContextResponse>;
      aiGetContext(pageIds: string[]): Promise<AiContextResponse>;
      aiGetWorkBoxContext(workBoxId: string): Promise<AiContextResponse>;
      aiChatStart(request: AiChatStartRequest): Promise<AiChatStartResponse>;
      aiChatCancel(runId: string): Promise<void>;
      onAiChatChunk(callback: (payload: unknown) => void): () => void;
      authGetStatus(): Promise<AuthStatus>;
      authLogin(email: string, password: string): Promise<AuthResult>;
      authRegister(email: string, password: string): Promise<AuthResult>;
      authLogout(): Promise<AuthStatus>;
      onAuthState(callback: (payload: unknown) => void): () => void;
      onOpenSearchProposal(callback: (payload: unknown) => void): () => void;
      openDevTools(pageId: string): Promise<void>;
      setContentBounds(bounds: ContentBounds): Promise<void>;
      onBrowserState(callback: (payload: unknown) => void): () => void;
      onUiCommand(callback: (payload: unknown) => void): () => void;
    };
  }
}

export {};
