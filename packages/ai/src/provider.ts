import {
  AiError,
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

/** Errore sollevato quando si invoca l'AI mentre è disabilitata. */
export class AIDisabledError extends AiError {
  constructor() {
    super({
      code: "disabled",
      message: "Il provider AI è disabilitato: il browser continua a funzionare senza AI.",
    });
    this.name = "AIDisabledError";
  }
}

/**
 * Provider nullo: rifiuta ogni chiamata in modo esplicito.
 * Garantisce il requisito "il browser funziona anche senza AI".
 */
export class DisabledAIProvider implements AIProvider {
  // eslint-disable-next-line require-yield -- il provider disabilitato non produce chunk: fallisce subito.
  async *streamChat(_request: AIChatRequest, _signal?: AbortSignal): AsyncIterable<AIStreamChunk> {
    throw new AIDisabledError();
  }

  generateStructured<T>(_request: AIStructuredRequest<T>): Promise<T> {
    return Promise.reject(new AIDisabledError());
  }

  summarize(_request: SummarizeRequest): Promise<SummaryResult> {
    return Promise.reject(new AIDisabledError());
  }

  classify(_request: ClassificationRequest): Promise<ClassificationResult> {
    return Promise.reject(new AIDisabledError());
  }

  healthCheck(): Promise<AIProviderHealth> {
    return Promise.resolve({ status: "disabled", detail: "AI non configurata o disattivata" });
  }
}
