import { apiEnvSchema, parseEnv } from "@businessbox/config";
import { buildServer } from "./server.js";

const env = parseEnv(apiEnvSchema);
const app = buildServer(env);

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
