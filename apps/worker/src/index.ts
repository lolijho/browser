import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { parseEnv, workerEnvSchema } from "@businessbox/config";
import { JOB_NAMES, SYSTEM_QUEUE_NAME, type HeartbeatJobResult } from "./queues.js";

const env = parseEnv(workerEnvSchema);

if (!env.REDIS_URL) {
  // In fase 00 Redis non è ancora un requisito: il worker segnala e termina
  // in modo pulito invece di andare in crash loop.
  console.warn(
    "[worker] REDIS_URL non impostata: il worker termina. " +
      "Imposta REDIS_URL per elaborare le code (vedi .env.example).",
  );
  process.exit(0);
}

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

const worker = new Worker<unknown, HeartbeatJobResult>(
  SYSTEM_QUEUE_NAME,
  async (job) => {
    if (job.name === JOB_NAMES.heartbeat) {
      return { ok: true, processedAt: new Date().toISOString() };
    }
    throw new Error(`Job sconosciuto: ${job.name}`);
  },
  { connection },
);

worker.on("ready", () => {
  console.info(`[worker] in ascolto sulla coda "${SYSTEM_QUEUE_NAME}"`);
});

worker.on("failed", (job, error) => {
  console.error(`[worker] job ${job?.id ?? "?"} fallito:`, error.message);
});

const shutdown = async (signal: string): Promise<void> => {
  console.info(`[worker] ${signal} ricevuto, arresto in corso`);
  await worker.close();
  connection.disconnect();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
