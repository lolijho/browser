import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  healthResponseSchema,
  livenessResponseSchema,
  readinessResponseSchema,
} from "@businessbox/contracts";
import { aiEnvSchema, apiEnvSchema, parseEnv } from "@businessbox/config";
import { AiBudgetTracker, DisabledAIProvider, MockAIProvider } from "@businessbox/ai";
import { buildServer } from "./server.js";

const TEST_ENV = parseEnv(apiEnvSchema, { NODE_ENV: "test" });
const TEST_AI_ENV = parseEnv(aiEnvSchema, {});

describe("API health endpoints", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer(TEST_ENV, TEST_AI_ENV);
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

describe("API AI (fase 05)", () => {
  it("senza chiave OpenRouter l'AI risulta disabled e il server resta sano", async () => {
    const app = await buildServer(TEST_ENV, TEST_AI_ENV);
    const health = await app.inject({ method: "GET", url: "/api/v1/ai/health" });
    expect(health.json()).toMatchObject({ status: "disabled" });
    const chat = await app.inject({
      method: "POST",
      url: "/api/v1/ai/chat",
      payload: { messages: [{ role: "user", content: "ciao" }], sources: [] },
    });
    expect(chat.body).toContain('"type":"error"');
    expect(chat.body).toContain('"disabled"');
    // /health continua a rispondere: il resto del sistema non dipende dall'AI.
    const stillOk = await app.inject({ method: "GET", url: "/health" });
    expect(stillOk.statusCode).toBe(200);
    await app.close();
  });

  it("chat: ritrasmette lo stream SSE con testo, done (fonti usate) e [DONE]", async () => {
    const app = await buildServer(TEST_ENV, TEST_AI_ENV, {
      aiProvider: new MockAIProvider({ chatText: "Ecco il riassunto" }),
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ai/chat",
      payload: {
        messages: [{ role: "user", content: "riassumi" }],
        sources: [{ id: "p1", title: "Pagina", url: "https://x.example", text: "contenuto" }],
      },
    });
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toContain('"type":"text"');
    expect(response.body).toContain("Ecco");
    expect(response.body).toContain('"usedSourceIds":["p1"]');
    expect(response.body.trim().endsWith("data: [DONE]")).toBe(true);
    await app.close();
  });

  it("chat: richiesta non valida → 400", async () => {
    const app = await buildServer(TEST_ENV, TEST_AI_ENV, { aiProvider: new MockAIProvider() });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ai/chat",
      payload: { messages: [] },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("budget esaurito → 429 e il browser può continuare (health ok)", async () => {
    const app = await buildServer(TEST_ENV, TEST_AI_ENV, {
      aiProvider: new MockAIProvider(),
      aiBudget: new AiBudgetTracker({ dailyTokens: 10, perRequestTokens: 5 }),
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ai/chat",
      payload: { messages: [{ role: "user", content: "testo lungo oltre il budget" }] },
    });
    expect(response.statusCode).toBe(429);
    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
    await app.close();
  });

  it("summarize: risponde con riassunto, fonti usate e registra l'uso", async () => {
    const budget = new AiBudgetTracker({ dailyTokens: 100_000, perRequestTokens: 32_000 });
    const app = await buildServer(TEST_ENV, TEST_AI_ENV, {
      aiProvider: new MockAIProvider({ summary: "Sintesi operativa." }),
      aiBudget: budget,
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ai/summarize",
      payload: { source: { id: "p9", title: "Doc", url: "https://d.example", text: "testo" } },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      summary: "Sintesi operativa.",
      usedSourceIds: ["p9"],
    });
    expect(budget.getUsage().tokens).toBeGreaterThan(0);
    await app.close();
  });

  it("provider disabilitato su summarize → 503, mai un crash", async () => {
    const app = await buildServer(TEST_ENV, TEST_AI_ENV, { aiProvider: new DisabledAIProvider() });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ai/summarize",
      payload: { source: { id: "p1", title: "T", url: "https://x.example", text: "t" } },
    });
    expect(response.statusCode).toBe(503);
    await app.close();
  });
});
