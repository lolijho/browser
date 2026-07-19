import { describe, expect, it } from "vitest";
import { buildSearchUrl, validateSearchUrlTemplate } from "./template.js";

describe("validateSearchUrlTemplate", () => {
  it("accetta un template HTTPS con %s", () => {
    expect(validateSearchUrlTemplate("https://www.google.com/search?q=%s").valid).toBe(true);
  });

  it("rifiuta template senza %s", () => {
    const result = validateSearchUrlTemplate("https://www.google.com/search?q=query");
    expect(result.valid).toBe(false);
  });

  it("rifiuta protocolli pericolosi", () => {
    for (const template of ["javascript:alert('%s')", "data:text/html,%s", "file:///tmp/%s"]) {
      expect(validateSearchUrlTemplate(template).valid).toBe(false);
    }
  });

  it("rifiuta HTTP non-localhost", () => {
    expect(validateSearchUrlTemplate("http://example.com/?q=%s").valid).toBe(false);
  });

  it("accetta localhost HTTP solo se esplicitamente consentito", () => {
    const template = "http://localhost:3000/search?q=%s";
    expect(validateSearchUrlTemplate(template).valid).toBe(false);
    expect(validateSearchUrlTemplate(template, { allowLocalhost: true }).valid).toBe(true);
  });
});

describe("buildSearchUrl", () => {
  it("codifica sempre la query", () => {
    const url = buildSearchUrl("https://search.brave.com/search?q=%s", "crm per pmi & startup");
    expect(url).toBe("https://search.brave.com/search?q=crm%20per%20pmi%20%26%20startup");
  });

  it("rifiuta template non validi", () => {
    expect(() => buildSearchUrl("javascript:alert(1)//%s", "x")).toThrow();
  });
});
