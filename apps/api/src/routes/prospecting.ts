import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { prospectSearchRequestSchema } from "@businessbox/contracts";
import {
  ProspectingService,
  type SearchProvider,
  type SiteFetchResult,
  type ValuePropositionInput,
} from "@businessbox/prospecting";
import { normalizeAiError, type AIProvider } from "@businessbox/ai";

export interface ProspectingRouteDeps {
  searchProvider: SearchProvider;
  aiProvider: AIProvider;
  requireAuth: preHandlerHookHandler;
  /** Iniettabile per i test. */
  fetchImpl?: typeof fetch;
}

/** Timeout per il fetch di un sito prospect: non deve bloccare la ricerca. */
const SITE_FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 400_000;

/**
 * Rotte prospecting (M8+). Autenticate: la ricerca consuma quota Brave/AI a
 * carico dell'operatore, e i lead sono dati dell'organizzazione.
 *
 * Vincolo: nessuno scraping della SERP di Google. La scoperta usa Brave Search
 * (API licenziata); il fetch avviene poi sulle pagine reali delle attività.
 */
export function registerProspectingRoutes(app: FastifyInstance, deps: ProspectingRouteDeps): void {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;

  const fetchSite = async (url: string): Promise<SiteFetchResult> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SITE_FETCH_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          // Presentarsi come un browser normale (coerente col fix UA desktop).
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      const https = response.url.startsWith("https://") || url.startsWith("https://");
      if (!response.ok) {
        return { reachable: false, https, html: null };
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("html")) {
        return { reachable: true, https, html: "" };
      }
      const html = (await response.text()).slice(0, MAX_HTML_BYTES);
      return { reachable: true, https, html };
    } catch {
      return { reachable: false, https: url.startsWith("https://"), html: null };
    } finally {
      clearTimeout(timer);
    }
  };

  const generateValueProposition = async (input: ValuePropositionInput): Promise<string | null> => {
    const problems =
      input.analysis.issues.length > 0
        ? input.analysis.issues.join(", ")
        : "nessun problema evidente";
    const system =
      "Sei un consulente commerciale. Scrivi in italiano una breve proposta di valore (max 90 " +
      "parole) per contattare a freddo un'attività, partendo dai problemi rilevati sul suo sito. " +
      "Tono professionale e concreto, niente promesse esagerate. Chiudi con una call to action " +
      "leggera. Non inventare dati che non hai.";
    const user =
      `Attività: ${input.name}\n` +
      `Sito: ${input.url ?? "nessun sito"}\n` +
      `Descrizione: ${input.description || "n/d"}\n` +
      `Problemi rilevati: ${problems}\n` +
      `Punteggio sito (0=pessimo,100=ottimo): ${input.analysis.score}`;
    try {
      let text = "";
      for await (const chunk of deps.aiProvider.streamChat({
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      })) {
        if (chunk.type === "text") {
          text += chunk.text;
        } else if (chunk.type === "error") {
          return null;
        }
      }
      return text.trim() || null;
    } catch {
      return null; // AI non disponibile: il lead resta senza proposta, non è un errore fatale.
    }
  };

  const service = new ProspectingService({
    searchProvider: deps.searchProvider,
    fetchSite,
    generateValueProposition,
  });

  app.post(
    "/api/v1/prospecting/search",
    { preHandler: deps.requireAuth },
    async (request, reply) => {
      const parsed = prospectSearchRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_request" });
      }
      try {
        const result = await service.search(parsed.data);
        return reply.send(result);
      } catch (error) {
        const normalized = normalizeAiError(error);
        app.log.warn({ prospectingError: normalized.code }, "prospecting_search_failed");
        return reply.code(502).send({ error: "prospecting_failed" });
      }
    },
  );
}
