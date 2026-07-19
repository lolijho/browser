import { describe, expect, it } from "vitest";
import { JOB_NAMES, SYSTEM_QUEUE_NAME } from "./queues.js";

describe("worker queues", () => {
  it("usa un nome coda stabile (contratto con l'API)", () => {
    expect(SYSTEM_QUEUE_NAME).toBe("businessbox-system");
  });

  it("dichiara i job in un registry tipizzato", () => {
    expect(Object.values(JOB_NAMES)).toContain("heartbeat");
  });
});
