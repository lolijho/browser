import type { PageLifecycleState } from "@businessbox/contracts";
import {
  DEFAULT_MAX_HOT_PAGES,
  DEFAULT_MAX_WARM_PAGES,
  DEFAULT_WARM_TO_COLD_MS,
} from "@businessbox/shared";

export interface LifecycleConfig {
  maxHot: number;
  maxWarm: number;
  warmToColdMs: number;
}

export const DEFAULT_LIFECYCLE_CONFIG: LifecycleConfig = {
  maxHot: DEFAULT_MAX_HOT_PAGES,
  maxWarm: DEFAULT_MAX_WARM_PAGES,
  warmToColdMs: DEFAULT_WARM_TO_COLD_MS,
};

export interface LifecyclePageInput {
  id: string;
  workspaceId: string;
  pinned: boolean;
  archived: boolean;
  keepAlive: boolean;
  dirtyState: boolean;
  hasRenderer: boolean;
  lastActiveAt: string;
}

/**
 * Regole deterministiche hot/warm/cold (prompt 02):
 * - hot: pagina attiva + pinned del workspace attivo, entro maxHot;
 * - warm: renderer vivo non visibile, entro maxWarm e entro il timeout;
 * - cold: renderer distrutto;
 * - dirty/keepAlive: mai declassate a cold automaticamente;
 * - archiviate (non dirty, non keepAlive): sempre cold.
 */
export function computeDesiredLifecycle(
  pages: readonly LifecyclePageInput[],
  activePageId: string | null,
  activeWorkspaceId: string,
  config: LifecycleConfig,
  nowMs: number,
): Map<string, PageLifecycleState> {
  const result = new Map<string, PageLifecycleState>();
  const byRecency = (a: LifecyclePageInput, b: LifecyclePageInput) =>
    Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt);

  // 1. Candidati hot: attiva + pinned del workspace attivo (non archiviate).
  const hotIds = new Set<string>();
  const active = pages.find((p) => p.id === activePageId);
  if (active) {
    hotIds.add(active.id);
  }
  const pinnedActiveWs = pages
    .filter((p) => p.pinned && !p.archived && p.workspaceId === activeWorkspaceId)
    .sort(byRecency);
  for (const page of pinnedActiveWs) {
    if (hotIds.size >= config.maxHot) {
      break;
    }
    hotIds.add(page.id);
  }
  for (const id of hotIds) {
    result.set(id, "hot");
  }

  // 2. Il resto: warm se renderer vivo, recente e nei limiti; altrimenti cold.
  const rest = pages.filter((p) => !hotIds.has(p.id)).sort(byRecency);
  let warmCount = 0;
  for (const page of rest) {
    const protectedPage = page.dirtyState || page.keepAlive;

    if (!page.hasRenderer) {
      result.set(page.id, "cold");
      continue;
    }
    if (protectedPage) {
      // Mai distruggere automaticamente un renderer dirty o keep-alive.
      result.set(page.id, "warm");
      continue;
    }
    if (page.archived) {
      result.set(page.id, "cold");
      continue;
    }
    const idleMs = nowMs - Date.parse(page.lastActiveAt);
    if (warmCount < config.maxWarm && idleMs < config.warmToColdMs) {
      result.set(page.id, "warm");
      warmCount += 1;
    } else {
      result.set(page.id, "cold");
    }
  }

  return result;
}
