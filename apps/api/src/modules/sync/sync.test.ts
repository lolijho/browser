import { describe, expect, it } from "vitest";
import type { SyncMutation } from "@businessbox/contracts";
import { createMemoryRepositories } from "../../data/memory.js";
import { SyncEngine } from "./engine.js";

const ORG = "11111111-1111-4111-8111-111111111111";

function mutation(overrides: Partial<SyncMutation> & { entityId: string }): SyncMutation {
  return {
    idempotencyKey: crypto.randomUUID(),
    entityType: "note",
    operation: "upsert",
    baseVersion: 0,
    payload: { content: "ciao" },
    updatedAt: "2026-07-19T10:00:00.000Z",
    ...overrides,
  };
}

describe("SyncEngine", () => {
  it("applica una nuova entità con versione 1 e avanza il cursore", async () => {
    const repos = createMemoryRepositories();
    const engine = new SyncEngine({ repos });
    const res = await engine.push(ORG, [
      mutation({ entityId: crypto.randomUUID(), entityType: "workspace", payload: { name: "W" } }),
    ]);
    expect(res.results[0]?.status).toBe("applied");
    expect(res.results[0]?.newVersion).toBe(1);
    expect(res.serverVersion).toBe(1);
  });

  it("l'idempotency key evita di duplicare la stessa mutazione (retry)", async () => {
    const repos = createMemoryRepositories();
    const engine = new SyncEngine({ repos });
    const m = mutation({
      entityId: crypto.randomUUID(),
      entityType: "workspace",
      payload: { name: "W" },
    });
    const first = await engine.push(ORG, [m]);
    const retry = await engine.push(ORG, [m]);
    expect(first.results[0]?.status).toBe("applied");
    expect(retry.results[0]?.status).toBe("duplicate");
    // Nessuna doppia scrittura: il cursore non avanza sul retry.
    expect(retry.serverVersion).toBe(1);
  });

  it("tombstone: un delete azzera il payload ma resta pullabile", async () => {
    const repos = createMemoryRepositories();
    const engine = new SyncEngine({ repos });
    const id = crypto.randomUUID();
    await engine.push(ORG, [
      mutation({ entityId: id, entityType: "task", payload: { title: "X" } }),
    ]);
    await engine.push(ORG, [
      mutation({
        entityId: id,
        entityType: "task",
        operation: "delete",
        baseVersion: 1,
        payload: null,
      }),
    ]);
    const pull = await engine.pull(ORG, 0, 100);
    const event = pull.events.find((e) => e.entityId === id);
    expect(event?.operation).toBe("delete");
    expect(event?.payload).toBeNull();
  });

  it("LWW per campi semplici: la scrittura più recente vince", async () => {
    const repos = createMemoryRepositories();
    const engine = new SyncEngine({ repos });
    const id = crypto.randomUUID();
    await engine.push(ORG, [
      mutation({
        entityId: id,
        entityType: "workspace",
        payload: { name: "vecchio" },
        updatedAt: "2026-07-19T10:00:00.000Z",
      }),
    ]);
    // Client basato su version 0 (superata) ma con timestamp più recente → vince.
    const res = await engine.push(ORG, [
      mutation({
        entityId: id,
        entityType: "workspace",
        payload: { name: "nuovo" },
        baseVersion: 0,
        updatedAt: "2026-07-19T12:00:00.000Z",
      }),
    ]);
    expect(res.results[0]?.status).toBe("applied");
    const entity = await repos.sync.getEntity(ORG, "workspace", id);
    expect(entity?.payload).toEqual({ name: "nuovo" });
  });

  it("LWW: una scrittura più vecchia su versione superata viene rifiutata", async () => {
    const repos = createMemoryRepositories();
    const engine = new SyncEngine({ repos });
    const id = crypto.randomUUID();
    await engine.push(ORG, [
      mutation({
        entityId: id,
        entityType: "workspace",
        payload: { name: "corrente" },
        updatedAt: "2026-07-19T12:00:00.000Z",
      }),
    ]);
    const res = await engine.push(ORG, [
      mutation({
        entityId: id,
        entityType: "workspace",
        payload: { name: "arretrato" },
        baseVersion: 0,
        updatedAt: "2026-07-19T09:00:00.000Z",
      }),
    ]);
    expect(res.results[0]?.status).toBe("rejected");
    expect((await repos.sync.getEntity(ORG, "workspace", id))?.payload).toEqual({
      name: "corrente",
    });
  });

  it("le note generano un conflitto esplicito su modifica concorrente", async () => {
    const repos = createMemoryRepositories();
    const engine = new SyncEngine({ repos });
    const id = crypto.randomUUID();
    await engine.push(ORG, [mutation({ entityId: id, payload: { content: "server" } })]);
    const res = await engine.push(ORG, [
      mutation({ entityId: id, baseVersion: 0, payload: { content: "client" } }),
    ]);
    expect(res.results[0]?.status).toBe("conflict");
    expect(await repos.sync.listConflicts(ORG)).toHaveLength(1);
  });

  it("spostamento pagina concorrente (workBoxId diverso) è un conflitto esplicito", async () => {
    const repos = createMemoryRepositories();
    const engine = new SyncEngine({ repos });
    const id = crypto.randomUUID();
    await engine.push(ORG, [
      mutation({ entityId: id, entityType: "page_card", payload: { workBoxId: "box-A" } }),
    ]);
    const res = await engine.push(ORG, [
      mutation({
        entityId: id,
        entityType: "page_card",
        baseVersion: 0,
        payload: { workBoxId: "box-B" },
      }),
    ]);
    expect(res.results[0]?.status).toBe("conflict");
  });

  it("pull incrementale con cursore e hasMore", async () => {
    const repos = createMemoryRepositories();
    const engine = new SyncEngine({ repos });
    for (let i = 0; i < 5; i += 1) {
      await engine.push(ORG, [
        mutation({
          entityId: crypto.randomUUID(),
          entityType: "workspace",
          payload: { name: `w${i}` },
        }),
      ]);
    }
    const firstPage = await engine.pull(ORG, 0, 2);
    expect(firstPage.events).toHaveLength(2);
    expect(firstPage.hasMore).toBe(true);
    const secondPage = await engine.pull(ORG, firstPage.serverVersion, 100);
    expect(secondPage.events).toHaveLength(3);
    expect(secondPage.hasMore).toBe(false);
  });

  it("isolamento tenant: un'org non vede le entità di un'altra", async () => {
    const repos = createMemoryRepositories();
    const engine = new SyncEngine({ repos });
    const other = "22222222-2222-4222-8222-222222222222";
    await engine.push(ORG, [
      mutation({
        entityId: crypto.randomUUID(),
        entityType: "workspace",
        payload: { name: "mio" },
      }),
    ]);
    expect((await engine.pull(other, 0, 100)).events).toHaveLength(0);
  });
});
