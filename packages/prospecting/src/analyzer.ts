import type { WebsiteAnalysis, WebsiteIssue } from "@businessbox/contracts";

export interface WebsiteAnalysisInput {
  /** URL del sito, o null se l'attività non ne ha uno. */
  url: string | null;
  /** Il sito ha risposto (HTTP ok). */
  reachable: boolean;
  /** Servito su HTTPS. */
  https: boolean;
  /** HTML della home, o null se irraggiungibile / assente. */
  html: string | null;
  /** Anno corrente iniettato (testabilità: nessun Date.now nascosto). */
  currentYear: number;
}

/** Penalità di punteggio per problema (più problemi → lead più caldo). */
const PENALTY: Record<WebsiteIssue, number> = {
  "nessun-sito": 100,
  irraggiungibile: 70,
  "no-https": 25,
  "non-mobile": 25,
  "senza-contatti": 15,
  obsoleto: 20,
  "poco-contenuto": 15,
};

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasViewport(html: string): boolean {
  return /<meta[^>]+name=["']viewport["'][^>]*>/i.test(html) || /@media[^{]+\(/i.test(html);
}

function hasContact(html: string): boolean {
  return (
    /mailto:/i.test(html) ||
    /tel:\+?[0-9]/i.test(html) ||
    /<form[\s>]/i.test(html) ||
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(html)
  );
}

function looksObsolete(html: string, currentYear: number): boolean {
  // Marcatori di HTML datato.
  if (/<(font|marquee|center)\b/i.test(html) || /\bbgcolor=/i.test(html)) {
    return true;
  }
  // Anno di copyright vecchio: se l'anno più recente citato è < currentYear-3.
  const years = [...html.matchAll(/(?:©|&copy;|copyright)[^0-9]{0,12}(20\d{2})/gi)].map((m) =>
    Number(m[1]),
  );
  if (years.length > 0) {
    return Math.max(...years) < currentYear - 3;
  }
  return false;
}

/**
 * Analizza il sito pubblico di un'attività e ne deriva problemi + punteggio.
 * Pura: nessun I/O. Il fetch avviene a monte (nel service/route).
 */
export function analyzeWebsite(input: WebsiteAnalysisInput): WebsiteAnalysis {
  const issues: WebsiteIssue[] = [];

  if (!input.url) {
    issues.push("nessun-sito");
    return build(false, null, false, false, false, false, issues);
  }
  if (!input.reachable || input.html === null) {
    issues.push("irraggiungibile");
    return build(true, input.url, false, input.https, false, false, issues);
  }

  const html = input.html;
  if (!input.https) {
    issues.push("no-https");
  }
  const mobile = hasViewport(html);
  if (!mobile) {
    issues.push("non-mobile");
  }
  const contact = hasContact(html);
  if (!contact) {
    issues.push("senza-contatti");
  }
  if (looksObsolete(html, input.currentYear)) {
    issues.push("obsoleto");
  }
  if (stripTags(html).length < 500) {
    issues.push("poco-contenuto");
  }

  return build(true, input.url, true, input.https, mobile, contact, issues);
}

function build(
  hasWebsite: boolean,
  url: string | null,
  reachable: boolean,
  https: boolean,
  mobileFriendly: boolean,
  contact: boolean,
  issues: WebsiteIssue[],
): WebsiteAnalysis {
  const penalty = issues.reduce((sum, issue) => sum + PENALTY[issue], 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  return { hasWebsite, url, reachable, https, mobileFriendly, hasContact: contact, issues, score };
}
