import { MAX_PINNED_PAGES } from "@businessbox/shared";
import type { SetPinnedResponse } from "@businessbox/contracts";

/**
 * Regola di prodotto: massimo MAX_PINNED_PAGES pagine bloccate.
 * Pura e testabile; il flusso "scegli quale sostituire" arriva con la fase 02.
 */
export function evaluatePinRequest(
  pinnedIds: readonly string[],
  pageId: string,
  pinned: boolean,
): SetPinnedResponse {
  if (!pinned) {
    return { ok: true };
  }
  if (pinnedIds.includes(pageId)) {
    return { ok: true };
  }
  if (pinnedIds.length >= MAX_PINNED_PAGES) {
    return {
      ok: false,
      reason: `Limite di ${MAX_PINNED_PAGES} pagine bloccate raggiunto: sblocca prima una pagina.`,
    };
  }
  return { ok: true };
}
