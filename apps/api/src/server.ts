import Fastify, { type FastifyInstance } from "fastify";
import type { ApiEnv } from "@businessbox/config";
import { registerHealthRoutes } from "./routes/health.js";

export function buildServer(env: ApiEnv): FastifyInstance {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "test" ? "silent" : env.LOG_LEVEL,
    },
  });

  registerHealthRoutes(app);

  return app;
}
