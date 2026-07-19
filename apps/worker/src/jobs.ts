/**
 * Registro dei job BullMQ del worker (prompt 06): classificazioni differite,
 * riassunti, embeddings, deduplicazione, cleanup, email transazionali,
 * elaborazioni sync pesanti. I job sono idempotenti e osservabili.
 */
export const QUEUE_NAMES = {
  classification: "businessbox-classification",
  summary: "businessbox-summary",
  embedding: "businessbox-embedding",
  dedup: "businessbox-dedup",
  cleanup: "businessbox-cleanup",
  email: "businessbox-email",
  sync: "businessbox-sync",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface ClassificationJob {
  organizationId: string;
  pageId: string;
  contentHash: string;
}
export interface SummaryJob {
  organizationId: string;
  pageId: string;
  contentHash: string;
}
export interface EmbeddingJob {
  organizationId: string;
  pageId: string;
  contentHash: string;
}
export interface EmailJob {
  to: string;
  template: "verify-email" | "reset-password";
  token: string;
}

export interface JobContext {
  /** Marca un contentHash come già elaborato (idempotenza). */
  wasProcessed(kind: string, key: string): Promise<boolean>;
  markProcessed(kind: string, key: string): Promise<void>;
  log(event: string, data: Record<string, unknown>): void;
}

export interface JobResult {
  status: "done" | "skipped";
  reason?: string;
}

/**
 * Handler idempotente: se il (kind, contentHash) è già stato elaborato, il job
 * viene saltato senza rifare il lavoro AI/embedding.
 */
export async function runIdempotent(
  ctx: JobContext,
  kind: string,
  key: string,
  work: () => Promise<void>,
): Promise<JobResult> {
  if (await ctx.wasProcessed(kind, key)) {
    ctx.log("job.skipped", { kind, key });
    return { status: "skipped", reason: "already_processed" };
  }
  await work();
  await ctx.markProcessed(kind, key);
  ctx.log("job.done", { kind, key });
  return { status: "done" };
}

/** Stato in-memory di idempotenza (sostituito da Redis/DB in produzione). */
export function createInMemoryJobContext(log: JobContext["log"] = () => {}): JobContext {
  const processed = new Set<string>();
  return {
    wasProcessed: (kind, key) => Promise.resolve(processed.has(`${kind}:${key}`)),
    markProcessed: (kind, key) => {
      processed.add(`${kind}:${key}`);
      return Promise.resolve();
    },
    log,
  };
}
