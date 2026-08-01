import { describe, expect, it } from "vitest";
import { BRANDING } from "@businessbox/shared";
import { isInsecureRemoteUrl, resolveApiBaseUrl } from "./api-url.js";

describe("resolveApiBaseUrl", () => {
  it("senza configurazione usa il default del branding", () => {
    expect(resolveApiBaseUrl({})).toBe(BRANDING.defaultApiUrl);
  });

  it("il valore compilato a build time vince sul branding", () => {
    expect(resolveApiBaseUrl({ baked: "https://api.esempio.it" })).toBe("https://api.esempio.it");
  });

  it("l'override a runtime vince su quello compilato", () => {
    expect(
      resolveApiBaseUrl({ runtime: "https://staging.esempio.it", baked: "https://api.esempio.it" }),
    ).toBe("https://staging.esempio.it");
  });

  it("rimuove la barra finale per non generare doppi slash nei percorsi", () => {
    expect(resolveApiBaseUrl({ baked: "https://api.esempio.it/" })).toBe("https://api.esempio.it");
  });

  it("conserva un eventuale prefisso di percorso", () => {
    expect(resolveApiBaseUrl({ baked: "https://esempio.it/backend/" })).toBe(
      "https://esempio.it/backend",
    );
  });

  it("ignora valori vuoti o composti da soli spazi", () => {
    expect(resolveApiBaseUrl({ runtime: "   ", baked: "https://api.esempio.it" })).toBe(
      "https://api.esempio.it",
    );
  });

  it("scarta URL non validi invece di rompere l'avvio", () => {
    expect(resolveApiBaseUrl({ runtime: "non-un-url", baked: "https://api.esempio.it" })).toBe(
      "https://api.esempio.it",
    );
  });

  it("rifiuta schemi diversi da http/https (es. file:)", () => {
    expect(resolveApiBaseUrl({ runtime: "file:///etc/passwd" })).toBe(BRANDING.defaultApiUrl);
  });
});

describe("isInsecureRemoteUrl", () => {
  it("http verso un host remoto è insicuro: ci viaggiano access token", () => {
    expect(isInsecureRemoteUrl("http://api.esempio.it")).toBe(true);
  });

  it("https è sempre accettabile", () => {
    expect(isInsecureRemoteUrl("https://api.esempio.it")).toBe(false);
  });

  it("http su localhost è normale in sviluppo", () => {
    expect(isInsecureRemoteUrl("http://localhost:3000")).toBe(false);
    expect(isInsecureRemoteUrl("http://127.0.0.1:3000")).toBe(false);
  });
});
