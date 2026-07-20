import { describe, expect, it } from "vitest";
import { buildAppInfo } from "./app-info";

describe("buildAppInfo", () => {
  it("produce un AppInfo valido con il branding centralizzato", () => {
    const info = buildAppInfo({
      appVersion: "0.1.0",
      electronVersion: "43.0.0",
      chromeVersion: "132.0.0.0",
      nodeVersion: "22.0.0",
    });
    expect(info.productName).toBe("BusinessBox Browser");
    expect(info.releaseChannel).toBe("alpha");
  });

  it("rifiuta versioni vuote", () => {
    expect(() =>
      buildAppInfo({ appVersion: "", electronVersion: "x", chromeVersion: "x", nodeVersion: "x" }),
    ).toThrow();
  });
});
