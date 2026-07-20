import { z } from "zod";

export const nodeEnvSchema = z.enum(["development", "test", "production"]).default("development");

export const logLevelSchema = z
  .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
  .default("info");

/**
 * Variabili richieste dall'API (apps/api).
 * API_HOST default 127.0.0.1: il bind su 0.0.0.0 deve essere una scelta esplicita
 * (container/produzione), non un default ereditato quando arriveranno route sensibili.
 */
export const apiEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  LOG_LEVEL: logLevelSchema,
  API_HOST: z.string().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});
export type ApiEnv = z.infer<typeof apiEnvSchema>;

/** Variabili richieste dal worker (apps/worker). REDIS_URL diventerà obbligatoria dalla fase 06. */
export const workerEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  LOG_LEVEL: logLevelSchema,
  REDIS_URL: z.url().optional(),
  // Porta del piccolo endpoint HTTP di liveness (fase 08): serve solo per
  // l'healthcheck del container, non espone logica. Non pubblicata all'esterno.
  WORKER_HEALTH_HOST: z.string().min(1).default("127.0.0.1"),
  WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(3002),
});
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

/**
 * Variabili backend (prompt 06): auth, database, admin.
 * Senza DATABASE_URL l'API usa il datastore in-memory (dev/alpha): utile per
 * provare tutto senza Postgres, ma i dati non sopravvivono al riavvio del server.
 * In produzione i segreti sono obbligatori (validati con `${VAR:?}` in Coolify).
 */
export const serverEnvSchema = z.object({
  DATABASE_URL: z.url().optional(),
  JWT_ACCESS_SECRET: z.string().min(16).default("dev-access-secret-change-me-please"),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24 * 30),
  ADMIN_API_KEY: z.string().min(16).optional(),
  CORS_ALLOWED_ORIGINS: z.string().default(""),
});
export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * Variabili OpenRouter/AI (prompt 05) — SOLO server-side.
 * OPENROUTER_API_KEY assente ⇒ il backend usa DisabledAIProvider e il
 * browser continua a funzionare senza AI.
 */
export const aiEnvSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_BASE_URL: z.url().default("https://openrouter.ai/api/v1"),
  OPENROUTER_MODEL: z.string().min(1).default("z-ai/glm-5.2"),
  OPENROUTER_HTTP_REFERER: z.string().default(""),
  OPENROUTER_APP_TITLE: z.string().default("BusinessBox Browser"),
  OPENROUTER_REASONING_EFFORT: z.enum(["high", "xhigh"]).default("high"),
  OPENROUTER_MAX_TOKENS: z.coerce.number().int().positive().default(8192),
  OPENROUTER_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  OPENROUTER_PROVIDER_SORT: z.enum(["price", "throughput", "latency"]).default("price"),
  OPENROUTER_ALLOW_FALLBACKS: z.stringbool().default(true),
  OPENROUTER_REQUIRE_PARAMETERS: z.stringbool().default(true),
  OPENROUTER_DATA_COLLECTION: z.enum(["deny", "allow"]).default("deny"),
  OPENROUTER_ZDR: z.stringbool().default(true),
  AI_DAILY_TOKEN_LIMIT: z.coerce.number().int().positive().default(2_000_000),
  AI_REQUEST_TOKEN_LIMIT: z.coerce.number().int().positive().default(32_000),
});
export type AiEnv = z.infer<typeof aiEnvSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: readonly string[]) {
    super(`Configurazione d'ambiente non valida:\n${issues.join("\n")}`);
    this.name = "EnvValidationError";
  }
}

/**
 * Valida un set di variabili d'ambiente contro uno schema Zod.
 * Fallisce in modo esplicito: nessun default silenzioso su valori malformati.
 */
export function parseEnv<TSchema extends z.ZodType>(
  schema: TSchema,
  source: Record<string, string | undefined> = process.env,
): z.output<TSchema> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `- ${issue.path.join(".") || "(root)"}: ${issue.message}`,
    );
    throw new EnvValidationError(issues);
  }
  return result.data;
}
