import { describe, expect, it } from "vitest";
import { aiEnvSchema, apiEnvSchema, parseEnv, serverEnvSchema } from "@businessbox/config";
import { buildServer } from "./server.js";

const ENV = parseEnv(apiEnvSchema, { NODE_ENV: "test" });
const AI_ENV = parseEnv(aiEnvSchema, {});
const SERVER_ENV = parseEnv(serverEnvSchema, {
  JWT_ACCESS_SECRET: "secret-di-test-abbastanza-lungo-123456",
  ADMIN_API_KEY: "admin-key-di-test-abcdefghijklmnop",
});

async function app() {
  return buildServer(ENV, AI_ENV, SERVER_ENV);
}

async function registerUser(server: Awaited<ReturnType<typeof app>>, email: string) {
  const res = await server.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email, password: "password-molto-sicura-1", organizationName: "Test" },
  });
  return res.json() as {
    tokens: { accessToken: string; refreshToken: string };
    organizationId: string;
    deviceId: string;
    user: { id: string };
  };
}

describe("Auth API", () => {
  it("register → login → accesso a rotta protetta", async () => {
    const server = await app();
    const reg = await server.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: "u1@example.com", password: "password-molto-sicura-1" },
    });
    expect(reg.statusCode).toBe(201);

    const me = await server.inject({
      method: "GET",
      url: "/api/v1/users/me",
      headers: {
        authorization: `Bearer ${(reg.json() as { tokens: { accessToken: string } }).tokens.accessToken}`,
      },
    });
    expect(me.statusCode).toBe(200);
    expect((me.json() as { email: string }).email).toBe("u1@example.com");
    await server.close();
  });

  it("rotta protetta senza token → 401", async () => {
    const server = await app();
    const res = await server.inject({ method: "GET", url: "/api/v1/users/me" });
    expect(res.statusCode).toBe(401);
    await server.close();
  });

  it("refresh rotation e revoca dispositivo end-to-end", async () => {
    const server = await app();
    const session = await registerUser(server, "u2@example.com");
    const refreshed = await server.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: session.tokens.refreshToken },
    });
    expect(refreshed.statusCode).toBe(200);

    const revoke = await server.inject({
      method: "POST",
      url: `/api/v1/devices/${session.deviceId}/revoke`,
      headers: { authorization: `Bearer ${session.tokens.accessToken}` },
    });
    expect(revoke.statusCode).toBe(204);
    // Dopo la revoca, l'access token del device è rifiutato.
    const me = await server.inject({
      method: "GET",
      url: "/api/v1/users/me",
      headers: { authorization: `Bearer ${session.tokens.accessToken}` },
    });
    expect(me.statusCode).toBe(401);
    await server.close();
  });
});

describe("Sync API — isolamento tenant", () => {
  it("un utente non può leggere le entità di un'altra organizzazione", async () => {
    const server = await app();
    const alice = await registerUser(server, "alice@example.com");
    const bob = await registerUser(server, "bob@example.com");

    const push = await server.inject({
      method: "POST",
      url: "/api/v1/sync/push",
      headers: { authorization: `Bearer ${alice.tokens.accessToken}` },
      payload: {
        mutations: [
          {
            idempotencyKey: crypto.randomUUID(),
            entityType: "workspace",
            entityId: crypto.randomUUID(),
            operation: "upsert",
            baseVersion: 0,
            payload: { name: "Segreto di Alice" },
            updatedAt: new Date().toISOString(),
          },
        ],
      },
    });
    expect(push.statusCode).toBe(200);
    expect((push.json() as { results: { status: string }[] }).results[0]?.status).toBe("applied");

    // Bob (altra org) non vede nulla.
    const bobPull = await server.inject({
      method: "POST",
      url: "/api/v1/sync/pull",
      headers: { authorization: `Bearer ${bob.tokens.accessToken}` },
      payload: { since: 0 },
    });
    expect((bobPull.json() as { events: unknown[] }).events).toHaveLength(0);

    // Alice sì.
    const alicePull = await server.inject({
      method: "POST",
      url: "/api/v1/sync/pull",
      headers: { authorization: `Bearer ${alice.tokens.accessToken}` },
      payload: { since: 0 },
    });
    expect((alicePull.json() as { events: unknown[] }).events).toHaveLength(1);
    await server.close();
  });
});

describe("Admin API", () => {
  it("richiede la chiave admin", async () => {
    const server = await app();
    const noKey = await server.inject({ method: "GET", url: "/api/v1/admin/users" });
    expect(noKey.statusCode).toBe(401);
    const withKey = await server.inject({
      method: "GET",
      url: "/api/v1/admin/users",
      headers: { "x-admin-key": "admin-key-di-test-abcdefghijklmnop" },
    });
    expect(withKey.statusCode).toBe(200);
    await server.close();
  });

  it("è disabilitata se ADMIN_API_KEY non è configurata (503)", async () => {
    const server = await buildServer(ENV, AI_ENV, parseEnv(serverEnvSchema, {}));
    const res = await server.inject({ method: "GET", url: "/api/v1/admin/users" });
    expect(res.statusCode).toBe(503);
    await server.close();
  });

  it("genera OpenAPI", async () => {
    const server = await app();
    await server.ready();
    const spec = server.swagger() as { openapi: string; paths: Record<string, unknown> };
    expect(spec.openapi).toContain("3.");
    expect(Object.keys(spec.paths)).toContain("/api/v1/auth/login");
    await server.close();
  });
});
