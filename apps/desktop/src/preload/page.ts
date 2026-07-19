import { ipcRenderer } from "electron";
import { Readability } from "@mozilla/readability";
import { PAGE_IPC_CHANNELS, pageScrollEventSchema } from "@businessbox/contracts";

/**
 * Preload minimale iniettato nelle pagine remote (mondo isolato, sandbox).
 * NON espone nulla alla pagina (nessun contextBridge): osserva soltanto
 * interazioni per il dirty-state e la posizione di scroll.
 *
 * Regola non negoziabile (prompt 02): non leggere MAI i valori dei campi.
 * Qui si ispezionano solo tipo/attributi degli elementi, mai `value`.
 */

const SENSITIVE_INPUT_TYPES = new Set(["password", "hidden"]);
const SENSITIVE_AUTOCOMPLETE = /^(cc-|new-password|current-password|one-time-code)/i;
const SENSITIVE_NAME_OR_ID = /(pass|pwd|card|cvv|cvc|iban|token|otp|secret|pin\b)/i;

function isSensitiveField(element: Element): boolean {
  if (element instanceof HTMLInputElement) {
    if (SENSITIVE_INPUT_TYPES.has(element.type)) {
      return true;
    }
    if (SENSITIVE_AUTOCOMPLETE.test(element.autocomplete ?? "")) {
      return true;
    }
    if (SENSITIVE_NAME_OR_ID.test(element.name) || SENSITIVE_NAME_OR_ID.test(element.id)) {
      return true;
    }
  }
  return false;
}

function isTrackableField(element: EventTarget | null): element is Element {
  if (!(element instanceof Element)) {
    return false;
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return !isSensitiveField(element);
  }
  if (element instanceof HTMLElement && element.isContentEditable) {
    return true;
  }
  return false;
}

let dirty = false;

function sendDirty(value: boolean): void {
  if (dirty === value) {
    return;
  }
  dirty = value;
  ipcRenderer.send(PAGE_IPC_CHANNELS.dirtyChanged, { dirty: value });
}

document.addEventListener(
  "input",
  (event) => {
    if (isTrackableField(event.target)) {
      sendDirty(true);
    }
  },
  { capture: true, passive: true },
);

// Un submit riuscito in genere naviga (e il main azzera il dirty); per le SPA
// consideriamo comunque il submit come "modifiche consegnate".
document.addEventListener(
  "submit",
  () => {
    sendDirty(false);
  },
  { capture: true, passive: true },
);

// Scroll: throttling a 500ms, solo la coordinata Y (nessun contenuto).
let scrollTimer: ReturnType<typeof setTimeout> | null = null;
window.addEventListener(
  "scroll",
  () => {
    if (scrollTimer) {
      return;
    }
    scrollTimer = setTimeout(() => {
      scrollTimer = null;
      ipcRenderer.send(PAGE_IPC_CHANNELS.scrollChanged, { y: Math.max(0, window.scrollY) });
    }, 500);
  },
  { passive: true },
);

// Restore da cold: il main chiede di riportare la pagina alla posizione salvata.
ipcRenderer.on(PAGE_IPC_CHANNELS.restoreScroll, (_event, payload: unknown) => {
  const parsed = pageScrollEventSchema.safeParse(payload);
  if (parsed.success) {
    window.scrollTo({ top: parsed.data.y, behavior: "instant" });
  }
});

