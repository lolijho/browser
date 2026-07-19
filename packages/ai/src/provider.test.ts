import { describe, expect, it } from "vitest";
import { AIDisabledError, DisabledAIProvider } from "./provider.js";

describe("DisabledAIProvider", () => {
  it("healthCheck riporta stato disabled", async () => {
    const provider = new DisabledAIProvider();
    const health = await provider.healthCheck();
    expect(health.status).toBe("disabled");
  });

  it("streamChat fallisce con AIDisabledError", async () => {
    const provider = new DisabledAIProvider();
    const iterate = async () => {
      for await (const _chunk of provider.streamChat({ messages: [] })) {
        // non deve mai produrre chunk
      }
    };
    await expect(iterate()).rejects.toThrow(AIDisabledError);
  });
});
