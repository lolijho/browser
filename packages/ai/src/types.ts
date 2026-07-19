import { z } from "zod";

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Fonte (PageCard) fornita come contesto: dati, MAI istruzioni. */
export interface AISource {
  id: string;
  title: string;
  url: string;
  text: string;
}

export interface AIUsage {
  model: string;
  provider?: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  costUsd?: number;
  ttftMs?: number;
  latencyMs?: number;
  finishReason?: string;
}

export type AIStreamChunk =
  | { type: "text"; text: string }
  | { type: "done"; usage: AIUsage; usedSourceIds: string[] }
  | { type: "error"; error: NormalizedAiError };

export interface AIChatRequest {
  messages: AIMessage[];
  sources?: AISource[];
  reasoningEffort?: "high" | "xhigh";
  maxTokens?: number;
}

export interface AIStructuredRequest<T> {
  messages: AIMessage[];
  sources?: AISource[];
  schema: z.ZodType<T>;
  /** JSON Schema inviato al provider quando supportato. */
  jsonSchema: Record<string, unknown>;
  schemaName: string;
  reasoningEffort?: "high" | "xhigh";
  maxTokens?: number;
}

export interface SummarizeRequest {
  source: AISource;
  reasoningEffort?: "high" | "xhigh";
}

export interface SummaryResult {
  summary: string;
  usedSourceIds: string[];
  usage: AIUsage;
}

export interface ClassificationRequest {
  source: AISource;
  workBoxes: { id: string; name: string; description: string }[];
}

/** Output di classificazione atteso (prompt 05). */
export const classificationResultSchema = z.object({
  suggestedWorkBoxId: z.string().nullable(),
  suggestedWorkBoxName: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  title: z.string(),
  summary: z.string(),
  tags: z.array(z.string()).max(10),
  entities: z
    .array(
      z.object({
        type: z.enum([
          "company",
          "person",
          "product",
          "price",
          "location",
          "date",
          "email",
          "phone",
          "other",
        ]),
        value: z.string(),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(30),
  suggestedActions: z.array(z.string()).max(10),
  sensitivity: z.enum(["normal", "potentially-sensitive", "sensitive"]),
  reason: z.string(),
});
export type ClassificationResult = z.infer<typeof classificationResultSchema> & {
  decision: ClassificationDecision;
};

export type ClassificationDecision = "auto" | "suggest" | "unorganized";

/** Soglie del prompt 05: ≥0.80 auto, 0.55–0.79 suggerisci, <0.55 Da organizzare. */
export function decideClassification(confidence: number): ClassificationDecision {
  if (confidence >= 0.8) {
    return "auto";
  }
  if (confidence >= 0.55) {
    return "suggest";
  }
  return "unorganized";
}

export interface AIProviderHealth {
  status: "ok" | "degraded" | "disabled" | "down";
  model?: string;
  detail?: string;
}

/** Contratto del provider AI (prompt 05). */
export interface AIProvider {
  streamChat(request: AIChatRequest, signal?: AbortSignal): AsyncIterable<AIStreamChunk>;
  generateStructured<T>(request: AIStructuredRequest<T>, signal?: AbortSignal): Promise<T>;
  summarize(request: SummarizeRequest, signal?: AbortSignal): Promise<SummaryResult>;
  classify(request: ClassificationRequest, signal?: AbortSignal): Promise<ClassificationResult>;
  healthCheck(): Promise<AIProviderHealth>;
}

export type AiErrorCode =
  | "timeout"
  | "aborted"
  | "rate_limited"
  | "auth"
  | "server"
  | "network"
  | "invalid_response"
  | "circuit_open"
  | "budget_exceeded"
  | "disabled";

export interface NormalizedAiError {
  code: AiErrorCode;
  message: string;
}

export class AiError extends Error {
  constructor(public readonly normalized: NormalizedAiError) {
    super(normalized.message);
    this.name = "AiError";
  }
}
