import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { AiEnv, ApiEnv } from "@businessbox/config";
import {
  AiBudgetTracker,
  DisabledAIProvider,
  OpenRouterGLMProvider,
  type AIProvider,
} from "@businessbox/ai";
import { registerHealthRoutes } from "./routes/health.js";
import { registerAiRoutes } from "./routes/ai.js";

export interface BuildServerOptions {
  /** Override per i test (MockAIProvider). */
  aiProvider?: AIProvider;
  aiBudget?: AiBudgetTracker;
}

/** Costruisce il provider AI dalle variabili server-side (prompt 05). */
export function buildAiProvider(aiEnv: AiEnv): AIProvider {
  if (!aiEnv.OPENROUTER_API_KEY) {
    // Nessuna chiave: il browser continua a funzionare senza AI.
    return new DisabledAIProvider();
  }
  return new OpenRouterGLMProvider({
    apiKey: aiEnv.OPENROUTER_API_KEY,
    baseUrl: aiEnv.OPENROUTER_BASE_URL,
    model: aiEnv.OPENROUTER_MODEL,
    httpReferer: aiEnv.OPENROUTER_HTTP_REFERER,
    appTitle: aiEnv.OPENROUTER_APP_TITLE,
    reasoningEffort: aiEnv.OPENROUTER_REASONING_EFFORT,
    maxTokens: aiEnv.OPENROUTER_MAX_TOKENS,
    timeoutMs: aiEnv.OPENROUTER_TIMEOUT_MS,
    providerSort: aiEnv.OPENROUTER_PROVIDER_SORT,
    allowFallbacks: aiEnv.OPENROUTER_ALLOW_FALLBACKS,
    requireParameters: aiEnv.OPENROUTER_REQUIRE_PARAMETERS,
    dataCollection: aiEnv.OPENROUTER_DATA_COLLECTION,
    zdr: aiEnv.OPENROUTER_ZDR,
  });
}

export async function buildServer(
  env: ApiEnv,
  aiEnv: AiEnv,
  options: BuildServerOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "test" ? "silent" : env.LOG_LEVEL,
    },
  });

  // Alpha: il desktop chiama l'API da origin locali (dev server o file://).
  // Restrizione per dominio in produzione: fasi 07-08 (CORS_ALLOWED_ORIGINS).
  await app.register(cors, { origin: true });

  registerHealthRoutes(app);
  registerAiRoutes(app, {
    provider: options.aiProvider ?? buildAiProvider(aiEnv),
    budget:
      options.aiBudget ??
      new AiBudgetTracker({
        dailyTokens: aiEnv.AI_DAILY_TOKEN_LIMIT,
        perRequestTokens: aiEnv.AI_REQUEST_TOKEN_LIMIT,
      }),
  });

  return app;
}
