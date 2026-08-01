import { describe, expect, it } from "vitest";
import { analyzeWebsite } from "./analyzer.js";
import { parseBraveResults, FakeSearchProvider } from "./provider.js";
import { ProspectingService, type SiteFetchResult } from "./service.js";

const YEAR = 2026;

describe("analyzeWebsite", () => {
  it("nessun URL → nessun-sito, score 0 (lead caldissimo)", () => {
    const a = analyzeWebsite({
      url: null,
      reachable: false,
      https: false,
      html: null,
      currentYear: YEAR,
    });
    expect(a.hasWebsite).toBe(false);
    expect(a.issues).toContain("nessun-sito");
    expect(a.score).toBe(0);
  });

  it("sito irraggiungibile → issue irraggiungibile", () => {
    const a = analyzeWebsite({
      url: "https://x.example",
      reachable: false,
      https: true,
      html: null,
      currentYear: YEAR,
    });
    expect(a.issues).toContain("irraggiungibile");
    expect(a.reachable).toBe(false);
  });

  it("sito moderno e completo → nessun problema, score 100", () => {
    const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width">
      </head><body><h1>Studio Dentistico</h1><p>${"contenuto ".repeat(80)}</p>
      <a href="mailto:info@studio.it">Scrivici</a><form></form>
      <footer>© 2026 Studio</footer></body></html>`;
    const a = analyzeWebsite({
      url: "https://studio.it",
      reachable: true,
      https: true,
      html,
      currentYear: YEAR,
    });
    expect(a.issues).toEqual([]);
    expect(a.mobileFriendly).toBe(true);
    expect(a.hasContact).toBe(true);
    expect(a.score).toBe(100);
  });

  it("sito http, non mobile, senza contatti, datato e scarno → tanti problemi, score basso", () => {
    const html = `<html><body bgcolor="#fff"><font>Benvenuti</font>
      <p>© 2015 Ditta</p></body></html>`;
    const a = analyzeWebsite({
      url: "http://vecchio.example",
      reachable: true,
      https: false,
      html,
      currentYear: YEAR,
    });
    expect(a.issues).toEqual(
      expect.arrayContaining([
        "no-https",
        "non-mobile",
        "senza-contatti",
        "obsoleto",
        "poco-contenuto",
      ]),
    );
    expect(a.score).toBeLessThan(30);
  });
});

describe("parseBraveResults", () => {
  it("estrae i risultati web e rispetta il limite", () => {
    const payload = {
      web: {
        results: [
          { title: "A", url: "https://a.it", description: "desc a" },
          { title: "B", url: "https://b.it" },
          { url: "https://c.it" },
          { title: "senza url" },
        ],
      },
    };
    const hits = parseBraveResults(payload, 2);
    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatchObject({ title: "A", url: "https://a.it", description: "desc a" });
    expect(hits[1]?.description).toBe("");
  });

  it("payload malformato → array vuoto, nessun crash", () => {
    expect(parseBraveResults(null, 5)).toEqual([]);
    expect(parseBraveResults({ web: {} }, 5)).toEqual([]);
  });
});

describe("ProspectingService", () => {
  const disabledAiProp = () => Promise.resolve(null);

  it("provider disabilitato → searchDisabled, nessun lead", async () => {
    const svc = new ProspectingService({
      searchProvider: { isEnabled: () => false, search: () => Promise.resolve([]) },
      fetchSite: () => Promise.resolve({ reachable: false, https: false, html: null }),
      generateValueProposition: disabledAiProp,
      now: () => new Date("2026-01-01"),
    });
    const res = await svc.search({ query: "dentisti", limit: 5 });
    expect(res.searchDisabled).toBe(true);
    expect(res.leads).toEqual([]);
  });

  it("de-duplica per dominio e ordina i lead per score crescente", async () => {
    const provider = new FakeSearchProvider([
      { title: "Studio A - home", url: "https://a.it", description: "" },
      { title: "Studio A - contatti", url: "https://a.it/contatti", description: "" }, // stesso dominio
      { title: "Studio B", url: "http://b.it", description: "" },
    ]);
    const sites: Record<string, SiteFetchResult> = {
      "https://a.it": {
        reachable: true,
        https: true,
        html: `<meta name=viewport><a href="mailto:x@a.it">c</a>${"testo ".repeat(120)}`,
      },
      "http://b.it": { reachable: true, https: false, html: "<html>scarno</html>" },
    };
    const svc = new ProspectingService({
      searchProvider: provider,
      fetchSite: (url) =>
        Promise.resolve(sites[url] ?? { reachable: false, https: false, html: null }),
      generateValueProposition: (i) => Promise.resolve(`Proposta per ${i.name}`),
      now: () => new Date("2026-06-01"),
    });
    const res = await svc.search({ query: "studi", location: "Bologna", limit: 10 });
    // a.it appare due volte ma resta un solo lead → 2 lead totali.
    expect(res.leads).toHaveLength(2);
    // b.it (http, scarno) ha score più basso → primo.
    expect(res.leads[0]?.url).toBe("http://b.it");
    expect(res.leads[0]?.analysis.score).toBeLessThan(res.leads[1]!.analysis.score);
    expect(res.leads[0]?.valueProposition).toContain("Proposta per");
  });

  it("un fetch che lancia non rompe la ricerca (lead con sito irraggiungibile)", async () => {
    const svc = new ProspectingService({
      searchProvider: new FakeSearchProvider([
        { title: "X", url: "https://x.it", description: "" },
      ]),
      fetchSite: () => Promise.reject(new Error("timeout")),
      generateValueProposition: disabledAiProp,
      now: () => new Date("2026-01-01"),
    });
    const res = await svc.search({ query: "x", limit: 5 });
    expect(res.leads).toHaveLength(1);
    expect(res.leads[0]?.analysis.issues).toContain("irraggiungibile");
  });
});
