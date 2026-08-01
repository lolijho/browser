import { describe, expect, it } from "vitest";
import { authSessionSchema, prospectSearchResponseSchema } from "@businessbox/contracts";
import { aiEnvSchema, apiEnvSchema, parseEnv, serverEnvSchema } from "@businessbox/config";
import { MockAIProvider } from "@businessbox/ai";
import { FakeSearchProvider } from "@businessbox/prospecting";
import { buildServer } from "./server.js";

const TEST_ENV = parseEnv(apiEnvSchema, { NODE_ENV: "test" });
const TEST_AI_ENV = parseEnv(aiEnvSchema, {});
const TEST_SERVER_ENV = parseEnv(serverEnvSchema, {
  ADMIN_API_KEY: "admin-key-di-test-1234567890",
});

async function authHeaders(
  app: Awaited<ReturnType<typeof buildServer>>,
): Promise<Record<string, string>> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email: `pro-${crypto.randomUUID()}@example.com`, password: "password-di-test-1234" },
  });
  const session = authSessionSchema.parse(response.json());
  return { authorization: `Bearer ${session.tokens.accessToken}` };
}

/** fetch finto: risponde HTML diverso per dominio, nessuna rete reale. */
function fakeFetch(
  pages: Record<string, { status: number; html: string; contentType?: string }>,
): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    const page = pages[url];
    if (!page) {
      throw new Error("network");
    }
    return new Response(page.html, {
      status: page.status,
      headers: { "content-type": page.contentType ?? "text/html" },
    });
  }) as unknown as typeof fetch;
}

describe("API prospecting", () => {
  it("richiede autenticazione", async () => {
    const app = await buildServer(TEST_ENV, TEST_AI_ENV, TEST_SERVER_ENV, {
      searchProvider: new FakeSearchProvider(),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/prospecting/search",
      payload: { query: "dentisti" },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("senza chiave Brave → searchDisabled, nessun lead", async () => {
    // Nessun searchProvider passato → default DisabledSearchProvider (no key).
    const app = await buildServer(TEST_ENV, TEST_AI_ENV, TEST_SERVER_ENV);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/prospecting/search",
      headers: await authHeaders(app),
      payload: { query: "idraulici", location: "Roma" },
    });
    expect(res.statusCode).toBe(200);
    const body = prospectSearchResponseSchema.parse(res.json());
    expect(body.searchDisabled).toBe(true);
    expect(body.leads).toEqual([]);
    await app.close();
  });

  it("flusso completo: ricerca → analisi sito → proposta AI → lead ordinati", async () => {
    const app = await buildServer(TEST_ENV, TEST_AI_ENV, TEST_SERVER_ENV, {
      searchProvider: new FakeSearchProvider([
        { title: "Studio Moderno", url: "https://moderno.it", description: "dentista" },
        { title: "Studio Vecchio", url: "http://vecchio.example", description: "dentista" },
      ]),
      searchFetchImpl: fakeFetch({
        "https://moderno.it": {
          status: 200,
          html: `<meta name="viewport" content="w"><a href="mailto:a@moderno.it">c</a>${"testo ".repeat(120)}`,
        },
        "http://vecchio.example": { status: 200, html: "<html><font>vecchio</font></html>" },
      }),
      aiProvider: new MockAIProvider({ chatText: "Proposta di valore su misura." }),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/prospecting/search",
      headers: await authHeaders(app),
      payload: { query: "dentisti", location: "Bologna", limit: 10 },
    });
    expect(res.statusCode).toBe(200);
    const body = prospectSearchResponseSchema.parse(res.json());
    expect(body.searchDisabled).toBe(false);
    expect(body.leads).toHaveLength(2);
    // Il sito scarno/http è il lead più caldo → primo.
    expect(body.leads[0]?.url).toBe("http://vecchio.example");
    expect(body.leads[0]?.analysis.issues.length).toBeGreaterThan(0);
    expect(body.leads[0]?.valueProposition).toContain("Proposta");
    await app.close();
  });

  it("body non valido → 400", async () => {
    const app = await buildServer(TEST_ENV, TEST_AI_ENV, TEST_SERVER_ENV, {
      searchProvider: new FakeSearchProvider(),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/prospecting/search",
      headers: await authHeaders(app),
      payload: { query: "x" }, // troppo corto (min 2)
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
