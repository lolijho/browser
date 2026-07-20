import { createServer, type Server } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import type { BrowserState, PageCard } from "@businessbox/contracts";

/**
 * Harness di performance (prompt 09). Misura e registra:
 * avvio shell, memoria con 1/4/10/30 PageCard, renderer vivi, restore da cold,
 * ricerca locale. I numeri vengono scritti in test-results/perf.json.
 *
 * Richiede il binario Electron: dove non disponibile (sandbox), si salta con
 * motivazione esplicita; gira in CI (Linux+xvfb). Nessuna misura viene inventata.
 */
const fixturesDir = join(__dirname, "fixtures");
const mainEntry = resolve(__dirname, "..", "..", "apps", "desktop", "out", "main", "index.js");

function resolveElectronBinary(): string | null {
  try {
    const pkgDir = resolve(require.resolve("electron/package.json"), "..");
    const pathFile = join(pkgDir, "path.txt");
    if (!existsSync(pathFile)) return null;
    const rel = readFileSync(pathFile, "utf8").trim();
    const bin = rel ? join(pkgDir, "dist", rel) : "";
    return bin && existsSync(bin) ? bin : null;
  } catch {
    return null;
  }
}

const electronBinary = resolveElectronBinary();
const desktopBuilt = existsSync(mainEntry);

function startFixtureServer(): Promise<{ server: Server; base: string }> {
  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const path = url.pathname === "/" ? "/ricerca.html" : url.pathname;
      try {
        const body = await readFile(join(fixturesDir, path.replace(/^\//, "")));
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end("not found");
      }
    })();
  });
  return new Promise((resolvePromise) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolvePromise({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

function call<T = unknown>(win: Page, method: string, ...args: unknown[]): Promise<T> {
  return win.evaluate(
    ({ method, args }) => {
      const api = (window as unknown as Record<string, Record<string, (...a: unknown[]) => Promise<unknown>>>)
        .businessbox;
      return api[method]!(...args);
    },
    { method, args },
  ) as Promise<T>;
}

const getState = (win: Page): Promise<BrowserState> => call<BrowserState>(win, "getBrowserState");

async function totalMemoryMb(app: ElectronApplication): Promise<{ mb: number; renderers: number }> {
  const metrics = await app.evaluate(({ app }) => app.getAppMetrics());
  const mb = metrics.reduce((sum, m) => sum + (m.memory?.workingSetSize ?? 0), 0) / 1024;
  const renderers = metrics.filter((m) => m.type === "Tab" || m.type === "renderer").length;
  return { mb: Math.round(mb), renderers };
}

test.describe.serial("Performance (prompt 09)", () => {
  let fixture: { server: Server; base: string };

  test.beforeAll(async () => {
    fixture = await startFixtureServer();
  });
  test.afterAll(async () => {
    await new Promise<void>((r) => fixture.server.close(() => r()));
  });

  test("misura avvio, memoria, renderer, restore e ricerca locale", async () => {
    test.skip(
      !electronBinary || !desktopBuilt,
      !electronBinary
        ? "Binario Electron non disponibile (egress bloccato). La misura gira in CI."
        : `Bundle desktop assente (${mainEntry}).`,
    );
    test.setTimeout(180_000);

    const dataDir = mkdtempSync(join(tmpdir(), "businessbox-perf-"));
    const startedAt = Date.now();
    const app = await electron.launch({
      executablePath: electronBinary ?? undefined,
      args: [mainEntry, `--user-data-dir=${dataDir}`],
      env: { ...process.env, NODE_ENV: "test" },
    });
    const win = await app.firstWindow();
    await win.waitForFunction(() => typeof (window as unknown as { businessbox?: unknown }).businessbox !== "undefined");
    await getState(win);
    const startupMs = Date.now() - startedAt;

    const memoryByPages: Record<string, { mb: number; renderers: number }> = {};
    const created: PageCard[] = [];
    const targets = [1, 4, 10, 30];
    let coldRestoreMs = 0;
    let firstColdPageId: string | null = null;

    for (let i = 0; i < 30; i += 1) {
      const page = await call<PageCard>(win, "createPage", {});
      await call(win, "navigate", page.id, `${fixture.base}/ricerca.html?n=${i}`);
      await call(win, "activatePage", page.id);
      created.push(page);
      if (targets.includes(i + 1)) {
        await new Promise((r) => setTimeout(r, 500));
        memoryByPages[String(i + 1)] = await totalMemoryMb(app);
      }
    }

    // Trova una pagina scesa a cold e misura il tempo di restore.
    const state = await getState(win);
    const cold = state.pages.find((p) => p.state === "cold");
    if (cold) {
      firstColdPageId = cold.id;
      const t0 = Date.now();
      await call(win, "activatePage", cold.id);
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        const s = await getState(win);
        const p = s.pages.find((x) => x.id === cold.id);
        if (p && p.hasView && p.state !== "cold") break;
        await new Promise((r) => setTimeout(r, 100));
      }
      coldRestoreMs = Date.now() - t0;
    }

    // Ricerca locale (full-text) su ciò che è stato indicizzato.
    const t1 = Date.now();
    await call(win, "searchLocal", { query: "imprenditori", limit: 20 });
    const localSearchMs = Date.now() - t1;

    const report = {
      generatedAt: new Date().toISOString(),
      startupMs,
      memoryByPages,
      coldRestoreMs,
      firstColdPageId,
      localSearchMs,
      note: "Numeri indicativi dell'ambiente CI; l'AI TTFT è misurato separatamente con backend reale.",
    };
    await mkdir(resolve(__dirname, "..", "..", "test-results"), { recursive: true });
    await writeFile(
      resolve(__dirname, "..", "..", "test-results", "perf.json"),
      JSON.stringify(report, null, 2),
    );
    // Asserzioni di sanità (non soglie rigide): la misura deve produrre valori.
    expect(startupMs).toBeGreaterThan(0);
    expect(Object.keys(memoryByPages).length).toBeGreaterThan(0);

    await app.close();
  });
});
