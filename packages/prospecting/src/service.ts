import type {
  Lead,
  ProspectSearchRequest,
  ProspectSearchResponse,
  WebsiteAnalysis,
} from "@businessbox/contracts";
import { analyzeWebsite } from "./analyzer.js";
import type { SearchProvider } from "./provider.js";

/** Esito del fetch di un sito (I/O iniettato: il service resta puro/testabile). */
export interface SiteFetchResult {
  reachable: boolean;
  https: boolean;
  html: string | null;
}

/** Contesto passato al generatore di proposta di valore (AI). */
export interface ValuePropositionInput {
  name: string;
  url: string | null;
  description: string;
  analysis: WebsiteAnalysis;
}

export interface ProspectingServiceDeps {
  searchProvider: SearchProvider;
  /** Scarica la home di un sito. Iniettato: nel route usa `fetch` reale. */
  fetchSite: (url: string) => Promise<SiteFetchResult>;
  /** Genera la bozza di proposta (AI). `null` se AI non disponibile. */
  generateValueProposition: (input: ValuePropositionInput) => Promise<string | null>;
  /** Iniettabile per i test. */
  now?: () => Date;
  /** Fetch/analisi concorrenti massimi. */
  concurrency?: number;
}

/** Hostname normalizzato (senza www) per de-duplicare più pagine dello stesso sito. */
function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** Esegue `task` su `items` con al più `limit` in parallelo, preservando l'ordine. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await task(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}

export class ProspectingService {
  constructor(private readonly deps: ProspectingServiceDeps) {}

  private get now(): Date {
    return (this.deps.now ?? (() => new Date()))();
  }

  async search(request: ProspectSearchRequest): Promise<ProspectSearchResponse> {
    const location = request.location?.trim() || null;
    if (!this.deps.searchProvider.isEnabled()) {
      return { query: request.query, location, leads: [], searchDisabled: true };
    }

    const q = [request.query, location].filter(Boolean).join(" ");
    // Cerchiamo più risultati del necessario: dopo la de-dup per dominio ne
    // restano meno (più pagine dello stesso sito collassano in un lead).
    const hits = await this.deps.searchProvider.search(q, Math.min(request.limit * 2, 20));

    // De-dup per dominio, mantenendo il primo (più rilevante) di ciascuno.
    const seen = new Set<string>();
    const unique = hits.filter((hit) => {
      const domain = domainOf(hit.url);
      if (seen.has(domain)) {
        return false;
      }
      seen.add(domain);
      return true;
    });
    const selected = unique.slice(0, request.limit);
    const currentYear = this.now.getFullYear();

    const leads = await mapWithConcurrency(
      selected,
      this.deps.concurrency ?? 5,
      async (hit): Promise<Lead> => {
        let site: SiteFetchResult;
        try {
          site = await this.deps.fetchSite(hit.url);
        } catch {
          site = { reachable: false, https: hit.url.startsWith("https://"), html: null };
        }
        const analysis = analyzeWebsite({
          url: hit.url,
          reachable: site.reachable,
          https: site.https,
          html: site.html,
          currentYear,
        });
        let valueProposition: string | null;
        try {
          valueProposition = await this.deps.generateValueProposition({
            name: hit.title,
            url: hit.url,
            description: hit.description,
            analysis,
          });
        } catch {
          valueProposition = null;
        }
        return {
          name: hit.title,
          url: hit.url,
          description: hit.description,
          analysis,
          valueProposition,
        };
      },
    );

    // Lead più caldi (score basso = più margine) in cima.
    leads.sort((a, b) => a.analysis.score - b.analysis.score);
    return { query: request.query, location, leads, searchDisabled: false };
  }
}
