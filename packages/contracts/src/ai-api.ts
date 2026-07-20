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
