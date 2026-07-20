import { defineConfig } from "@playwright/test";

/**
 * Base E2E (fase 00): verifica l'API reale avviata da Playwright.
 * I test Playwright su Electron e sul flusso browser completo
 * vengono aggiunti nelle fasi 01-02 e completati nella fase 09.
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
  },
  webServer: {
    command: "pnpm --filter @businessbox/api exec tsx src/index.ts",
    url: "http://127.0.0.1:3100/health",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      NODE_ENV: "test",
      API_HOST: "127.0.0.1",
      API_PORT: "3100",
      LOG_LEVEL: "warn",
    },
  },
});
