import { describe, expect, it } from "vitest";
import { BRANDING } from "./branding.js";

describe("BRANDING", () => {
  it("espone il bundle identifier richiesto", () => {
    expect(BRANDING.bundleId).toBe("com.businessbox.browser");
  });

  it("usa il canale alpha in questa fase", () => {
    expect(BRANDING.releaseChannel).toBe("alpha");
  });

  it("ha un URL API valido", () => {
    expect(() => new URL(BRANDING.defaultApiUrl)).not.toThrow();
  });
});
