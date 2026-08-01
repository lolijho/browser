import { z } from "zod";

/**
 * Prospecting B2B (lead generation).
 *
 * Flusso: l'utente cerca una categoria+zona → si scoprono attività tramite
 * un'API di ricerca licenziata (Brave Search: nessuno scraping della SERP) →
 * per ciascuna si analizza il sito pubblico → l'AI genera una proposta di
 * valore → i lead vengono salvati come lista in una WorkBox.
 */

/** Richiesta di ricerca prospect: categoria/attività + località. */
export const prospectSearchRequestSchema = z.object({
  /** Cosa cercare, es. "dentisti", "idraulici", "agenzie immobiliari". */
  query: z.string().min(2).max(200),
  /** Località, es. "Bologna", "Milano centro". Opzionale. */
  location: z.string().max(200).optional(),
  /** Quanti risultati analizzare (costo/tempo crescono col numero). */
  limit: z.number().int().min(1).max(20).default(10),
});
export type ProspectSearchRequest = z.infer<typeof prospectSearchRequestSchema>;

/** Un risultato grezzo dell'API di ricerca. */
export const searchHitSchema = z.object({
  title: z.string(),
  url: z.string(),
  description: z.string().default(""),
});
export type SearchHit = z.infer<typeof searchHitSchema>;

/** Problemi rilevabili sul sito di un'attività (= leve per la proposta). */
export const websiteIssueSchema = z.enum([
  "nessun-sito", // l'attività non ha un sito → massima opportunità
  "irraggiungibile", // il sito non risponde
  "no-https", // manca il certificato
  "non-mobile", // nessun viewport / non responsive
  "senza-contatti", // nessuna email/telefono/form visibile
  "obsoleto", // segnali di sito datato (anno vecchio, tecnologie vetuste)
  "poco-contenuto", // pagina quasi vuota
]);
export type WebsiteIssue = z.infer<typeof websiteIssueSchema>;

/** Esito dell'analisi del sito pubblico di un'attività. */
export const websiteAnalysisSchema = z.object({
  hasWebsite: z.boolean(),
  url: z.string().nullable(),
  reachable: z.boolean(),
  https: z.boolean(),
  mobileFriendly: z.boolean(),
  hasContact: z.boolean(),
  issues: z.array(websiteIssueSchema),
  /** 0-100: più basso = più margine di miglioramento = lead più caldo. */
  score: z.number().int().min(0).max(100),
});
export type WebsiteAnalysis = z.infer<typeof websiteAnalysisSchema>;

/** Un lead: attività trovata + analisi + proposta di valore generata. */
export const leadSchema = z.object({
  name: z.string(),
  url: z.string().nullable(),
  description: z.string().default(""),
  analysis: websiteAnalysisSchema,
  /** Bozza di proposta di valore (mai inviata automaticamente). */
  valueProposition: z.string().nullable(),
});
export type Lead = z.infer<typeof leadSchema>;

export const prospectSearchResponseSchema = z.object({
  query: z.string(),
  location: z.string().nullable(),
  leads: z.array(leadSchema),
  /** Il provider di ricerca non è configurato (manca la chiave). */
  searchDisabled: z.boolean().default(false),
});
export type ProspectSearchResponse = z.infer<typeof prospectSearchResponseSchema>;
