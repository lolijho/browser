import { z } from "zod";

/** Entità sincronizzabili (mai cookie/token/localStorage dei siti). */
export const syncEntityTypeSchema = z.enum([
  "workspace",
  "workbox",
  "page_card",
  "page_snapshot",
  "tag",
  "note",
  "task",
]);
export type SyncEntityType = z.infer<typeof syncEntityTypeSchema>;

export const syncOperationSchema = z.enum(["upsert", "delete"]);
export type SyncOperation = z.infer<typeof syncOperationSchema>;

/**
 * Mutazione client-first: UUID generati dal client, idempotency key per non
 * duplicare, syncVersion per il rilevamento conflitti. Il payload è già
 * filtrato dai flag privacy sul client (allowSync).
 */
export const syncMutationSchema = z.object({
  idempotencyKey: z.uuid(),
  entityType: syncEntityTypeSchema,
  entityId: z.uuid(),
  operation: syncOperationSchema,
  /** Versione conosciuta dal client dell'entità (0 = nuova). Base per LWW/conflitti. */
  baseVersion: z.number().int().nonnegative(),
  /** Campi dell'entità (assenti per delete → tombstone). */
  payload: z.record(z.string(), z.unknown()).nullable(),
  /** Timestamp client (LWW dei campi semplici). */
  updatedAt: z.iso.datetime(),
});
export type SyncMutation = z.infer<typeof syncMutationSchema>;

export const syncPushRequestSchema = z.object({
  mutations: z.array(syncMutationSchema).min(1).max(500),
});
export type SyncPushRequest = z.infer<typeof syncPushRequestSchema>;

export const syncMutationResultSchema = z.object({
  idempotencyKey: z.uuid(),
  status: z.enum(["applied", "duplicate", "conflict", "rejected"]),
  /** Nuova versione server dell'entità dopo l'applicazione. */
  newVersion: z.number().int().nonnegative().optional(),
  reason: z.string().optional(),
});
export type SyncMutationResult = z.infer<typeof syncMutationResultSchema>;

export const syncPushResponseSchema = z.object({
  results: z.array(syncMutationResultSchema),
  /** Cursore server aggiornato (per il pull incrementale). */
  serverVersion: z.number().int().nonnegative(),
});
export type SyncPushResponse = z.infer<typeof syncPushResponseSchema>;

export const syncPullRequestSchema = z.object({
  /** Ultima serverVersion vista dal client; 0 per il primo sync. */
  since: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(1000).default(200),
});
export type SyncPullRequest = z.infer<typeof syncPullRequestSchema>;

export const syncEventSchema = z.object({
  serverVersion: z.number().int().nonnegative(),
  entityType: syncEntityTypeSchema,
  entityId: z.uuid(),
  operation: syncOperationSchema,
  payload: z.record(z.string(), z.unknown()).nullable(),
  updatedAt: z.iso.datetime(),
});
export type SyncEvent = z.infer<typeof syncEventSchema>;

export const syncPullResponseSchema = z.object({
  events: z.array(syncEventSchema),
  serverVersion: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});
export type SyncPullResponse = z.infer<typeof syncPullResponseSchema>;

/** Conflitto esplicito (note e spostamenti concorrenti). */
export const syncConflictSchema = z.object({
  id: z.string().min(1),
  entityType: syncEntityTypeSchema,
  entityId: z.uuid(),
  localPayload: z.record(z.string(), z.unknown()).nullable(),
  remotePayload: z.record(z.string(), z.unknown()).nullable(),
  detectedAt: z.iso.datetime(),
});
export type SyncConflict = z.infer<typeof syncConflictSchema>;
