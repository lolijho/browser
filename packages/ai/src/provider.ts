/**
 * Astrazione del provider AI (prompt 00: "Provider AI astratto, con OpenRouter
 * implementato in una fase successiva"; firma da prompt 05).
 *
 * `OpenRouterGLMProvider` e `MockAIProvider` arrivano nella fase 05.
 * Qui vive solo il contratto più `DisabledAIProvider`, l'implementazione
 * usata quando l'AI è spenta o non configurata.
 */

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIChatRequest {
  messages: AIMessage[];
  reasoningEffort?: "high" | "xhigh";
  maxTokens?: number;
}

export interface AIStreamChunk {
  type: "text" | "done" | "error";
  text?: string;
  error?: string;
}

export interface AIProviderHealth {
  status: "ok" | "degraded" | "disabled" | "down";
  model?: string;
  detail?: string;
}

export interface AIProvider {
  streamChat(request: AIChatRequest, signal?: AbortSignal): AsyncIterable<AIStreamChunk>;
  healthCheck(): Promise<AIProviderHealth>;
}

/** Errore sollevato quando si invoca l'AI mentre è disabilitata. */
export class AIDisabledError extends Error {
  constructor() {
    super("Il provider AI è disabilitato: il browser continua a funzionare senza AI.");
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

  healthCheck(): Promise<AIProviderHealth> {
    return Promise.resolve({ status: "disabled", detail: "AI non configurata o disattivata" });
  }
}
