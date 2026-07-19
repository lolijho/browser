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
});
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

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
