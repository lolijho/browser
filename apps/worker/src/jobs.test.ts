import { describe, expect, it, vi } from "vitest";
import { QUEUE_NAMES, createInMemoryJobContext, runIdempotent } from "./jobs.js";

describe("runIdempotent", () => {
  it("esegue il lavoro la prima volta e lo salta al retry (stesso contentHash)", async () => {
    const ctx = createInMemoryJobContext();
    const work = vi.fn(() => Promise.resolve());

    const first = await runIdempotent(ctx, "summary", "hash-1", work);
    const retry = await runIdempotent(ctx, "summary", "hash-1", work);

    expect(first.status).toBe("done");
    expect(retry.status).toBe("skipped");
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("contentHash diversi vengono elaborati entrambi", async () => {
    const ctx = createInMemoryJobContext();
    const work = vi.fn(() => Promise.resolve());
    await runIdempotent(ctx, "embedding", "hash-a", work);
    await runIdempotent(ctx, "embedding", "hash-b", work);
    expect(work).toHaveBeenCalledTimes(2);
  });

  it("kind diversi sullo stesso hash sono indipendenti", async () => {
    const ctx = createInMemoryJobContext();
    const work = vi.fn(() => Promise.resolve());
    const s = await runIdempotent(ctx, "summary", "h", work);
    const e = await runIdempotent(ctx, "embedding", "h", work);
    expect(s.status).toBe("done");
    expect(e.status).toBe("done");
  });

  it("registra le code richieste dal prompt", () => {
    expect(Object.values(QUEUE_NAMES)).toEqual(
      expect.arrayContaining([
        "businessbox-classification",
        "businessbox-summary",
        "businessbox-embedding",
        "businessbox-dedup",
        "businessbox-cleanup",
        "businessbox-email",
        "businessbox-sync",
      ]),
    );
  });
});
