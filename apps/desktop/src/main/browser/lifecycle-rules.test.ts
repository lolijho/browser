import { describe, expect, it } from "vitest";
import { computeDesiredLifecycle, type LifecyclePageInput } from "./lifecycle-rules";

const NOW = Date.parse("2026-07-19T12:00:00.000Z");
const CONFIG = { maxHot: 4, maxWarm: 2, warmToColdMs: 60_000 };

function page(overrides: Partial<LifecyclePageInput> & { id: string }): LifecyclePageInput {
  return {
    workspaceId: "default",
    pinned: false,
    archived: false,
    keepAlive: false,
    dirtyState: false,
    hasRenderer: true,
    lastActiveAt: new Date(NOW - 1000).toISOString(),
    ...overrides,
  };
}

describe("computeDesiredLifecycle", () => {
  it("attiva e pinned sono hot, entro il limite", () => {
    const pages = [
      page({ id: "active" }),
      page({ id: "pin1", pinned: true }),
      page({ id: "pin2", pinned: true }),
      page({ id: "pin3", pinned: true }),
    ];
    const result = computeDesiredLifecycle(pages, "active", "default", CONFIG, NOW);
    expect(result.get("active")).toBe("hot");
    expect(result.get("pin1")).toBe("hot");
    expect(result.get("pin3")).toBe("hot");
  });

  it("le pinned di un altro workspace non sono hot", () => {
    const pages = [
      page({ id: "active" }),
      page({ id: "pinAltro", pinned: true, workspaceId: "w2" }),
    ];
    const result = computeDesiredLifecycle(pages, "active", "default", CONFIG, NOW);
    expect(result.get("pinAltro")).not.toBe("hot");
  });

  it("le non visibili recenti restano warm entro maxWarm, le eccedenti diventano cold", () => {
    const pages = [
      page({ id: "active" }),
      page({ id: "w1", lastActiveAt: new Date(NOW - 1000).toISOString() }),
      page({ id: "w2", lastActiveAt: new Date(NOW - 2000).toISOString() }),
      page({ id: "w3", lastActiveAt: new Date(NOW - 3000).toISOString() }),
    ];
    const result = computeDesiredLifecycle(pages, "active", "default", CONFIG, NOW);
    expect(result.get("w1")).toBe("warm");
    expect(result.get("w2")).toBe("warm");
    expect(result.get("w3")).toBe("cold");
  });

  it("una warm oltre il timeout passa a cold", () => {
    const pages = [
      page({ id: "active" }),
      page({ id: "stantia", lastActiveAt: new Date(NOW - CONFIG.warmToColdMs - 1).toISOString() }),
    ];
    const result = computeDesiredLifecycle(pages, "active", "default", CONFIG, NOW);
    expect(result.get("stantia")).toBe("cold");
  });

  it("dirty e keepAlive non vengono mai declassate a cold automaticamente", () => {
    const old = new Date(NOW - CONFIG.warmToColdMs * 10).toISOString();
    const pages = [
      page({ id: "active" }),
      page({ id: "dirty", dirtyState: true, lastActiveAt: old }),
      page({ id: "keep", keepAlive: true, lastActiveAt: old }),
    ];
    const result = computeDesiredLifecycle(pages, "active", "default", CONFIG, NOW);
    expect(result.get("dirty")).toBe("warm");
    expect(result.get("keep")).toBe("warm");
  });

  it("le archiviate senza protezioni sono cold anche se recenti", () => {
    const pages = [page({ id: "active" }), page({ id: "arch", archived: true })];
    const result = computeDesiredLifecycle(pages, "active", "default", CONFIG, NOW);
    expect(result.get("arch")).toBe("cold");
  });

  it("le pagine senza renderer sono cold", () => {
    const pages = [page({ id: "fredda", hasRenderer: false })];
    const result = computeDesiredLifecycle(pages, null, "default", CONFIG, NOW);
    expect(result.get("fredda")).toBe("cold");
  });
});
