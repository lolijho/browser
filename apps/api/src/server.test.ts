import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  healthResponseSchema,
  livenessResponseSchema,
  readinessResponseSchema,
} from "@businessbox/contracts";
import { apiEnvSchema, parseEnv } from "@businessbox/config";
import { buildServer } from "./server.js";

describe("API health endpoints", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildServer(parseEnv(apiEnvSchema, { NODE_ENV: "test" }));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health risponde con payload conforme al contratto", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    const body = healthResponseSchema.parse(response.json());
    expect(body.service).toBe("api");
    expect(body.status).toBe("ok");
  });

  it("GET /health/live risponde ok", async () => {
    const response = await app.inject({ method: "GET", url: "/health/live" });
    expect(response.statusCode).toBe(200);
    expect(livenessResponseSchema.parse(response.json()).status).toBe("ok");
  });

  it("GET /health/ready dichiara i check non ancora attivi come skipped", async () => {
    const response = await app.inject({ method: "GET", url: "/health/ready" });
    expect(response.statusCode).toBe(200);
    const body = readinessResponseSchema.parse(response.json());
    expect(body.checks["database"]).toBe("skipped");
    expect(body.checks["redis"]).toBe("skipped");
  });
});
