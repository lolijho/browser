import { describe, expect, it } from "vitest";
import { healthResponseSchema, readinessResponseSchema } from "./health.js";

describe("healthResponseSchema", () => {
  it("accetta una risposta valida", () => {
    const parsed = healthResponseSchema.parse({
      status: "ok",
      service: "api",
      version: "0.1.0",
      uptimeSeconds: 12.5,
      timestamp: new Date().toISOString(),
    });
    expect(parsed.status).toBe("ok");
  });

  it("rifiuta uptime negativo", () => {
    const result = healthResponseSchema.safeParse({
      status: "ok",
      service: "api",
      version: "0.1.0",
      uptimeSeconds: -1,
      timestamp: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it("rifiuta timestamp non ISO", () => {
    const result = healthResponseSchema.safeParse({
      status: "ok",
      service: "api",
      version: "0.1.0",
      uptimeSeconds: 0,
      timestamp: "ieri",
    });
    expect(result.success).toBe(false);
  });
});

describe("readinessResponseSchema", () => {
  it("accetta check con stati noti", () => {
    const parsed = readinessResponseSchema.parse({
      status: "ok",
      checks: { database: "skipped", redis: "skipped" },
    });
    expect(parsed.checks["database"]).toBe("skipped");
  });

  it("rifiuta stati check sconosciuti", () => {
    const result = readinessResponseSchema.safeParse({
      status: "ok",
      checks: { database: "forse" },
    });
    expect(result.success).toBe(false);
  });
});
