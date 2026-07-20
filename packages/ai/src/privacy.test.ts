import { describe, expect, it } from "vitest";
import { resolveAiPolicy } from "./policy.js";
import { sanitizeForLog, sanitizeUrlForLog } from "./sanitize.js";

describe("resolveAiPolicy — privacy modes (prompt 07)", () => {
  it("local-only blocca sempre l'AI cloud", () => {
    expect(resolveAiPolicy({ privacyMode: "local-only", privateMode: false, allowAI: true })).toBe(
      "block",
    );
  });

  it("allowAI=false blocca a prescindere dalla modalità", () => {
    expect(resolveAiPolicy({ privacyMode: "cloud-ai", privateMode: false, allowAI: false })).toBe(
      "block",
    );
  });

  it("modalità privata: bloccata salvo consenso esplicito temporaneo", () => {
    expect(resolveAiPolicy({ privacyMode: "cloud-ai", privateMode: true, allowAI: true })).toBe(
      "block",
    );
    expect(
      resolveAiPolicy({
        privacyMode: "cloud-ai",
        privateMode: true,
        allowAI: true,
        privateConsent: true,
      }),
    ).toBe("confirm");
  });

  it("confirm richiede conferma, cloud-ai consente", () => {
    expect(resolveAiPolicy({ privacyMode: "confirm", privateMode: false, allowAI: true })).toBe(
      "confirm",
    );
    expect(resolveAiPolicy({ privacyMode: "cloud-ai", privateMode: false, allowAI: true })).toBe(
      "allow",
    );
  });
});

describe("sanitizzazione URL e log (prompt 07)", () => {
  it("redige i parametri di query sensibili conservando host e path", () => {
    const clean = sanitizeUrlForLog(
      "https://app.example/callback?code=abc123&state=xyz&page=2#frag",
    );
    expect(clean).toContain("app.example/callback");
    expect(clean).toContain("code=%5BREDACTED%5D");
    expect(clean).toContain("state=%5BREDACTED%5D");
    expect(clean).toContain("page=2");
    expect(clean).not.toContain("#frag");
  });

  it("sanitizeForLog redige credenziali e URL con query private nella stessa riga", () => {
    const line =
      "GET https://app.example/x?token=SEGRETO Authorization: Bearer abcdef123456789012345";
    const clean = sanitizeForLog(line);
    expect(clean).not.toContain("SEGRETO");
    expect(clean).not.toContain("abcdef123456789012345");
  });
});
