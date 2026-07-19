import { aiEnvSchema, apiEnvSchema, parseEnv, serverEnvSchema } from "@businessbox/config";
import { buildServer } from "./server.js";
import { createPgRepositories } from "./data/pg/index.js";

const env = parseEnv(apiEnvSchema);
const aiEnv = parseEnv(aiEnvSchema);
const serverEnv = parseEnv(serverEnvSchema);

// Con DATABASE_URL usa Postgres; altrimenti datastore in-memory (dev/alpha).
const repos = serverEnv.DATABASE_URL
  ? await createPgRepositories(serverEnv.DATABASE_URL)
  : undefined;
if (!repos) {
  console.warn(
    "[api] DATABASE_URL non impostata: datastore IN-MEMORY (i dati non sopravvivono al riavvio).",
  );
}

const app = await buildServer(env, aiEnv, serverEnv, repos ? { repos } : {});

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, "arresto in corso");
  await app.close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
