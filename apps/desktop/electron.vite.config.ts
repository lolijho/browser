import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import type { Plugin } from "vite";
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

/**
 * I preload girano in sandbox: il loro `require` è ristretto e NON può caricare
 * chunk relativi (`./chunks/*.js`). Con due entry (index + page) che importano
 * lo stesso codice (`@businessbox/contracts` + zod), Rollup estrae comunque un
 * chunk condiviso: al load il preload va in eccezione e `contextBridge` non
 * espone nulla. Questo plugin, a fine build, inlina il contenuto di ogni chunk
 * dentro le entry che lo richiedono e rimuove la cartella `chunks/`, così ogni
 * preload resta un file CJS autonomo.
 */
function inlinePreloadChunks(): Plugin {
  return {
    name: "inline-preload-chunks",
    apply: "build",
    closeBundle() {
      const preloadDir = resolve(__dirname, "out/preload");
      const chunksDir = resolve(preloadDir, "chunks");
      if (!existsSync(chunksDir)) {
        return;
      }
      const chunks: Record<string, string> = {};
      for (const file of readdirSync(chunksDir)) {
        if (file.endsWith(".js")) {
          chunks[file] = readFileSync(resolve(chunksDir, file), "utf8");
        }
      }
      for (const entry of readdirSync(preloadDir)) {
        if (!entry.endsWith(".js")) {
          continue;
        }
        const entryPath = resolve(preloadDir, entry);
        const original = readFileSync(entryPath, "utf8");
        const patched = original.replace(
          /(?:const|var|let)\s+(\w+)\s*=\s*require\("\.\/chunks\/([^"]+)"\);/g,
          (match, varName: string, chunkFile: string) => {
            const chunk = chunks[chunkFile];
            if (!chunk) {
              return match;
            }
            return (
              `const ${varName} = (function(){ const module = { exports: {} }; ` +
              `const exports = module.exports;\n${chunk}\nreturn module.exports; })();`
            );
          },
        );
        if (patched !== original) {
          writeFileSync(entryPath, patched);
        }
      }
      rmSync(chunksDir, { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: bundledWorkspacePackages })],
  },
  preload: {
    // Bundliamo anche `zod` (niente `require("zod")`) e inliniamo i chunk
    // condivisi (vedi inlinePreloadChunks) così i preload restano file unici.
    plugins: [
      externalizeDepsPlugin({ exclude: [...bundledWorkspacePackages, "zod"] }),
      inlinePreloadChunks(),
    ],
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
