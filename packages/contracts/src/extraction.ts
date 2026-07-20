import { z } from "zod";

/**
 * Contenuto estratto da una pagina nel preload isolato (prompt 04).
 * Limiti severi: l'estrazione non deve mai diventare un canale di esfiltrazione.
 * Mai inclusi: valori dei campi, cookie, token, storage.
 */
export const extractedContentSchema = z.object({
  url: z.string().min(1).max(2048),
  canonicalUrl: z.string().max(2048).nullable(),
  title: z.string().max(500),
  description: z.string().max(2000).nullable(),
  language: z.string().max(20).nullable(),
  headings: z.array(z.string().max(300)).max(30),
  text: z.string().max(200_000),
  openGraph: z.record(z.string().max(100), z.string().max(2000)),
  /** JSON-LD pubblici, come stringhe raw (parse/validazione a valle). */
  jsonLd: z.array(z.string().max(20_000)).max(10),
  author: z.string().max(200).nullable(),
  publishedAt: z.string().max(60).nullable(),
  links: z.array(z.string().max(2048)).max(25),
  tablesText: z.string().max(50_000),
});
export type ExtractedContent = z.infer<typeof extractedContentSchema>;

// --- ricerca locale (FTS) ---

export const localSearchRequestSchema = z.object({
  query: z.string().min(1).max(200),
  workspaceId: z.string().min(1).optional(),
  workBoxId: z.string().min(1).optional(),
  domain: z.string().max(255).optional(),
  pinnedOnly: z.boolean().optional(),
  includeArchived: z.boolean().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});
export type LocalSearchRequest = z.infer<typeof localSearchRequestSchema>;

export const localSearchResultSchema = z.object({
  pageId: z.string().min(1),
  workspaceId: z.string().min(1),
  workBoxId: z.string().nullable(),
  title: z.string(),
  url: z.string(),
  domain: z.string(),
  snippet: z.string(),
  archived: z.boolean(),
  pinned: z.boolean(),
});
export type LocalSearchResult = z.infer<typeof localSearchResultSchema>;

export const localSearchResponseSchema = z.object({
  results: z.array(localSearchResultSchema),
});
export type LocalSearchResponse = z.infer<typeof localSearchResponseSchema>;

export const setAllowScreenshotRequestSchema = z.object({
  pageId: z.string().min(1),
  allow: z.boolean(),
});
export type SetAllowScreenshotRequest = z.infer<typeof setAllowScreenshotRequestSchema>;
