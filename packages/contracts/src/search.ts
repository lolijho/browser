import { z } from "zod";

/** Modello di un motore di ricerca (prompt 03). */
export const searchEngineSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  keyword: z.string().min(1),
  searchUrlTemplate: z.string().min(1),
  suggestUrlTemplate: z.string().optional(),
  iconUrl: z.string().optional(),
  type: z.enum(["built-in", "custom", "opensearch"]),
  scope: z.enum(["global", "workspace"]),
  workspaceId: z.string().optional(),
  enabled: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type SearchEngine = z.infer<typeof searchEngineSchema>;

/** Impostazioni motori incluse nello snapshot del browser. */
export const searchSettingsSchema = z.object({
  engines: z.array(searchEngineSchema),
  globalDefaultEngineId: z.string().min(1),
  privateDefaultEngineId: z.string().min(1),
  /** workspaceId → engineId; assenza = eredita il default globale. */
  workspaceDefaults: z.record(z.string(), z.string()),
});
export type SearchSettings = z.infer<typeof searchSettingsSchema>;

// --- richieste IPC ---

export const setSearchDefaultRequestSchema = z.object({
  engineId: z.string().min(1),
  scope: z.enum(["global", "workspace", "private"]),
  workspaceId: z.string().min(1).optional(),
});
export type SetSearchDefaultRequest = z.infer<typeof setSearchDefaultRequestSchema>;

export const clearWorkspaceDefaultRequestSchema = z.object({
  workspaceId: z.string().min(1),
});
export type ClearWorkspaceDefaultRequest = z.infer<typeof clearWorkspaceDefaultRequestSchema>;

export const addCustomEngineRequestSchema = z.object({
  name: z.string().min(1).max(80),
  keyword: z.string().min(1).max(30),
  searchUrlTemplate: z.string().min(1).max(2048),
  suggestUrlTemplate: z.string().max(2048).optional(),
  iconUrl: z.string().max(2048).optional(),
  scope: z.enum(["global", "workspace"]).default("global"),
  workspaceId: z.string().min(1).optional(),
});
export type AddCustomEngineRequest = z.infer<typeof addCustomEngineRequestSchema>;

export const updateCustomEngineRequestSchema = z.object({
  engineId: z.string().min(1),
  patch: addCustomEngineRequestSchema.partial(),
});
export type UpdateCustomEngineRequest = z.infer<typeof updateCustomEngineRequestSchema>;

export const removeEngineRequestSchema = z.object({
  engineId: z.string().min(1),
});
export type RemoveEngineRequest = z.infer<typeof removeEngineRequestSchema>;

export const engineMutationResponseSchema = z.object({
  ok: z.boolean(),
  reason: z.string().optional(),
});
export type EngineMutationResponse = z.infer<typeof engineMutationResponseSchema>;

export const importSearchSettingsRequestSchema = z.object({
  json: z.string().min(2).max(262144),
});
export type ImportSearchSettingsRequest = z.infer<typeof importSearchSettingsRequestSchema>;

export const exportSearchSettingsResponseSchema = z.object({
  json: z.string(),
});
export type ExportSearchSettingsResponse = z.infer<typeof exportSearchSettingsResponseSchema>;

// --- OpenSearch ---

/** Proposta di installazione motore rilevato via OpenSearch (mai automatica). */
export const openSearchProposalSchema = z.object({
  proposalId: z.string().min(1),
  pageId: z.string().min(1),
  name: z.string().min(1),
  keyword: z.string().min(1),
  searchUrlTemplate: z.string().min(1),
  sourceUrl: z.string().min(1),
});
export type OpenSearchProposal = z.infer<typeof openSearchProposalSchema>;

export const openSearchDecisionRequestSchema = z.object({
  proposalId: z.string().min(1),
  accept: z.boolean(),
});
export type OpenSearchDecisionRequest = z.infer<typeof openSearchDecisionRequestSchema>;

/** Evento dal preload delle pagine: trovato un descriptor OpenSearch. */
export const openSearchDetectedEventSchema = z.object({
  href: z.string().min(1).max(2048),
  title: z.string().max(200).optional(),
});
export type OpenSearchDetectedEvent = z.infer<typeof openSearchDetectedEventSchema>;
