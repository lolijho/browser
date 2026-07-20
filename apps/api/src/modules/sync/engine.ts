import { randomUUID } from "node:crypto";
import type {
  SyncEvent,
  SyncMutation,
  SyncMutationResult,
  SyncPullResponse,
  SyncPushResponse,
} from "@businessbox/contracts";
import type { Repositories, SyncedEntityRecord } from "../../data/types.js";

/** Entità con conflitti espliciti (mai LWW automatico): note e spostamenti pagina. */
const EXPLICIT_CONFLICT_TYPES = new Set(["note"]);

export interface SyncEngineDeps {
  repos: Repositories;
  now?: () => Date;
  newId?: () => string;
}

/**
 * Motore di sincronizzazione local-first (prompt 06):
 * - idempotency key per non duplicare;
 * - versioni per il rilevamento conflitti;
 * - tombstone per le eliminazioni;
 * - conflitti espliciti per note e spostamenti concorrenti;
 * - last-write-wins SOLO per campi semplici, documentato.
 */
export class SyncEngine {
  private readonly repos: Repositories;
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(deps: SyncEngineDeps) {
    this.repos = deps.repos;
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? (() => randomUUID());
  }

  async push(organizationId: string, mutations: SyncMutation[]): Promise<SyncPushResponse> {
    const results: SyncMutationResult[] = [];
    for (const mutation of mutations) {
      results.push(await this.applyOne(organizationId, mutation));
    }
    return {
      results,
      serverVersion: await this.repos.sync.currentServerVersion(organizationId),
    };
  }

  private async applyOne(
    organizationId: string,
    mutation: SyncMutation,
  ): Promise<SyncMutationResult> {
    // 1. Idempotenza: chiave già vista → restituisci l'esito precedente.
    const previous = await this.repos.sync.getIdempotentResult(
      organizationId,
      mutation.idempotencyKey,
    );
    if (previous) {
      return {
        idempotencyKey: mutation.idempotencyKey,
        status: "duplicate",
        ...(previous.newVersion !== undefined ? { newVersion: previous.newVersion } : {}),
      };
    }

    const existing = await this.repos.sync.getEntity(
      organizationId,
      mutation.entityType,
      mutation.entityId,
    );
    const serverVersion = existing?.version ?? 0;

    // 2. Conflitto di versione: il client non conosce l'ultima versione server.
    if (mutation.baseVersion !== serverVersion) {
      const conflict = await this.resolveStale(organizationId, mutation, existing);
      await this.finalize(organizationId, mutation.idempotencyKey, conflict);
      return conflict;
    }

    // 3. Applicazione normale (upsert o tombstone).
    const applied = await this.commit(organizationId, mutation, serverVersion + 1);
    await this.finalize(organizationId, mutation.idempotencyKey, applied);
    return applied;
  }

  /** Gestisce una mutazione basata su una versione superata. */
  private async resolveStale(
    organizationId: string,
    mutation: SyncMutation,
    existing: SyncedEntityRecord | null,
  ): Promise<SyncMutationResult> {
    const isMove =
      mutation.entityType === "page_card" &&
      existing !== null &&
      pickWorkBox(mutation.payload) !== pickWorkBox(existing.payload);

    if (EXPLICIT_CONFLICT_TYPES.has(mutation.entityType) || isMove) {
      // Conflitto esplicito: registra e rifiuta, la risoluzione è dell'utente.
      await this.repos.sync.recordConflict({
        id: this.newId(),
        organizationId,
        entityType: mutation.entityType,
        entityId: mutation.entityId,
        localPayload: mutation.payload,
        remotePayload: existing?.payload ?? null,
        detectedAt: this.now().toISOString(),
      });
      return {
        idempotencyKey: mutation.idempotencyKey,
        status: "conflict",
        reason: "concurrent_edit",
      };
    }

    // Campi semplici: last-write-wins per updatedAt (documentato).
    const serverUpdatedAt = existing ? Date.parse(existing.updatedAt) : 0;
    if (Date.parse(mutation.updatedAt) >= serverUpdatedAt) {
      return this.commit(organizationId, mutation, (existing?.version ?? 0) + 1);
    }
    return {
      idempotencyKey: mutation.idempotencyKey,
      status: "rejected",
      reason: "stale_write",
      ...(existing ? { newVersion: existing.version } : {}),
    };
  }

  private async commit(
    organizationId: string,
    mutation: SyncMutation,
    newVersion: number,
  ): Promise<SyncMutationResult> {
    const serverVersion = await this.repos.sync.nextServerVersion(organizationId);
    const deleted = mutation.operation === "delete";
    await this.repos.sync.saveEntity({
      organizationId,
      entityType: mutation.entityType,
      entityId: mutation.entityId,
      // Tombstone: payload null quando eliminato.
      payload: deleted ? null : mutation.payload,
      version: newVersion,
      serverVersion,
      operation: mutation.operation,
      updatedAt: mutation.updatedAt,
      deleted,
    });
    return { idempotencyKey: mutation.idempotencyKey, status: "applied", newVersion };
  }

  private async finalize(
    organizationId: string,
    key: string,
    result: SyncMutationResult,
  ): Promise<void> {
    await this.repos.sync.storeIdempotentResult(organizationId, key, {
      status: result.status,
      ...(result.newVersion !== undefined ? { newVersion: result.newVersion } : {}),
    });
  }

  async pull(organizationId: string, since: number, limit: number): Promise<SyncPullResponse> {
    const records = await this.repos.sync.pullSince(organizationId, since, limit + 1);
    const hasMore = records.length > limit;
    const page = hasMore ? records.slice(0, limit) : records;
    const events: SyncEvent[] = page.map((record) => ({
      serverVersion: record.serverVersion,
      entityType: record.entityType,
      entityId: record.entityId,
      operation: record.operation,
      payload: record.payload,
      updatedAt: record.updatedAt,
    }));
    const serverVersion =
      page.at(-1)?.serverVersion ?? (await this.repos.sync.currentServerVersion(organizationId));
    return { events, serverVersion, hasMore };
  }
}

/** Il campo di spostamento pagina usato per rilevare i move concorrenti. */
function pickWorkBox(payload: Record<string, unknown> | null): unknown {
  return payload?.["workBoxId"] ?? null;
}