// OpenSearch (prompt 03): segnala al main il descriptor dichiarato dalla pagina.
// Solo rilevamento: nessuna installazione senza conferma dell'utente.
function detectOpenSearch(): void {
  const link = document.querySelector<HTMLLinkElement>(
    'link[rel~="search"][type="application/opensearchdescription+xml"]',
  );
  if (!link?.href) {
    return;
  }
  try {
    const absolute = new URL(link.href, window.location.href).href;
    ipcRenderer.send(PAGE_IPC_CHANNELS.openSearchDetected, {
      href: absolute.slice(0, 2048),
      title: (link.title || document.title || "").slice(0, 200),
    });
  } catch {
    // href non valido: ignora.
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", detectOpenSearch, { once: true });
} else {
  detectOpenSearch();
}

// ---------------------------------------------------------------------------
// Estrazione contenuti (fase 04): Readability nel mondo isolato.
// Regole: nessuno script eseguito, solo lettura DOM; MAI valori di input,
// cookie, token o storage; sanitizzazione e limiti severi; mai bloccante.
// ---------------------------------------------------------------------------

const collapse = (value: string): string =>
  value
    // Sanitizzazione: via i caratteri di controllo, poi spazi normalizzati.
    // eslint-disable-next-line no-control-regex -- rimozione volontaria dei control char
    .replaceAll(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replaceAll(/\s+/g, " ")
    .trim();

function extractOpenGraph(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const meta of document.querySelectorAll('meta[property^="og:"]')) {
    const property = meta.getAttribute("property");
    const content = meta.getAttribute("content");
    if (property && content && Object.keys(result).length < 20) {
      result[property.slice(0, 100)] = collapse(content).slice(0, 2000);
    }
  }
  return result;
}

function extractJsonLd(): string[] {
  const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')].slice(0, 10);
  const result: string[] = [];
  for (const script of scripts) {
    const raw = (script.textContent ?? "").slice(0, 20_000);
    try {
      JSON.parse(raw);
      result.push(raw);
    } catch {
      // JSON-LD malformato: scartato, mai eseguito.
    }
  }
  return result;
}

function extractLinks(): string[] {
  const seen = new Set<string>();
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    if (seen.size >= 25) {
      break;
    }
    try {
      const url = new URL(anchor.getAttribute("href") ?? "", window.location.href);
      if (url.protocol === "https:" || url.protocol === "http:") {
        url.hash = "";
        seen.add(url.href.slice(0, 2048));
      }
    } catch {
      // href non valido.
    }
  }
  return [...seen];
}

function extractTablesText(): string {
  return [...document.querySelectorAll("table")]
    .slice(0, 5)
    .map((table) => collapse(table.textContent ?? "").slice(0, 10_000))
    .filter((t) => t.length > 0)
    .join("\n")
    .slice(0, 50_000);
}

function runExtraction(): void {
  try {
    let readabilityText = "";
    let byline: string | null = null;
    let readabilityLang: string | null = null;
    try {
      const clone = document.cloneNode(true) as Document;
      const article = new Readability(clone, { charThreshold: 250 }).parse();
      readabilityText = article?.textContent ?? "";
      byline = article?.byline ?? null;
      readabilityLang = article?.lang ?? null;
    } catch {
      // Readability può fallire su pagine particolari: fallback sul body.
    }
    const text = collapse(readabilityText || document.body?.textContent || "").slice(0, 200_000);

    const headings = [...document.querySelectorAll("h1, h2, h3")]
      .slice(0, 30)
      .map((h) => collapse(h.textContent ?? "").slice(0, 300))
      .filter((h) => h.length > 0);

    const canonical =
      document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? null;
    const description =
      document.querySelector('meta[name="description"]')?.getAttribute("content") ?? null;
    const author =
      byline ?? document.querySelector('meta[name="author"]')?.getAttribute("content") ?? null;
    const publishedAt =
      document.querySelector('meta[property="article:published_time"]')?.getAttribute("content") ??
      null;
    const language = document.documentElement.lang || readabilityLang || null;

    ipcRenderer.send(PAGE_IPC_CHANNELS.snapshotExtracted, {
      url: window.location.href.slice(0, 2048),
      canonicalUrl: canonical ? canonical.slice(0, 2048) : null,
      title: collapse(document.title ?? "").slice(0, 500),
      description: description ? collapse(description).slice(0, 2000) : null,
      language: language ? language.slice(0, 20) : null,
      headings,
      text,
      openGraph: extractOpenGraph(),
      jsonLd: extractJsonLd(),
      author: author ? collapse(author).slice(0, 200) : null,
      publishedAt: publishedAt ? publishedAt.slice(0, 60) : null,
      links: extractLinks(),
      tablesText: extractTablesText(),
    });
  } catch {
    // L'estrazione non deve mai interferire con la pagina.
  }
}

let extractTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleExtraction(delayMs: number): void {
  if (extractTimer) {
    clearTimeout(extractTimer);
  }
  extractTimer = setTimeout(() => {
    extractTimer = null;
    runExtraction();
  }, delayMs);
}

if (document.readyState === "complete") {
  scheduleExtraction(1200);
} else {
  window.addEventListener("load", () => scheduleExtraction(1200), { once: true });
}

// SPA: il main chiede una nuova estrazione dopo did-navigate-in-page (debounce lato main).
ipcRenderer.on(PAGE_IPC_CHANNELS.requestExtract, () => scheduleExtraction(500));
