import { BRANDING } from "@businessbox/shared";

/**
 * URL API iniettato a build time da `electron.vite.config.ts` a partire dalla
 * variabile d'ambiente `BUSINESSBOX_API_URL`. Vale stringa vuota se assente.
 */
declare const __BUSINESSBOX_API_URL__: string;

export interface ResolveApiBaseUrlOptions {
  /** Override a runtime (`BUSINESSBOX_API_URL`): utile in sviluppo e nei test. */
  runtime?: string | undefined;
  /** Valore compilato nel bundle al momento della build di release. */
  baked?: string | undefined;
  /** Fallback finale; default: il branding. */
  fallback?: string;
}

/**
 * Risolve l'URL base dell'API con precedenza runtime → build → branding.
 *
 * Serve perché il default del branding è `http://localhost:3000`: senza questo
 * meccanismo un'app impacchettata continuerebbe a cercare l'API sulla macchina
 * dell'utente, e login e AI non funzionerebbero mai contro un backend
 * realmente deployato (es. su Coolify).
 *
 * I valori non validi vengono scartati invece di far fallire l'avvio: il
 * browser deve restare utilizzabile anche con una configurazione sbagliata.
 */
export function resolveApiBaseUrl(options: ResolveApiBaseUrlOptions = {}): string {
  const fallback = options.fallback ?? BRANDING.defaultApiUrl;
  for (const candidate of [options.runtime, options.baked, fallback]) {
    const normalized = normalize(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return normalize(BRANDING.defaultApiUrl) ?? BRANDING.defaultApiUrl;
}

/** Accetta solo http/https e rimuove la barra finale, per non generare `//api/...`. */
function normalize(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  return parsed.origin + parsed.pathname.replace(/\/+$/, "");
}

/**
 * `true` se l'URL è in chiaro verso un host non locale: da segnalare, perché
 * ci viaggiano access token.
 */
export function isInsecureRemoteUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:") {
      return false;
    }
    return !["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

/** Risoluzione effettiva usata dall'applicazione. */
export function apiBaseUrlFromEnvironment(env: NodeJS.ProcessEnv = process.env): string {
  return resolveApiBaseUrl({
    runtime: env["BUSINESSBOX_API_URL"],
    baked: typeof __BUSINESSBOX_API_URL__ === "string" ? __BUSINESSBOX_API_URL__ : undefined,
  });
}
