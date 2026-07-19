import { ipcRenderer } from "electron";
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
