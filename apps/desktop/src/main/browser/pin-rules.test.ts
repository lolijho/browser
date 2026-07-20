import { describe, expect, it } from "vitest";
import { evaluatePinRequest } from "./pin-rules";

describe("evaluatePinRequest", () => {
  it("consente il pin sotto il limite", () => {
    expect(evaluatePinRequest(["a", "b"], "c", true).ok).toBe(true);
  });

  it("rifiuta la quarta pagina pinned", () => {
    const result = evaluatePinRequest(["a", "b", "c"], "d", true);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("3");
  });

  it("consente sempre l'unpin e il re-pin di una pagina già pinned", () => {
    expect(evaluatePinRequest(["a", "b", "c"], "a", true).ok).toBe(true);
    expect(evaluatePinRequest(["a", "b", "c"], "a", false).ok).toBe(true);
  });
});
