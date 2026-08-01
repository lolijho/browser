import type { SearchHit } from "@businessbox/contracts";

/**
 * Provider di ricerca web. Astratto per essere testabile senza chiave live e
 * per poter sostituire Brave con Bing/Google in futuro.
 *
 * Vincolo di prodotto: NIENTE scraping della SERP di Google. I risultati
 * arrivano da un'API licenziata; il browser poi apre le pagine reali.
 */
export interface SearchProvider {
  /** Cerca `query`, restituendo al più `limit` risultati. */
  search(query: string, limit: number): Promise<SearchHit[]>;
  /** L'API è configurata e utilizzabile. */
  isEnabled(): boolean;
}

/** Provider nullo: usato quando manca la chiave. Non scraping, nessun risultato. */
export class DisabledSearchProvider implements SearchProvider {
  isEnabled(): boolean {
    return false;
  }
  search(): Promise<SearchHit[]> {
    return Promise.resolve([]);
  }
}

export interface BraveSearchOptions {
  apiKey: string;
  baseUrl?: string;
  /** Mercato/lingua dei risultati (es. "it-IT"). */
  country?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Provider Brave Search (https://api.search.brave.com).
 * La chiave viaggia solo qui (lato backend), mai verso il client.
 */
export class BraveSearchProvider implements SearchProvider {
  private readonly baseUrl: string;

  constructor(private readonly options: BraveSearchOptions) {
    this.baseUrl = options.baseUrl ?? "https://api.search.brave.com/res/v1";
  }

  private get fetch(): typeof fetch {
    return this.options.fetchImpl ?? globalThis.fetch;
  }

  isEnabled(): boolean {
    return Boolean(this.options.apiKey);
  }

  async search(query: string, limit: number): Promise<SearchHit[]> {
    const params = new URLSearchParams({
      q: query,
      count: String(Math.min(Math.max(limit, 1), 20)),
    });
    if (this.options.country) {
      params.set("country", this.options.country);
    }
    const response = await this.fetch(`${this.baseUrl}/web/search?${params.toString()}`, {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": this.options.apiKey,
      },
    });
    if (!response.ok) {
      throw new Error(`Brave Search ha risposto ${response.status}`);
    }
    return parseBraveResults(await response.json(), limit);
  }
}

/** Estrae i risultati web dalla risposta Brave, difensivo su forma/tipi. */
export function parseBraveResults(payload: unknown, limit: number): SearchHit[] {
  const results =
    typeof payload === "object" && payload !== null
      ? (payload as { web?: { results?: unknown } }).web?.results
      : undefined;
  if (!Array.isArray(results)) {
    return [];
  }
  const hits: SearchHit[] = [];
  for (const raw of results) {
    if (typeof raw !== "object" || raw === null) {
      continue;
    }
    const item = raw as Record<string, unknown>;
    const url = typeof item["url"] === "string" ? item["url"] : "";
    if (!url) {
      continue;
    }
    hits.push({
      title: typeof item["title"] === "string" ? item["title"] : url,
      url,
      description: typeof item["description"] === "string" ? item["description"] : "",
    });
    if (hits.length >= limit) {
      break;
    }
  }
  return hits;
}

/** Provider finto per i test: restituisce risultati predefiniti. */
export class FakeSearchProvider implements SearchProvider {
  constructor(private readonly hits: SearchHit[] = []) {}
  isEnabled(): boolean {
    return true;
  }
  search(_query: string, limit: number): Promise<SearchHit[]> {
    return Promise.resolve(this.hits.slice(0, limit));
  }
}
