/**
 * Logica di autorizzazione della dashboard admin, isolata dal runtime Next per
 * essere testabile e verificabile in modo indipendente.
 *
 * Postura: deny-by-default. La decisione è una tra:
 * - `allow`          → credenziali valide (o path pubblico esente);
 * - `unauthorized`   → credenziali assenti o errate (chiedi Basic Auth);
 * - `not-configured` → nessuna password impostata: fail-closed (503).
 */
export type AuthDecision = "allow" | "unauthorized" | "not-configured";

/** Path raggiungibili senza credenziali (es. healthcheck del container). */
export const PUBLIC_PATHS = ["/api/health"];

/** Confronto a tempo costante: non rivela la lunghezza né i byte corretti. */
export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i += 1) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** Decodifica base64 senza dipendere da `Buffer` (disponibile su edge runtime). */
function decodeBase64(value: string): string {
  try {
    return atob(value);
  } catch {
    return "";
  }
}

export interface EvaluateInput {
  pathname: string;
  authorizationHeader: string | null;
  expectedUser: string;
  expectedPassword: string;
}

/**
 * Decisione di accesso. Valuta SEMPRE utente e password (niente short-circuit)
 * per non far trapelare quale dei due è errato.
 */
export function evaluateAccess(input: EvaluateInput): AuthDecision {
  if (isPublicPath(input.pathname)) {
    return "allow";
  }
  if (!input.expectedPassword) {
    return "not-configured";
  }
  const header = input.authorizationHeader ?? "";
  if (!header.startsWith("Basic ")) {
    return "unauthorized";
  }
  const decoded = decodeBase64(header.slice(6));
  const separator = decoded.indexOf(":");
  const providedUser = separator >= 0 ? decoded.slice(0, separator) : "";
  const providedPassword = separator >= 0 ? decoded.slice(separator + 1) : "";
  const userOk = timingSafeEqual(providedUser, input.expectedUser);
  const passwordOk = timingSafeEqual(providedPassword, input.expectedPassword);
  return userOk && passwordOk ? "allow" : "unauthorized";
}
