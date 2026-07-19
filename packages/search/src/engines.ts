import type { SearchEngine } from "./types.js";

/**
 * Registry centralizzato dei motori preinstallati (prompt 03).
 * I template vivono SOLO qui, mai sparsi nel codice.
 */

const CREATED_AT = "2026-01-01T00:00:00.000Z";

function builtIn(
  id: string,
  name: string,
  keyword: string,
  searchUrlTemplate: string,
): SearchEngine {
  return {
    id,
    name,
    keyword,
    searchUrlTemplate,
    type: "built-in",
    scope: "global",
    enabled: true,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}

export const BUILT_IN_SEARCH_ENGINES: readonly SearchEngine[] = [
  builtIn("google", "Google", "g", "https://www.google.com/search?q=%s"),
  builtIn("brave", "Brave Search", "br", "https://search.brave.com/search?q=%s"),
  builtIn("bing", "Bing", "b", "https://www.bing.com/search?q=%s"),
  builtIn("duckduckgo", "DuckDuckGo", "d", "https://duckduckgo.com/?q=%s"),
  builtIn("startpage", "Startpage", "s", "https://www.startpage.com/sp/search?query=%s"),
  builtIn("qwant", "Qwant", "q", "https://www.qwant.com/?q=%s"),
  builtIn("ecosia", "Ecosia", "e", "https://www.ecosia.org/search?q=%s"),
];

/** Default globale iniziale (prompt 03): Google. */
export const DEFAULT_SEARCH_ENGINE_ID = "google";
