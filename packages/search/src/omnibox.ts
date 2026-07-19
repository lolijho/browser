/**
 * Classificazione dell'input dell'omnibox: URL oppure testo di ricerca.
 * Fase 01: distinzione URL/ricerca. L'intent parser completo
 * (comandi browser/AI, keyword motore, ricerca locale) arriva nella fase 03.
 */

export type OmniboxIntent = { kind: "url"; url: string } | { kind: "search"; query: string };

const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const HOST_RE = /^([\w-]+\.)+[a-zA-Z]{2,}(:\d{1,5})?$/;
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}(:\d{1,5})?$/;

const INTERNAL_SCHEME = "businessbox:";

function tryUrl(candidate: string): OmniboxIntent | null {
  try {
    return { kind: "url", url: new URL(candidate).toString() };
  } catch {
    return null;
  }
}

export function classifyOmniboxInput(raw: string): OmniboxIntent {
  const input = raw.trim();
  if (!input) {
    return { kind: "search", query: "" };
  }

  // "host:1234" non è uno schema: il colon seguito da una porta numerica
  // (es. localhost:3000, example.com:8443) va trattato come host.
  const colonIndex = input.indexOf(":");
  const looksLikeHostPort = colonIndex > 0 && /^\d{1,5}([/?#]|$)/.test(input.slice(colonIndex + 1));

  const schemeMatch = looksLikeHostPort ? null : SCHEME_RE.exec(input);
  if (schemeMatch) {
    const scheme = input.slice(0, input.indexOf(":")).toLowerCase() + ":";
    if (scheme === "http:" || scheme === "https:") {
      return tryUrl(input) ?? { kind: "search", query: input };
    }
    if (scheme === INTERNAL_SCHEME) {
      // Route interne (es. businessbox://newtab): la validazione finale spetta al main.
      return { kind: "url", url: input };
    }
    // Ogni altro schema (javascript:, file:, data:, ...) è trattato come ricerca.
    return { kind: "search", query: input };
  }

  if (/\s/.test(input)) {
    return { kind: "search", query: input };
  }

  const hostPart = input.split(/[/?#]/, 1)[0] ?? "";
  if (hostPart === "localhost" || hostPart.startsWith("localhost:")) {
    return tryUrl(`http://${input}`) ?? { kind: "search", query: input };
  }
  if (HOST_RE.test(hostPart) || IPV4_RE.test(hostPart)) {
    return tryUrl(`https://${input}`) ?? { kind: "search", query: input };
  }

  return { kind: "search", query: input };
}
