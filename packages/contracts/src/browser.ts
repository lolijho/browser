import { z } from "zod";
import { searchSettingsSchema } from "./search.js";

/** Errore di caricamento di una pagina (mostrato dalla pagina interna di errore). */
export const pageLoadErrorSchema = z.object({
  code: z.number().int(),
  description: z.string(),
  failedUrl: z.string(),
});
export type PageLoadError = z.infer<typeof pageLoadErrorSchema>;

/** Stato del ciclo di vita di una PageCard (prompt 02). */
export const pageLifecycleStateSchema = z.enum(["hot", "warm", "cold"]);
export type PageLifecycleState = z.infer<typeof pageLifecycleStateSchema>;

/**
 * PageCard: la pagina come risorsa (prompt 02), inclusa la proiezione runtime
 * (loading, cronologia, crash) usata dalla shell.
 */
export const pageCardSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  workBoxId: z.string().nullable(),
  parentPageId: z.string().nullable(),
  url: z.string().min(1),
  title: z.string(),
  domain: z.string(),
  state: pageLifecycleStateSchema,
  pinned: z.boolean(),
  keepAlive: z.boolean(),
  dirtyState: z.boolean(),
  archived: z.boolean(),
  sessionPartition: z.string().min(1),
  scrollPosition: z.number().nullable(),
  faviconUrl: z.string().nullable(),
  isLoading: z.boolean(),
  canGoBack: z.boolean(),
  canGoForward: z.boolean(),
  crashed: z.boolean(),
  loadError: pageLoadErrorSchema.nullable(),
  /** true se esiste un renderer vivo (hot/warm con WebContentsView). */
  hasView: z.boolean(),
  openedAt: z.iso.datetime(),
  lastActiveAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type PageCard = z.infer<typeof pageCardSchema>;

export const workspaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  order: z.number(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Workspace = z.infer<typeof workspaceSchema>;

export const workBoxSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  order: z.number(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type WorkBox = z.infer<typeof workBoxSchema>;

/** Snapshot completo dello stato del browser, pushato dal main al renderer. */
export const browserStateSchema = z.object({
  workspaces: z.array(workspaceSchema),
  workBoxes: z.array(workBoxSchema),
  pages: z.array(pageCardSchema),
  activeWorkspaceId: z.string().min(1),
  activePageId: z.string().nullable(),
  targetUrl: z.string().nullable(),
  searchSettings: searchSettingsSchema,
});
export type BrowserState = z.infer<typeof browserStateSchema>;

// --- payload richieste IPC (shell → main) ---

export const createPageRequestSchema = z.object({
  url: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
  activate: z.boolean().optional(),
});
export type CreatePageRequest = z.infer<typeof createPageRequestSchema>;

export const pageIdRequestSchema = z.object({
  pageId: z.string().min(1),
});
export type PageIdRequest = z.infer<typeof pageIdRequestSchema>;

export const navigateRequestSchema = z.object({
  pageId: z.string().min(1),
  input: z.string().min(1),
  /** Motore scelto "solo per questa ricerca" (keyword+Tab o menu omnibox). */
  engineId: z.string().min(1).optional(),
});
export type NavigateRequest = z.infer<typeof navigateRequestSchema>;

export const setPinnedRequestSchema = z.object({
  pageId: z.string().min(1),
  pinned: z.boolean(),
  /** Se fornito con la quarta pinned: la pagina pinned da sostituire. */
  replacePageId: z.string().min(1).optional(),
});
export type SetPinnedRequest = z.infer<typeof setPinnedRequestSchema>;

export const setPinnedResponseSchema = z.object({
  ok: z.boolean(),
  reason: z.string().optional(),
  /** true quando serve scegliere quale pinned sostituire (limite raggiunto). */
  needsReplacement: z.boolean().optional(),
  pinnedIds: z.array(z.string()).optional(),
});
export type SetPinnedResponse = z.infer<typeof setPinnedResponseSchema>;

export const archivePageRequestSchema = z.object({
  pageId: z.string().min(1),
  archived: z.boolean(),
});
export type ArchivePageRequest = z.infer<typeof archivePageRequestSchema>;

export const deletePageRequestSchema = z.object({
  pageId: z.string().min(1),
  /** true = l'utente ha confermato la chiusura definitiva di una pagina dirty. */
  force: z.boolean().optional(),
});
export type DeletePageRequest = z.infer<typeof deletePageRequestSchema>;

export const deletePageResponseSchema = z.object({
  ok: z.boolean(),
  needsConfirmation: z.boolean().optional(),
  reason: z.string().optional(),
});
export type DeletePageResponse = z.infer<typeof deletePageResponseSchema>;

export const movePageRequestSchema = z.object({
  pageId: z.string().min(1),
  workBoxId: z.string().min(1).nullable(),
});
export type MovePageRequest = z.infer<typeof movePageRequestSchema>;

export const setKeepAliveRequestSchema = z.object({
  pageId: z.string().min(1),
  keepAlive: z.boolean(),
});
export type SetKeepAliveRequest = z.infer<typeof setKeepAliveRequestSchema>;

export const createWorkspaceRequestSchema = z.object({
  name: z.string().min(1).max(80),
});
export type CreateWorkspaceRequest = z.infer<typeof createWorkspaceRequestSchema>;

export const switchWorkspaceRequestSchema = z.object({
  workspaceId: z.string().min(1),
});
export type SwitchWorkspaceRequest = z.infer<typeof switchWorkspaceRequestSchema>;

export const createWorkBoxRequestSchema = z.object({
  name: z.string().min(1).max(80),
});
export type CreateWorkBoxRequest = z.infer<typeof createWorkBoxRequestSchema>;

export const copyTextRequestSchema = z.object({
  text: z.string().max(8192),
});
export type CopyTextRequest = z.infer<typeof copyTextRequestSchema>;

/** Bounds dell'area contenuto, riportati dal renderer in pixel indipendenti (DIP). */
export const contentBoundsSchema = z.object({
  x: z.number().finite().min(0),
  y: z.number().finite().min(0),
  width: z.number().finite().min(0),
  height: z.number().finite().min(0),
});
export type ContentBounds = z.infer<typeof contentBoundsSchema>;

/** Comandi UI inviati dal main al renderer (scorciatoie/menu). */
export const uiCommandSchema = z.object({
  command: z.enum(["focus-omnibox", "toggle-sidebar", "toggle-ai-panel"]),
});
export type UiCommand = z.infer<typeof uiCommandSchema>;

// --- eventi dal preload delle pagine remote (page → main) ---

export const pageDirtyEventSchema = z.object({
  dirty: z.boolean(),
});
export type PageDirtyEvent = z.infer<typeof pageDirtyEventSchema>;

export const pageScrollEventSchema = z.object({
  y: z.number().finite().min(0),
});
export type PageScrollEvent = z.infer<typeof pageScrollEventSchema>;
