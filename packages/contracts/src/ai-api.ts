import { z } from "zod";

/** Messaggio di chat AI (API e desktop). */
export const aiChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(16_000),
});
export type AiChatMessage = z.infer<typeof aiChatMessageSchema>;

/** Fonte passata come contesto (già estratta e sanitizzata dal desktop). */
export const aiSourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(300),
  url: z.string().max(2048),
  text: z.string().max(60_000),
});
export type AiSourcePayload = z.infer<typeof aiSourceSchema>;

export const aiChatApiRequestSchema = z.object({
  messages: z.array(aiChatMessageSchema).min(1).max(20),
  sources: z.array(aiSourceSchema).max(8).default([]),
  reasoningEffort: z.enum(["high", "xhigh"]).optional(),
});
export type AiChatApiRequest = z.infer<typeof aiChatApiRequestSchema>;

export const aiSummarizeApiRequestSchema = z.object({
  source: aiSourceSchema,
});
export type AiSummarizeApiRequest = z.infer<typeof aiSummarizeApiRequestSchema>;

export const aiHealthResponseSchema = z.object({
  status: z.enum(["ok", "degraded", "disabled", "down"]),
  model: z.string().optional(),
  detail: z.string().optional(),
});
export type AiHealthResponse = z.infer<typeof aiHealthResponseSchema>;

// --- IPC desktop ---

/** Contesto AI della pagina attiva (main → renderer, già sanitizzato). */
export const aiPageContextResponseSchema = z.object({
  allowAI: z.boolean(),
  source: aiSourceSchema.nullable(),
});
export type AiPageContextResponse = z.infer<typeof aiPageContextResponseSchema>;

export const setAllowAiRequestSchema = z.object({
  pageId: z.string().min(1),
  allow: z.boolean(),
});
export type SetAllowAiRequest = z.infer<typeof setAllowAiRequestSchema>;

// --- Contesto multi-fonte (M6) ---

/** Richiesta di contesto per più pagine: il limite 8 combacia con l'API. */
export const aiContextRequestSchema = z.object({
  pageIds: z.array(z.string().min(1)).min(1).max(8),
});
export type AiContextRequest = z.infer<typeof aiContextRequestSchema>;

export const aiWorkBoxContextRequestSchema = z.object({
  workBoxId: z.string().min(1),
});
export type AiWorkBoxContextRequest = z.infer<typeof aiWorkBoxContextRequestSchema>;

/**
 * Contesto multi-fonte già sanitizzato. `excluded` elenca le pagine escluse e
 * il motivo, così la UI può dirlo all'utente invece di ignorarle in silenzio.
 */
export const aiContextResponseSchema = z.object({
  sources: z.array(aiSourceSchema).max(8),
  excluded: z.array(
    z.object({
      pageId: z.string().min(1),
      reason: z.enum(["ai-disabilitata", "nessun-contenuto", "limite-fonti"]),
    }),
  ),
});
export type AiContextResponse = z.infer<typeof aiContextResponseSchema>;

// --- Chat AI via IPC (il token resta nel main) ---

export const aiChatStartRequestSchema = z.object({
  messages: z.array(aiChatMessageSchema).min(1).max(20),
  pageIds: z.array(z.string().min(1)).max(8).default([]),
  reasoningEffort: z.enum(["high", "xhigh"]).optional(),
});
export type AiChatStartRequest = z.infer<typeof aiChatStartRequestSchema>;

export const aiChatStartResponseSchema = z.object({
  runId: z.string().min(1),
  /** Fonti effettivamente inviate: la UI le mostra come citazioni. */
  sources: z.array(aiSourceSchema).max(8),
  excluded: z.array(
    z.object({
      pageId: z.string().min(1),
      reason: z.enum(["ai-disabilitata", "nessun-contenuto", "limite-fonti"]),
    }),
  ),
});
export type AiChatStartResponse = z.infer<typeof aiChatStartResponseSchema>;

/** Chunk di streaming main → renderer, correlato da `runId`. */
export const aiChatChunkEventSchema = z.object({
  runId: z.string().min(1),
  chunk: z.discriminatedUnion("type", [
    z.object({ type: z.literal("text"), text: z.string() }),
    z.object({ type: z.literal("done"), usedSourceIds: z.array(z.string()).default([]) }),
    z.object({
      type: z.literal("error"),
      error: z.object({ code: z.string(), message: z.string() }),
    }),
  ]),
});
export type AiChatChunkEvent = z.infer<typeof aiChatChunkEventSchema>;

export const aiChatCancelRequestSchema = z.object({ runId: z.string().min(1) });
export type AiChatCancelRequest = z.infer<typeof aiChatCancelRequestSchema>;
