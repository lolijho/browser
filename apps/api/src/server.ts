import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import type { AiEnv, ApiEnv, ServerEnv } from "@businessbox/config";
import {
  AiBudgetTracker,
  DisabledAIProvider,
  OpenRouterGLMProvider,
  type AIProvider,
} from "@businessbox/ai";
import {
  BraveSearchProvider,
  DisabledSearchProvider,
  type SearchProvider,
} from "@businessbox/prospecting";
import { registerHealthRoutes } from "./routes/health.js";
import { registerAiRoutes } from "./routes/ai.js";
import { registerProspectingRoutes } from "./routes/prospecting.js";
import { createMemoryRepositories } from "./data/memory.js";
import type { Repositories } from "./data/types.js";
import { AuthService } from "./modules/auth/service.js";
import { createAuthGuard } from "./modules/auth/guard.js";
import { registerAuthRoutes } from "./modules/auth/routes.js";
import { registerSyncRoutes } from "./modules/sync/routes.js";
import { registerAdminRoutes } from "./modules/admin/routes.js";

export interface BuildServerOptions {
  aiProvider?: AIProvider;
  aiBudget?: AiBudgetTracker;
  /** Override del provider di ricerca (fake nei test). */
  searchProvider?: SearchProvider;
  /** Override del fetch usato dal prospecting per scaricare i siti (test). */
  searchFetchImpl?: typeof fetch;
  /** Override delle repository (Postgres in produzione, memory nei test). */
  repos?: Repositories;
}

/** Provider di ricerca Brave, o disabilitato se manca la chiave. */
export function buildSearchProvider(serverEnv: ServerEnv): SearchProvider {
  if (!serverEnv.BRAVE_SEARCH_API_KEY) {
    return new DisabledSearchProvider();
  }
  return new BraveSearchProvider({
    apiKey: serverEnv.BRAVE_SEARCH_API_KEY,
    country: serverEnv.BRAVE_SEARCH_COUNTRY,
  });
}

export function buildAiProvider(aiEnv: AiEnv): AIProvider {
  if (!aiEnv.OPENROUTER_API_KEY) {
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
  serverEnv: ServerEnv,
  options: BuildServerOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: env.NODE_ENV === "test" ? "silent" : env.LOG_LEVEL },
  });

  const allowedOrigins = serverEnv.CORS_ALLOWED_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  await app.register(cors, { origin: allowedOrigins.length > 0 ? allowedOrigins : true });

  await app.register(swagger, {
    openapi: {
      info: { title: "BusinessBox Browser API", version: "0.1.0" },
      servers: [{ url: env.NODE_ENV === "production" ? "/" : `http://localhost:${env.API_PORT}` }],
    },
  });

  const repos = options.repos ?? createMemoryRepositories();
  const tokenConfig = {
    accessSecret: serverEnv.JWT_ACCESS_SECRET,
    accessTtlSeconds: serverEnv.JWT_ACCESS_TTL_SECONDS,
    refreshTtlSeconds: serverEnv.JWT_REFRESH_TTL_SECONDS,
  };
  const authService = new AuthService({ repos, tokenConfig });
  const requireAuth = createAuthGuard(repos, tokenConfig);

  // Provider AI condiviso tra le rotte /ai e /prospecting (una sola istanza).
  const aiProvider = options.aiProvider ?? buildAiProvider(aiEnv);
  const searchProvider: SearchProvider = options.searchProvider ?? buildSearchProvider(serverEnv);

  registerHealthRoutes(app);
  registerAiRoutes(app, {
    provider: aiProvider,
    budget:
      options.aiBudget ??
      new AiBudgetTracker({
        dailyTokens: aiEnv.AI_DAILY_TOKEN_LIMIT,
        perRequestTokens: aiEnv.AI_REQUEST_TOKEN_LIMIT,
      }),
    requireAuth,
  });
  registerProspectingRoutes(app, {
    searchProvider,
    aiProvider,
    requireAuth,
    ...(options.searchFetchImpl ? { fetchImpl: options.searchFetchImpl } : {}),
  });
  registerAuthRoutes(app, { repos, authService, requireAuth });
  registerSyncRoutes(app, { repos, requireAuth });
  registerAdminRoutes(app, { repos, adminApiKey: serverEnv.ADMIN_API_KEY ?? null });

  return app;
}
