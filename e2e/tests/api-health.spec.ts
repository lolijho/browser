import { expect, test } from "@playwright/test";

test.describe("API health", () => {
  test("GET /health risponde ok", async ({ request }) => {
    const response = await request.get("/health");
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { status: string; service: string };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("api");
  });

  test("GET /health/live e /health/ready rispondono", async ({ request }) => {
    const live = await request.get("/health/live");
    expect(live.status()).toBe(200);

    const ready = await request.get("/health/ready");
    expect(ready.status()).toBe(200);
  });
});
