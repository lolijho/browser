import {
  AiError,
  decideClassification,
  type AIChatRequest,
  type AIProvider,
  type AIProviderHealth,
  type AIStreamChunk,
  type AIStructuredRequest,
  type ClassificationRequest,
  type ClassificationResult,
  type SummarizeRequest,
  type SummaryResult,
} from "./types.js";

const MOCK_USAGE = {
  model: "mock",
  provider: "mock",
  inputTokens: 10,
  outputTokens: 20,
  costUsd: 0,
  latencyMs: 5,
};

/**
 * Provider deterministico per sviluppo e test: nessuna rete, nessun costo.
 */
export class MockAIProvider implements AIProvider {
  constructor(
    private readonly canned: {
      chatText?: string;
      structured?: unknown;
      summary?: string;
      classification?: Partial<ClassificationResult>;
    } = {},
  ) {}

  async *streamChat(request: AIChatRequest): AsyncIterable<AIStreamChunk> {
    const reply =
      this.canned.chatText ??
      `Risposta di prova a: "${request.messages.at(-1)?.content.slice(0, 60) ?? ""}"`;
    for (const word of reply.split(" ")) {
      yield { type: "text", text: `${word} ` };
    }
    yield {
      type: "done",
      usedSourceIds: (request.sources ?? []).map((s) => s.id),
      usage: MOCK_USAGE,
    };
  }

  generateStructured<T>(request: AIStructuredRequest<T>): Promise<T> {
    if (this.canned.structured === undefined) {
      return Promise.reject(
        new AiError({ code: "invalid_response", message: "MockAIProvider: nessun canned output" }),
      );
    }
    return Promise.resolve(request.schema.parse(this.canned.structured));
  }

  summarize(request: SummarizeRequest): Promise<SummaryResult> {
    return Promise.resolve({
      summary: this.canned.summary ?? `Riassunto di prova di "${request.source.title}".`,
      usedSourceIds: [request.source.id],
      usage: MOCK_USAGE,
    });
  }

  classify(request: ClassificationRequest): Promise<ClassificationResult> {
    const confidence = this.canned.classification?.confidence ?? 0.9;
    return Promise.resolve({
      suggestedWorkBoxId: request.workBoxes[0]?.id ?? null,
      suggestedWorkBoxName: request.workBoxes[0]?.name ?? null,
      confidence,
      title: request.source.title,
      summary: "Classificazione di prova",
      tags: [],
      entities: [],
      suggestedActions: [],
      sensitivity: "normal",
      reason: "mock",
      ...this.canned.classification,
      decision: decideClassification(confidence),
    });
  }

  healthCheck(): Promise<AIProviderHealth> {
    return Promise.resolve({ status: "ok", model: "mock" });
  }
}
