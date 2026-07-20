import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// I package workspace sono ESM: vengono inclusi nel bundle (non externalizzati)
// perché main e preload sono emessi in CJS. Il packaging include solo `out/**`
// (nessun node_modules), quindi anche electron-updater va bundlato nel main.
const bundledWorkspacePackages = [
  "@businessbox/ai",
  "@businessbox/shared",
  "@businessbox/contracts",
  "@businessbox/search",
  "@businessbox/database",
  "@mozilla/readability",
  "electron-updater",
];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: bundledWorkspacePackages })],
  },
  preload: {
    // I preload girano in sandbox: il loro `require` è ristretto e NON può
    // caricare né chunk relativi né moduli node (es. zod). Vanno quindi emessi
    // come file UNICI e autonomi. Perciò: bundliamo anche `zod` (niente
    // `require("zod")`) e disattiviamo il code-splitting (niente `./chunks/*`).
    plugins: [externalizeDepsPlugin({ exclude: [...bundledWorkspacePackages, "zod"] })],
    build: {
      rollupOptions: {
        input: {
          // index: preload della shell; page: preload isolato per le pagine remote.
          index: resolve(__dirname, "src/preload/index.ts"),
          page: resolve(__dirname, "src/preload/page.ts"),
        },
      },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
  },
});
