import { describe, expect, it } from "vitest";
import { classifyOmniboxInput } from "./omnibox.js";
import { StaticSearchEngineManager, resolveNavigationInput } from "./manager.js";
import { BUILT_IN_SEARCH_ENGINES } from "./engines.js";
import { validateSearchUrlTemplate } from "./template.js";

describe("classifyOmniboxInput", () => {
  it("riconosce URL http/https completi", () => {
    expect(classifyOmniboxInput("https://example.com/a?b=1")).toEqual({
      kind: "url",
      url: "https://example.com/a?b=1",
    });
    expect(classifyOmniboxInput("http://example.com")).toMatchObject({ kind: "url" });
  });

  it("riconosce domini senza schema e aggiunge https", () => {
    expect(classifyOmniboxInput("github.com")).toEqual({ kind: "url", url: "https://github.com/" });
    expect(classifyOmniboxInput("amazon.it/deals")).toMatchObject({ kind: "url" });
    expect(classifyOmniboxInput("example.com:8443")).toMatchObject({ kind: "url" });
  });

  it("riconosce localhost e IP", () => {
    expect(classifyOmniboxInput("localhost:3000/health")).toEqual({
      kind: "url",
      url: "http://localhost:3000/health",
    });
    expect(classifyOmniboxInput("192.168.1.10:8080")).toMatchObject({ kind: "url" });
  });

  it("tratta il testo con spazi come ricerca", () => {
    expect(classifyOmniboxInput("crm per pmi")).toEqual({ kind: "search", query: "crm per pmi" });
  });

  it("tratta parole singole senza punto come ricerca", () => {
    expect(classifyOmniboxInput("fatturazione")).toEqual({
      kind: "search",
      query: "fatturazione",
    });
  });

  it("NON tratta come URL gli schemi pericolosi", () => {
    for (const input of ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,x"]) {
      expect(classifyOmniboxInput(input).kind).toBe("search");
    }
  });

  it("lascia passare le route interne businessbox://", () => {
    expect(classifyOmniboxInput("businessbox://newtab")).toEqual({
      kind: "url",
      url: "businessbox://newtab",
    });
  });
});

describe("StaticSearchEngineManager", () => {
  const manager = new StaticSearchEngineManager();

  it("usa Google come default globale iniziale", () => {
    expect(manager.getDefaultEngine().id).toBe("google");
  });

  it("costruisce l'URL di ricerca con la query codificata", () => {
    expect(manager.buildSearchUrlForQuery("crm per pmi")).toBe(
      "https://www.google.com/search?q=crm%20per%20pmi",
    );
  });

  it("registry: template tutti validi e keyword univoche", () => {
    const keywords = new Set<string>();
    for (const engine of BUILT_IN_SEARCH_ENGINES) {
      expect(validateSearchUrlTemplate(engine.searchUrlTemplate).valid).toBe(true);
      expect(keywords.has(engine.keyword)).toBe(false);
      keywords.add(engine.keyword);
    }
    expect(BUILT_IN_SEARCH_ENGINES).toHaveLength(7);
  });
});

describe("resolveNavigationInput", () => {
  const manager = new StaticSearchEngineManager();

  it("un URL resta un URL", () => {
    expect(resolveNavigationInput("github.com", manager)).toBe("https://github.com/");
  });

  it("una ricerca va al motore di default", () => {
    expect(resolveNavigationInput("meteo milano", manager)).toBe(
      "https://www.google.com/search?q=meteo%20milano",
    );
  });
});
