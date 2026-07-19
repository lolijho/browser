import { beforeEach, describe, expect, it } from "vitest";
import { ConfigurableSearchEngineManager } from "./manager.js";
import { BUILT_IN_SEARCH_ENGINES } from "./engines.js";
import { validateSearchUrlTemplate } from "./template.js";
import { convertOpenSearchTemplate, parseOpenSearchDescriptor } from "./opensearch.js";

describe("ConfigurableSearchEngineManager", () => {
  let manager: ConfigurableSearchEngineManager;

  beforeEach(() => {
    manager = new ConfigurableSearchEngineManager();
  });

  it("registry: 7 built-in con template validi e keyword univoche", () => {
    const keywords = new Set<string>();
    for (const engine of BUILT_IN_SEARCH_ENGINES) {
      expect(validateSearchUrlTemplate(engine.searchUrlTemplate).valid).toBe(true);
      expect(keywords.has(engine.keyword)).toBe(false);
      keywords.add(engine.keyword);
    }
    expect(BUILT_IN_SEARCH_ENGINES).toHaveLength(7);
  });

  it("default: globale Google, privato Brave", () => {
    expect(manager.getGlobalDefault().id).toBe("google");
    expect(manager.getPrivateDefault().id).toBe("brave");
    expect(manager.getDefaultFor({ privateMode: true }).id).toBe("brave");
  });

  it("si può passare da Google a Brave senza riavvio", () => {
    expect(manager.setDefault("global", "brave").ok).toBe(true);
    expect(manager.getGlobalDefault().id).toBe("brave");
    expect(manager.resolveNavigation("crm per pmi")).toContain("search.brave.com");
  });

  it("il workspace eredita il globale oppure mantiene il proprio motore", () => {
    expect(manager.getDefaultFor({ workspaceId: "ws1" }).id).toBe("google");
    manager.setDefault("workspace", "ecosia", "ws1");
    expect(manager.getDefaultFor({ workspaceId: "ws1" }).id).toBe("ecosia");
    expect(manager.getDefaultFor({ workspaceId: "ws2" }).id).toBe("google");
    manager.clearWorkspaceDefault("ws1");
    expect(manager.getDefaultFor({ workspaceId: "ws1" }).id).toBe("google");
  });

  it("':br crm per pmi' apre Brave Search; la query successiva torna al default", () => {
    const first = manager.resolveNavigation(":br crm per pmi");
    expect(first).toBe("https://search.brave.com/search?q=crm%20per%20pmi");
    const second = manager.resolveNavigation("crm per pmi");
    expect(second).toBe("https://www.google.com/search?q=crm%20per%20pmi");
  });

  it("supporta gli alias /google /brave /bing /duck", () => {
    expect(manager.resolveNavigation("/duck meteo")).toContain("duckduckgo.com");
    expect(manager.resolveNavigation("/brave meteo")).toContain("search.brave.com");
    expect(manager.resolveNavigation("/google meteo")).toContain("google.com");
    expect(manager.resolveNavigation("/bing meteo")).toContain("bing.com");
  });

  it("precedenze: keyword > URL > dominio > ricerca web", () => {
    // keyword vince
    expect(manager.resolveNavigation(":d github.com")).toContain("duckduckgo.com");
    // URL completo resta URL
    expect(manager.resolveNavigation("https://github.com")).toBe("https://github.com/");
    // dominio diventa https
    expect(manager.resolveNavigation("github.com")).toBe("https://github.com/");
    // resto: ricerca col default
    expect(manager.resolveNavigation("come fare un preventivo")).toContain("google.com/search");
  });

  it("override temporaneo: tutto l'input diventa query e non viene persistito", () => {
    const url = manager.resolveNavigation("github.com", { engineOverrideId: "qwant" });
    expect(url).toBe("https://www.qwant.com/?q=github.com");
    expect(manager.getGlobalDefault().id).toBe("google");
  });

  it("keyword sconosciuta: l'input resta una ricerca normale", () => {
    expect(manager.resolveNavigation(":zz qualcosa")).toContain("google.com/search");
  });

  it("un motore custom valido funziona", () => {
    const added = manager.addCustomEngine({
      name: "Docs interni",
      keyword: "docs",
      searchUrlTemplate: "https://docs.azienda.example/search?q=%s",
    });
    expect(added.ok).toBe(true);
    expect(manager.resolveNavigation(":docs fattura")).toBe(
      "https://docs.azienda.example/search?q=fattura",
    );
  });

  it("template pericolosi o con credenziali vengono rifiutati", () => {
    for (const searchUrlTemplate of [
      "javascript:alert('%s')",
      "http://insecure.example/?q=%s",
      "https://ok.example/?q=abc",
      "https://ok.example/?q=%s&api_key=SEGRETO123",
    ]) {
      const result = manager.addCustomEngine({
        name: "X",
        keyword: `k${Math.abs(searchUrlTemplate.length)}`,
        searchUrlTemplate,
      });
      expect(result.ok).toBe(false);
    }
  });

  it("keyword duplicata nello stesso scope viene rifiutata", () => {
    const clash = manager.addCustomEngine({
      name: "Finto Google",
      keyword: "g",
      searchUrlTemplate: "https://fake.example/?q=%s",
    });
    expect(clash.ok).toBe(false);
    expect(clash.reason).toContain("g");
  });

  it("i built-in non si possono rimuovere; i custom sì (con reset dei default)", () => {
    expect(manager.removeEngine("google").ok).toBe(false);
    const added = manager.addCustomEngine({
      name: "Temp",
      keyword: "tmp",
      searchUrlTemplate: "https://tmp.example/?q=%s",
    });
    const engineId = added.engine?.id ?? "";
    manager.setDefault("global", engineId);
    expect(manager.removeEngine(engineId).ok).toBe(true);
    expect(manager.getGlobalDefault().id).toBe("google");
  });

  it("import/export: roundtrip conserva custom e default", () => {
    manager.addCustomEngine({
      name: "Docs",
      keyword: "docs",
      searchUrlTemplate: "https://docs.example/?q=%s",
    });
    manager.setDefault("global", "brave");
    const exported = manager.exportSettings();

    const fresh = new ConfigurableSearchEngineManager();
    expect(fresh.importSettings(exported).ok).toBe(true);
    expect(fresh.getGlobalDefault().id).toBe("brave");
    expect(fresh.resolveNavigation(":docs x")).toContain("docs.example");
  });

  it("import rifiuta JSON malformato o template pericolosi", () => {
    expect(manager.importSettings("{non json").ok).toBe(false);
    const malicious = manager
      .exportSettings()
      .replace("https://www.google.com/search?q=%s", "https://www.google.com/search?q=%s");
    expect(manager.importSettings(malicious).ok).toBe(true);
  });
});

