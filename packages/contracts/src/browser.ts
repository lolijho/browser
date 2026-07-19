import { z } from "zod";

/** Errore di caricamento di una pagina (mostrato dalla pagina interna di errore). */
export const pageLoadErrorSchema = z.object({
  code: z.number().int(),
  description: z.string(),
  failedUrl: z.string(),
});
export type PageLoadError = z.infer<typeof pageLoadErrorSchema>;

/** Stato osservabile di una pagina del browser (proiezione read-only per il renderer). */
export const pageStateSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  url: z.string().min(1),
  title: z.string(),
  faviconUrl: z.string().nullable(),
  isLoading: z.boolean(),
  canGoBack: z.boolean(),
  canGoForward: z.boolean(),
  crashed: z.boolean(),
  loadError: pageLoadErrorSchema.nullable(),
  pinned: z.boolean(),
  /** false per le pagine interne (newtab) che non hanno un WebContentsView. */
  hasView: z.boolean(),
  createdAt: z.iso.datetime(),
  lastActiveAt: z.iso.datetime(),
});
export type PageState = z.infer<typeof pageStateSchema>;

/** Snapshot completo dello stato del browser, pushato dal main al renderer. */
export const browserStateSchema = z.object({
  pages: z.array(pageStateSchema),
  activePageId: z.string().nullable(),
  /** URL del link sotto il cursore nella pagina attiva (status bar). */
  targetUrl: z.string().nullable(),
});
export type BrowserState = z.infer<typeof browserStateSchema>;

// --- payload richieste IPC ---

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
});
export type NavigateRequest = z.infer<typeof navigateRequestSchema>;

export const setPinnedRequestSchema = z.object({
  pageId: z.string().min(1),
  pinned: z.boolean(),
});
export type SetPinnedRequest = z.infer<typeof setPinnedRequestSchema>;

export const setPinnedResponseSchema = z.object({
  ok: z.boolean(),
  reason: z.string().optional(),
});
export type SetPinnedResponse = z.infer<typeof setPinnedResponseSchema>;

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
