import { BUILT_IN_SEARCH_ENGINES, DEFAULT_SEARCH_ENGINE_ID } from "./engines.js";
import { classifyOmniboxInput } from "./omnibox.js";
import { buildSearchUrl } from "./template.js";
import type { SearchEngine } from "./types.js";

/**
 * Astrazione del gestore motori (prompt 00/01): la shell instrada le ricerche
 * SOLO attraverso questa interfaccia. L'implementazione completa e configurabile
 * (default per workspace/privato, custom, keyword, OpenSearch) arriva nella fase 03.
 */
export interface SearchEngineManager {
  listEngines(): readonly SearchEngine[];
  getDefaultEngine(): SearchEngine;
  buildSearchUrlForQuery(query: string): string;
}

/** Implementazione statica di fase 01: registry built-in, default Google. */
export class StaticSearchEngineManager implements SearchEngineManager {
  constructor(
    private readonly engines: readonly SearchEngine[] = BUILT_IN_SEARCH_ENGINES,
    private readonly defaultEngineId: string = DEFAULT_SEARCH_ENGINE_ID,
  ) {}

  listEngines(): readonly SearchEngine[] {
    return this.engines;
  }

  getDefaultEngine(): SearchEngine {
    const engine = this.engines.find((e) => e.id === this.defaultEngineId && e.enabled);
    if (!engine) {
      throw new Error(`Motore di ricerca di default non trovato: ${this.defaultEngineId}`);
    }
    return engine;
  }

  buildSearchUrlForQuery(query: string): string {
    return buildSearchUrl(this.getDefaultEngine().searchUrlTemplate, query);
  }
}

/**
 * Risolve l'input dell'omnibox in un URL navigabile:
 * URL riconosciuti passano invariati, il resto diventa una ricerca col motore di default.
 */
export function resolveNavigationInput(input: string, manager: SearchEngineManager): string {
  const intent = classifyOmniboxInput(input);
  if (intent.kind === "url") {
    return intent.url;
  }
  return manager.buildSearchUrlForQuery(intent.query);
}
