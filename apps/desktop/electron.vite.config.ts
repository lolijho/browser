import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// I package workspace sono ESM: vengono inclusi nel bundle (non externalizzati)
// perché main e preload sono emessi in CJS.
const bundledWorkspacePackages = [
  "@businessbox/shared",
  "@businessbox/contracts",
  "@businessbox/search",
  "@businessbox/database",
  "@mozilla/readability",
];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: bundledWorkspacePackages })],
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: bundledWorkspacePackages })],
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
