import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import {
  aiChatApiRequestSchema,
  aiHealthResponseSchema,
  aiSummarizeApiRequestSchema,
} from "@businessbox/contracts";
import {
  estimateTokens,
  normalizeAiError,
  type AIProvider,
  type AIUsage,
  type AiBudgetTracker,
} from "@businessbox/ai";

export interface AiRouteDeps {
  provider: AIProvider;
  budget: AiBudgetTracker;
  requireAuth: preHandlerHookHandler;
}

/**
 * Rotte AI (prompt 05): il backend riceve lo stream da OpenRouter e lo
 * ritrasmette al desktop via SSE. La chiave API non lascia mai il server.
 * Telemetria senza contenuti: modello, provider, token, costo, latenza, TTFT.
 *
 * Autenticazione: ogni rotta che consuma token OpenRouter (usage/summarize/chat)
 * richiede un access token valido. Senza guard l'endpoint sarebbe un proxy LLM
 * aperto a spese dell'operatore, e non sarebbe possibile attribuire il consumo
 * a un'organizzazione (prerequisito della fatturazione a consumo).
 * `/ai/health` resta pubblica: è un segnale di liveness, non costa nulla e non
 * espone dati — serve al desktop per sapere se mostrare l'AI prima del login.
 */
export function registerAiRoutes(app: FastifyInstance, deps: AiRouteDeps): void {
  app.get("/api/v1/ai/health", async () =>
    aiHealthResponseSchema.parse(await deps.provider.healthCheck()),
  );

  app.get("/api/v1/ai/usage", { preHandler: deps.requireAuth }, async () => deps.budget.getUsage());

  app.post("/api/v1/ai/summarize", { preHandler: deps.requireAuth }, async (request, reply) => {
    const parsed = aiSummarizeApiRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    const estimated = estimateTokens(parsed.data.source.text);
    const verdict = deps.budget.checkRequest(estimated);
    if (!verdict.allowed) {
      return reply.code(429).send({ error: "budget_exceeded", reason: verdict.reason });
    }
    try {
      const result = await deps.provider.summarize({ source: parsed.data.source });
      deps.budget.recordUsage(result.usage.inputTokens + result.usage.outputTokens);
      logAiRun(app, "summarize", result.usage);
      return reply.send(result);
    } catch (error) {
      const normalized = normalizeAiError(error);
      app.log.warn({ aiError: normalized.code }, "ai_summarize_failed");
      return reply.code(normalized.code === "disabled" ? 503 : 502).send({ error: normalized });
    }
  });

  app.post("/api/v1/ai/chat", { preHandler: deps.requireAuth }, async (request, reply) => {
    const parsed = aiChatApiRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    const estimated =
      estimateTokens(parsed.data.messages.map((m) => m.content).join("\n")) +
      estimateTokens(parsed.data.sources.map((s) => s.text).join("\n"));
    const verdict = deps.budget.checkRequest(estimated);
    if (!verdict.allowed) {
      return reply.code(429).send({ error: "budget_exceeded", reason: verdict.reason });
    }

    // SSE gestito manualmente: da qui la risposta è nostra.
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const abort = new AbortController();
    request.raw.on("close", () => abort.abort());

    try {
      const stream = deps.provider.streamChat(
        {
          messages: parsed.data.messages,
          sources: parsed.data.sources,
          ...(parsed.data.reasoningEffort ? { reasoningEffort: parsed.data.reasoningEffort } : {}),
        },
        abort.signal,
      );
      for await (const chunk of stream) {
        reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
        if (chunk.type === "done") {
          deps.budget.recordUsage(chunk.usage.inputTokens + chunk.usage.outputTokens);
          logAiRun(app, "chat", chunk.usage);
        }
        if (chunk.type === "error") {
          app.log.warn({ aiError: chunk.error.code }, "ai_chat_failed");
        }
      }
    } catch (error) {
      const normalized = normalizeAiError(error);
      app.log.warn({ aiError: normalized.code }, "ai_chat_failed");
      reply.raw.write(`data: ${JSON.stringify({ type: "error", error: normalized })}\n\n`);
    }
    reply.raw.write("data: [DONE]\n\n");
    reply.raw.end();
  });
}

/** Telemetria senza contenuti sensibili (prompt 05). */
function logAiRun(app: FastifyInstance, kind: string, usage: AIUsage): void {
  app.log.info(
    {
      aiRun: {
        kind,
        model: usage.model,
        provider: usage.provider,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        reasoningTokens: usage.reasoningTokens,
        costUsd: usage.costUsd,
        ttftMs: usage.ttftMs,
        latencyMs: usage.latencyMs,
        finishReason: usage.finishReason,
      },
    },
    "ai_run",
  );
}
