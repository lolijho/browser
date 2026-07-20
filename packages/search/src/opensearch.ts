import { QUERY_PLACEHOLDER, validateSearchUrlTemplate } from "./template.js";

export interface OpenSearchDescriptor {
  shortName: string;
  /** Template già convertito in formato %s e validato. */
  searchUrlTemplate: string;
}

/**
 * Estrae ShortName e template HTML da un descriptor OpenSearch (XML).
 * Parsing volutamente conservativo via regex (nessuna esecuzione, nessuna
 * entity expansion): se il documento non è nel formato atteso si rifiuta.
 */
export function parseOpenSearchDescriptor(xml: string): OpenSearchDescriptor | null {
  if (xml.length > 65536) {
    return null;
  }
  const shortName = /<ShortName>([^<]{1,60})<\/ShortName>/i.exec(xml)?.[1]?.trim();

  // Cerca il template HTML: <Url type="text/html" ... template="..."/>
  const urlTags = xml.match(/<Url\b[^>]*>/gi) ?? [];
  let template: string | null = null;
  for (const tag of urlTags) {
    const type = /type\s*=\s*"([^"]+)"/i.exec(tag)?.[1];
    if (type && type.toLowerCase() !== "text/html") {
      continue;
    }
    const raw = /template\s*=\s*"([^"]+)"/i.exec(tag)?.[1];
    if (raw) {
      template = raw;
      break;
    }
  }
  if (!shortName || !template) {
    return null;
  }

  const converted = convertOpenSearchTemplate(template);
  if (!converted) {
    return null;
  }
  return { shortName, searchUrlTemplate: converted };
}

/** Converte {searchTerms} nel placeholder %s e valida il risultato. */
export function convertOpenSearchTemplate(template: string): string | null {
  const decoded = template
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
  const converted = decoded.replaceAll(/\{searchTerms\??\}/gi, QUERY_PLACEHOLDER);
  // Parametri opzionali OpenSearch ({count?}, {startPage?}, …) vengono rimossi.
  const cleaned = converted.replaceAll(/=?\{[a-zA-Z:]+\?\}/g, "");
  if (!cleaned.includes(QUERY_PLACEHOLDER)) {
    return null;
  }
  return validateSearchUrlTemplate(cleaned).valid ? cleaned : null;
}