describe("OpenSearch", () => {
  it("converte {searchTerms} in %s e valida https", () => {
    expect(convertOpenSearchTemplate("https://shop.example/s?q={searchTerms}")).toBe(
      "https://shop.example/s?q=%s",
    );
    expect(convertOpenSearchTemplate("http://shop.example/s?q={searchTerms}")).toBeNull();
    expect(convertOpenSearchTemplate("https://shop.example/s?q=fisso")).toBeNull();
  });

  it("estrae ShortName e template HTML dal descriptor", () => {
    const xml = `<?xml version="1.0"?>
      <OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
        <ShortName>Shop</ShortName>
        <Url type="application/x-suggestions+json" template="https://shop.example/sugg?q={searchTerms}"/>
        <Url type="text/html" template="https://shop.example/search?q={searchTerms}&amp;src=os"/>
      </OpenSearchDescription>`;
    const descriptor = parseOpenSearchDescriptor(xml);
    expect(descriptor?.shortName).toBe("Shop");
    expect(descriptor?.searchUrlTemplate).toBe("https://shop.example/search?q=%s&src=os");
  });

  it("rifiuta descriptor senza template html valido", () => {
    expect(parseOpenSearchDescriptor("<OpenSearchDescription/>")).toBeNull();
  });

  it("il motore OpenSearch NON viene installato senza conferma (dedupe incluso)", () => {
    const manager = new ConfigurableSearchEngineManager();
    const before = manager.listEngines().length;
    // Il rilevamento produce solo una proposta: l'installazione avviene soltanto
    // chiamando addOpenSearchEngine dopo la conferma dell'utente.
    const added = manager.addOpenSearchEngine({
      name: "Shop",
      keyword: "shop.example",
      searchUrlTemplate: "https://shop.example/search?q=%s",
    });
    expect(added.ok).toBe(true);
    expect(manager.listEngines().length).toBe(before + 1);
    const again = manager.addOpenSearchEngine({
      name: "Shop",
      keyword: "shop.example",
      searchUrlTemplate: "https://shop.example/search?q=%s",
    });
    expect(again.ok).toBe(false);
  });
});
