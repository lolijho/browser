/** Segnaposto obbligatorio nei template di ricerca. */
export const QUERY_PLACEHOLDER = "%s";

const FORBIDDEN_PROTOCOLS = ["javascript:", "data:", "file:", "vbscript:"];

export interface TemplateValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Valida un template di ricerca secondo le regole del prompt 03:
 * HTTPS (o localhost in sviluppo), `%s` obbligatorio, protocolli pericolosi bloccati.
 */
export function validateSearchUrlTemplate(
  template: string,
  options: { allowLocalhost?: boolean } = {},
): TemplateValidationResult {
  const trimmed = template.trim();
  const lower = trimmed.toLowerCase();

  for (const protocol of FORBIDDEN_PROTOCOLS) {
    if (lower.startsWith(protocol)) {
      return { valid: false, reason: `Protocollo non consentito: ${protocol}` };
    }
  }

  if (!trimmed.includes(QUERY_PLACEHOLDER)) {
    return { valid: false, reason: `Il template deve contenere ${QUERY_PLACEHOLDER}` };
  }

  let url: URL;
  try {
    // `%s` è un segnaposto valido dentro un URL, il parse non lo altera.
    url = new URL(trimmed);
  } catch {
    return { valid: false, reason: "Il template non è un URL valido" };
  }

  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(options.allowLocalhost && isLocalhost)) {
    return { valid: false, reason: "Il template deve usare HTTPS" };
  }

  // Nessuna API key nel template (prompt 03): parametri dal nome sospetto con
  // valore fisso (non %s) vengono rifiutati.
  const SENSITIVE_PARAM_RE = /^(api_?key|apikey|token|secret|auth[_-]?token|access[_-]?token)$/i;
  for (const [key, value] of url.searchParams) {
    if (SENSITIVE_PARAM_RE.test(key) && value !== QUERY_PLACEHOLDER) {
      return { valid: false, reason: `Il template non può contenere credenziali (${key})` };
    }
  }

  return { valid: true };
}

/**
 * Costruisce l'URL di ricerca sostituendo il segnaposto con la query codificata.
 * La query è sempre passata attraverso `encodeURIComponent`.
 */
export function buildSearchUrl(template: string, query: string): string {
  const validation = validateSearchUrlTemplate(template, { allowLocalhost: true });
  if (!validation.valid) {
    throw new Error(`Template di ricerca non valido: ${validation.reason}`);
  }
  return template.replaceAll(QUERY_PLACEHOLDER, encodeURIComponent(query));
}
