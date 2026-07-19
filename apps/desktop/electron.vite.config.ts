import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

// I package workspace sono ESM: vengono inclusi nel bundle (non externalizzati)
// perché main e preload sono emessi in CJS.
const bundledWorkspacePackages = ["@businessbox/shared", "@businessbox/contracts"];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: bundledWorkspacePackages })],
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: bundledWorkspacePackages })],
  },
  renderer: {
    plugins: [react()],
  },
});
