import { describe, expect, it, vi } from "vitest";
import { WorkspaceSessionManager } from "./workspace-session-manager";

describe("WorkspaceSessionManager", () => {
  it("due workspace producono partizioni persistenti distinte", () => {
    const factory = vi.fn((partition: string) => ({ partition }));
    const manager = new WorkspaceSessionManager(factory);

    const a = manager.getSession("11111111-1111-4111-8111-111111111111");
    const b = manager.getSession("22222222-2222-4222-8222-222222222222");

    expect(a.partition).toBe("persist:workspace-11111111-1111-4111-8111-111111111111");
    expect(b.partition).toBe("persist:workspace-22222222-2222-4222-8222-222222222222");
    expect(a.partition).not.toBe(b.partition);
    expect(manager.getKnownPartitions()).toHaveLength(2);
  });

  it("riusa la stessa sessione per lo stesso workspace", () => {
    const factory = vi.fn((partition: string) => ({ partition }));
    const manager = new WorkspaceSessionManager(factory);

    const first = manager.getSession("default");
    const second = manager.getSession("default");

    expect(first).toBe(second);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("rifiuta workspace id vuoti", () => {
    const manager = new WorkspaceSessionManager((partition: string) => ({ partition }));
    expect(() => manager.getSession("")).toThrow();
  });
});
