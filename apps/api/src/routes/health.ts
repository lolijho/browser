import type { FastifyInstance } from "fastify";
import {
  healthResponseSchema,
  livenessResponseSchema,
  readinessResponseSchema,
} from "@businessbox/contracts";
import { SERVICE_NAME, SERVICE_VERSION } from "../version.js";

export function registerHealthRoutes(app: FastifyInstance): void {
  const startedAt = Date.now();

  app.get("/health", async () =>
    healthResponseSchema.parse({
      status: "ok",
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      uptimeSeconds: (Date.now() - startedAt) / 1000,
      timestamp: new Date().toISOString(),
    }),
  );

  app.get("/health/live", async () => livenessResponseSchema.parse({ status: "ok" }));

  // PostgreSQL e Redis vengono verificati qui dalla fase 06:
  // in fase 00 i check sono dichiarati esplicitamente "skipped", non finti "ok".
  app.get("/health/ready", async () =>
    readinessResponseSchema.parse({
      status: "ok",
      checks: {
        database: "skipped",
        redis: "skipped",
      },
    }),
  );
}
