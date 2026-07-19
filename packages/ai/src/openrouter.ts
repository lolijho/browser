import { z } from "zod";
import { parseSSE } from "./sse.js";
import { AI_SYSTEM_PROMPT, wrapSourcesForPrompt } from "./sanitize.js";
import { CircuitBreaker } from "./breaker.js";
import {
  AiError,
  classificationResultSchema,
  decideClassification,
  type AIChatRequest,
  type AIMessage,
  type AIProvider,
  type AIProviderHealth,
  type AIStreamChunk,
  type AIStructuredRequest,
  type AISource,
  type AIUsage,
  type ClassificationRequest,
  type ClassificationResult,
  type NormalizedAiError,
  type SummarizeRequest,
  type SummaryResult,
} from "./types.js";

export interface OpenRouterConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  httpReferer: string;
  appTitle: string;
  reasoningEffort: "high" | "xhigh";
  maxTokens: number;
  timeoutMs: number;
  providerSort: "price" | "throughput" | "latency";
  allowFallbacks: boolean;
  requireParameters: boolean;
  dataCollection: "deny" | "allow";
  zdr: boolean;
}

export interface OpenRouterDeps {
  fetchFn?: typeof fetch;
  breaker?: CircuitBreaker;
  now?: () => number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const completionChunkSchema = z.object({
  choices: z
    .array(
      z.object({
        delta: z.object({ content: z.string().nullish() }).nullish(),
        finish_reason: z.string().nullish(),
      }),
    )
    .optional(),
  provider: z.string().optional(),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      completion_tokens_details: z.object({ reasoning_tokens: z.number().optional() }).optional(),
      cost: z.number().optional(),
    })
    .optional(),
});

const completionResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({ content: z.string().nullish() }),
      finish_reason: z.string().nullish(),
    }),
  ),
  provider: z.string().optional(),
  usage: completionChunkSchema.shape.usage,
});

export function normalizeAiError(error: unknown): NormalizedAiError {
  if (error instanceof AiError) {
    return error.normalized;
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return { code: "aborted", message: "Richiesta AI annullata" };
  }
  if (error instanceof Error && error.name === "AbortError") {
    return { code: "aborted", message: "Richiesta AI annullata" };
  }
  if (error instanceof Error && /timeout/i.test(error.message)) {
    return { code: "timeout", message: "Timeout della richiesta AI" };
  }
  return { code: "network", message: "Servizio AI non raggiungibile" };
}

function httpError(status: number): AiError {
  if (status === 401 || status === 403) {
    return new AiError({ code: "auth", message: "Autenticazione OpenRouter non valida" });
  }
  if (status === 429) {
    return new AiError({ code: "rate_limited", message: "OpenRouter: rate limit raggiunto" });
  }
  return new AiError({ code: "server", message: `OpenRouter: errore ${status}` });
}

/**
 * Provider OpenRouter per z-ai/glm-5.2 (prompt 05): endpoint OpenAI-compatible,
 * streaming SSE, header di attribuzione, provider routing con ZDR e
 * data_collection=deny. Nessun fallback verso modelli diversi: il campo
 * `models` non viene mai inviato, il fallback può avvenire solo tra provider
 * dello STESSO modello (allow_fallbacks).
 */
