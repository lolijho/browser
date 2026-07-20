import { defineConfig } from "@playwright/test";

/**
 * Config Playwright per il flusso E2E su Electron (prompt 09).
 * Non usa `webServer`: l'app viene lanciata da `_electron.launch` nei test,
 * che gestiscono anche il server statico locale delle fixture.
 *
 * Richiede il bundle desktop compilato:
 *   pnpm --filter @businessbox/desktop build
 * In CI gira su Linux con xvfb (vedi .github/workflows/desktop-release.yml).
 */
export default defineConfig({
  testDir: "./electron",
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["json", { outputFile: "../test-results/e2e-electron.json" }]] : [["list"]],
});
