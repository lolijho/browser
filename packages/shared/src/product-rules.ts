/**
 * Regole di prodotto non negoziabili (CLAUDE.md / prompt 02).
 * Centralizzate qui perché condivise tra desktop, backend e test.
 */

/** Massimo numero di pagine bloccate nella barra superiore. */
export const MAX_PINNED_PAGES = 3;

/** Massimo numero di pagine "hot" (renderer vivo e visibile/pinned) per default. */
export const DEFAULT_MAX_HOT_PAGES = 4;

/** Massimo numero di pagine "warm" (renderer vivo ma non visibile) per default. */
export const DEFAULT_MAX_WARM_PAGES = 6;

/** Prefisso delle partizioni di sessione Chromium per workspace. */
export const WORKSPACE_SESSION_PREFIX = "persist:workspace-";

/** Costruisce la partizione di sessione per un workspace. */
export function workspaceSessionPartition(workspaceId: string): string {
  if (!workspaceId) {
    throw new Error("workspaceId non può essere vuoto");
  }
  return `${WORKSPACE_SESSION_PREFIX}${workspaceId}`;
}