export class OpenRouterGLMProvider implements AIProvider {
  private readonly fetchFn: typeof fetch;
  private readonly breaker: CircuitBreaker;
  private readonly now: () => number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly config: OpenRouterConfig,
    deps: OpenRouterDeps = {},
  ) {
    this.fetchFn = deps.fetchFn ?? fetch;
    this.breaker = deps.breaker ?? new CircuitBreaker();
    this.now = deps.now ?? (() => Date.now());
    this.maxRetries = deps.maxRetries ?? 2;
    this.retryBaseDelayMs = deps.retryBaseDelayMs ?? 500;
    this.sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  // --- richieste ---

  private buildMessages(messages: AIMessage[], sources: AISource[] | undefined): AIMessage[] {
    const system: AIMessage[] = [{ role: "system", content: AI_SYSTEM_PROMPT }];
    if (sources && sources.length > 0) {
      system.push({ role: "system", content: wrapSourcesForPrompt(sources) });
    }
    return [...system, ...messages];
  }

  private buildBody(
    messages: AIMessage[],
    options: { stream: boolean; reasoningEffort?: "high" | "xhigh"; maxTokens?: number },
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      model: this.config.model,
      messages,
      stream: options.stream,
      max_tokens: Math.min(options.maxTokens ?? this.config.maxTokens, this.config.maxTokens),
      reasoning: { effort: options.reasoningEffort ?? this.config.reasoningEffort },
      usage: { include: true },
      provider: {
        sort: this.config.providerSort,
        allow_fallbacks: this.config.allowFallbacks,
        require_parameters: this.config.requireParameters,
        data_collection: this.config.dataCollection,
        zdr: this.config.zdr,
      },
      ...extra,
    };
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
      "X-Title": this.config.appTitle,
    };
    if (this.config.httpReferer) {
      headers["HTTP-Referer"] = this.config.httpReferer;
    }
    return headers;
  }

  /** POST con retry limitato (backoff esponenziale + jitter) e circuit breaker. */
  private async post(
    body: Record<string, unknown>,
    signal: AbortSignal | undefined,
  ): Promise<Response> {
    if (!this.breaker.canRequest()) {
      throw new AiError({
        code: "circuit_open",
        message: "AI temporaneamente sospesa dopo errori ripetuti: riprova tra poco",
      });
    }
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      if (attempt > 0) {
        const jitter = Math.floor(this.retryBaseDelayMs * (attempt + Math.random()));
        await this.sleep(this.retryBaseDelayMs * 2 ** (attempt - 1) + jitter);
      }
      const timeoutSignal = AbortSignal.timeout(this.config.timeoutMs);
      const merged = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
      try {
        const response = await this.fetchFn(`${this.config.baseUrl}/chat/completions`, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify(body),
          signal: merged,
        });
        if (response.ok) {
          this.breaker.recordSuccess();
          return response;
        }
        const failure = httpError(response.status);
        this.breaker.recordFailure();
        // 4xx (tranne 429) non è recuperabile: niente retry.
        if (response.status < 500 && response.status !== 429) {
          throw failure;
        }
        lastError = failure;
      } catch (error) {
        if (error instanceof AiError && error.normalized.code === "auth") {
          throw error;
        }
        if (signal?.aborted) {
          throw new AiError({ code: "aborted", message: "Richiesta AI annullata" });
        }
        if (timeoutSignal.aborted) {
          this.breaker.recordFailure();
          lastError = new AiError({ code: "timeout", message: "Timeout della richiesta AI" });
          continue;
        }
        this.breaker.recordFailure();
        lastError = error;
      }
    }
    throw lastError instanceof AiError ? lastError : new AiError(normalizeAiError(lastError));
  }

  // --- API AIProvider ---

  async *streamChat(request: AIChatRequest, signal?: AbortSignal): AsyncIterable<AIStreamChunk> {
    const startedAt = this.now();
    let firstTokenAt: number | null = null;
    const usedSourceIds = (request.sources ?? []).map((s) => s.id);
    try {
      const body = this.buildBody(this.buildMessages(request.messages, request.sources), {
        stream: true,
        ...(request.reasoningEffort ? { reasoningEffort: request.reasoningEffort } : {}),
        ...(request.maxTokens ? { maxTokens: request.maxTokens } : {}),
      });
      const response = await this.post(body, signal);
      if (!response.body) {
        throw new AiError({ code: "invalid_response", message: "Risposta senza corpo" });
      }

      let provider: string | undefined;
      let usage: AIUsage | null = null;
      let finishReason: string | undefined;

      for await (const data of parseSSE(response.body as AsyncIterable<Uint8Array>)) {
        let parsed: z.infer<typeof completionChunkSchema>;
        try {
          parsed = completionChunkSchema.parse(JSON.parse(data));
        } catch {
          continue; // chunk malformato: ignorato, lo stream prosegue
        }
        provider = parsed.provider ?? provider;
        const choice = parsed.choices?.[0];
        const text = choice?.delta?.content;
        if (text) {
          if (firstTokenAt === null) {
            firstTokenAt = this.now();
          }
          yield { type: "text", text };
        }
        if (choice?.finish_reason) {
          finishReason = choice.finish_reason;
        }
        if (parsed.usage) {
          usage = {
            model: this.config.model,
            ...(provider !== undefined ? { provider } : {}),
            inputTokens: parsed.usage.prompt_tokens ?? 0,
            outputTokens: parsed.usage.completion_tokens ?? 0,
            ...(parsed.usage.completion_tokens_details?.reasoning_tokens !== undefined
              ? { reasoningTokens: parsed.usage.completion_tokens_details.reasoning_tokens }
              : {}),
            ...(parsed.usage.cost !== undefined ? { costUsd: parsed.usage.cost } : {}),
          };
        }
      }

      const latencyMs = this.now() - startedAt;
      yield {
        type: "done",
        usedSourceIds,
        usage: {
          model: this.config.model,
          inputTokens: 0,
          outputTokens: 0,
          ...usage,
          ...(firstTokenAt !== null ? { ttftMs: firstTokenAt - startedAt } : {}),
          latencyMs,
          ...(finishReason !== undefined ? { finishReason } : {}),
        },
      };
    } catch (error) {
      yield { type: "error", error: normalizeAiError(error) };
    }
  }

  async generateStructured<T>(request: AIStructuredRequest<T>, signal?: AbortSignal): Promise<T> {
    const body = this.buildBody(
      this.buildMessages(request.messages, request.sources),
      {
        stream: false,
        ...(request.reasoningEffort ? { reasoningEffort: request.reasoningEffort } : {}),
        ...(request.maxTokens ? { maxTokens: request.maxTokens } : {}),
      },
      {
        response_format: {
          type: "json_schema",
          json_schema: { name: request.schemaName, strict: true, schema: request.jsonSchema },
        },
      },
    );
    const response = await this.post(body, signal);
    const json = completionResponseSchema.safeParse(await response.json());
    const content = json.success ? json.data.choices[0]?.message.content : null;
    if (!content) {
      throw new AiError({ code: "invalid_response", message: "Risposta AI non valida" });
    }
    try {
      return request.schema.parse(JSON.parse(content));
    } catch {
      throw new AiError({
        code: "invalid_response",
        message: "Output strutturato non conforme allo schema",
      });
    }
  }

  async summarize(request: SummarizeRequest, signal?: AbortSignal): Promise<SummaryResult> {
    const startedAt = this.now();
    const body = this.buildBody(
      this.buildMessages(
        [
          {
            role: "user",
            content:
              "Riassumi la fonte fornita in massimo 8 frasi, in italiano, con i punti utili a un imprenditore (numeri, prezzi, scadenze). Cita l'id della fonte.",
          },
        ],
        [request.source],
      ),
      {
        stream: false,
        ...(request.reasoningEffort ? { reasoningEffort: request.reasoningEffort } : {}),
      },
    );
    const response = await this.post(body, signal);
    const json = completionResponseSchema.safeParse(await response.json());
    const content = json.success ? json.data.choices[0]?.message.content : null;
    if (!content) {
      throw new AiError({ code: "invalid_response", message: "Risposta AI non valida" });
    }
    const usage = json.success ? json.data.usage : undefined;
    return {
      summary: content,
      usedSourceIds: [request.source.id],
      usage: {
        model: this.config.model,
        ...(json.success && json.data.provider !== undefined
          ? { provider: json.data.provider }
          : {}),
        inputTokens: usage?.prompt_tokens ?? 0,
        outputTokens: usage?.completion_tokens ?? 0,
        ...(usage?.cost !== undefined ? { costUsd: usage.cost } : {}),
        latencyMs: this.now() - startedAt,
      },
    };
  }

  async classify(
    request: ClassificationRequest,
    signal?: AbortSignal,
  ): Promise<ClassificationResult> {
    const workBoxList = request.workBoxes
      .map((b) => `- id="${b.id}" nome="${b.name}"${b.description ? ` (${b.description})` : ""}`)
      .join("\n");
    const raw = await this.generateStructured(
      {
        messages: [
          {
            role: "user",
            content: `Classifica la fonte fornita. WorkBox disponibili:\n${workBoxList}\nSe nessuna è adatta usa suggestedWorkBoxId=null.`,
          },
        ],
        sources: [request.source],
        schema: classificationResultSchema,
        schemaName: "page_classification",
        jsonSchema: CLASSIFICATION_JSON_SCHEMA,
      },
      signal,
    );
    return { ...raw, decision: decideClassification(raw.confidence) };
  }

  async healthCheck(): Promise<AIProviderHealth> {
    if (this.breaker.isOpen()) {
      return { status: "degraded", model: this.config.model, detail: "circuit breaker aperto" };
    }
    return { status: "ok", model: this.config.model };
  }
}

/** JSON Schema equivalente a classificationResultSchema (inviato al provider). */
export const CLASSIFICATION_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "suggestedWorkBoxId",
    "suggestedWorkBoxName",
    "confidence",
    "title",
    "summary",
    "tags",
    "entities",
    "suggestedActions",
    "sensitivity",
    "reason",
  ],
  properties: {
    suggestedWorkBoxId: { type: ["string", "null"] },
    suggestedWorkBoxName: { type: ["string", "null"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    title: { type: "string" },
    summary: { type: "string" },
    tags: { type: "array", items: { type: "string" }, maxItems: 10 },
    entities: {
      type: "array",
      maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "value", "confidence"],
        properties: {
          type: {
            type: "string",
            enum: [
              "company",
              "person",
              "product",
              "price",
              "location",
              "date",
              "email",
              "phone",
              "other",
            ],
          },
          value: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
    suggestedActions: { type: "array", items: { type: "string" }, maxItems: 10 },
    sensitivity: { type: "string", enum: ["normal", "potentially-sensitive", "sensitive"] },
    reason: { type: "string" },
  },
};
