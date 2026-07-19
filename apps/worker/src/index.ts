import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { parseEnv, workerEnvSchema } from "@businessbox/config";
import { QUEUE_NAMES, createInMemoryJobContext, runIdempotent } from "./jobs.js";

const env = parseEnv(workerEnvSchema);

if (!env.REDIS_URL) {
  console.warn(
    "[worker] REDIS_URL non impostata: il worker termina. " +
      "Imposta REDIS_URL per elaborare le code (vedi .env.example).",
  );
  process.exit(0);
}

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const jobContext = createInMemoryJobContext((event, data) =>
  console.info(`[worker] ${event}`, data),
);

/**
 * Un worker per coda di dominio. Gli handler reali (AI, embeddings, email)
 * vengono collegati man mano; l'idempotenza è garantita da runIdempotent.
 */
const workers = Object.values(QUEUE_NAMES).map(
  (queueName) =>
    new Worker(
      queueName,
      async (job) => {
        const key = String(job.data?.contentHash ?? job.id ?? "");
        return runIdempotent(jobContext, queueName, key, async () => {
          // Placeholder osservabile: la logica di dominio arriva collegando
          // provider AI e repository (fasi successive). Il job resta idempotente.
          console.info(`[worker] processing ${queueName} job ${job.id ?? "?"}`);
        });
      },
      { connection },
    ),
);

for (const worker of workers) {
  worker.on("failed", (job, error) => {
    console.error(`[worker] job ${job?.id ?? "?"} fallito:`, error.message);
  });
}

console.info(`[worker] in ascolto su ${workers.length} code`);

const shutdown = async (signal: string): Promise<void> => {
  console.info(`[worker] ${signal} ricevuto, arresto in corso`);
  await Promise.all(workers.map((w) => w.close()));
  connection.disconnect();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
