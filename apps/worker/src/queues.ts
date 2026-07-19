/**
 * Nomi di code e job del worker. Le code di dominio (classificazione,
 * riassunti, embeddings, sync) vengono aggiunte nelle fasi 05-06.
 */
export const SYSTEM_QUEUE_NAME = "businessbox-system";

export const JOB_NAMES = {
  heartbeat: "heartbeat",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export interface HeartbeatJobResult {
  ok: boolean;
  processedAt: string;
}
