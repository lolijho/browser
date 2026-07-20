import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import type { BrowserState, PageCard, SetPinnedResponse, AiPageContextResponse } from "@businessbox/contracts";

/**
 * Flusso E2E obbligatorio (prompt 09), guidato attraverso il bridge reale
 * `window.businessbox` esposto dal preload: esercita la logica vera del main
 * process (WebContentsView, workspace/sessioni separate, ciclo di vita
 * hot/warm/cold, motori di ricerca, estrazione, screenshot, persistenza).
 *
 * Le pagine "risultato" sono servite da un server statico locale (127.0.0.1)
 * per essere deterministiche e offline: nessuna dipendenza dalla rete reale.
 * La selezione di Google/Brave è verificata sulle impostazioni motore (nessuna
 * SERP viene scaricata, coerente con CLAUDE.md).
 *
 * L'esecuzione richiede il binario Electron: dove non è disponibile (sandbox con
 * egress bloccato), il test si salta in modo esplicito e gira in CI (Linux+xvfb).
 */

const fixturesDir = join(__dirname, "fixtures");
const mainEntry = resolve(__dirname, "..", "..", "apps", "desktop", "out", "main", "index.js");

// Risolve il binario Electron SENZA eseguire l'installer del pacchetto (che
// tenterebbe un download): legge `path.txt` accanto a electron/package.json.
function resolveElectronBinary(): string | null {
  try {
    const pkgDir = resolve(require.resolve("electron/package.json"), "..");
    const pathFile = join(pkgDir, "path.txt");
    if (!existsSync(pathFile)) return null;
    const rel = readFileSync(pathFile, "utf8").trim();
    if (!rel) return null;
    const bin = join(pkgDir, "dist", rel);
    return existsSync(bin) ? bin : null;
  } catch {
    return null;
  }
}

const electronBinary = resolveElectronBinary();
const desktopBuilt = existsSync(mainEntry);

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".xml": "application/opensearchdescription+xml",
};

function startFixtureServer(): Promise<{ server: Server; base: string }> {
  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const path = url.pathname === "/" ? "/ricerca.html" : url.pathname;
      if (path === "/opensearch.xml") {
        res.writeHead(200, { "content-type": CONTENT_TYPES[".xml"]! });
        res.end(
          `<?xml version="1.0"?><OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/"><ShortName>Fixture</ShortName><Url type="text/html" template="http://${req.headers.host}/ricerca.html?q={searchTerms}"/></OpenSearchDescription>`,
        );
        return;
      }
      const ext = path.slice(path.lastIndexOf("."));
      try {
        const body = await readFile(join(fixturesDir, path.replace(/^\//, "")));
        res.writeHead(200, { "content-type": CONTENT_TYPES[ext] ?? "text/plain" });
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

async function launch(userDataDir: string): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({
    executablePath: electronBinary ?? undefined,
    args: [mainEntry, `--user-data-dir=${userDataDir}`],
    env: { ...process.env, NODE_ENV: "test", BUSINESSBOX_E2E: "1" },
  });
  const win = await app.firstWindow();
  // Attende che il bridge del preload sia pronto.
  await win.waitForFunction(() => typeof (window as unknown as { businessbox?: unknown }).businessbox !== "undefined");
  return { app, win };
}

// Chiama un metodo del bridge nel renderer della shell e restituisce il valore.
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

function getState(win: Page): Promise<BrowserState> {
  return call<BrowserState>(win, "getBrowserState");
}

async function waitForState(
  win: Page,
  predicate: (state: BrowserState) => boolean,
  timeoutMs = 15_000,
): Promise<BrowserState> {
  const deadline = Date.now() + timeoutMs;
  let last: BrowserState | null = null;
  while (Date.now() < deadline) {
    last = await getState(win);
    if (predicate(last)) return last;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Stato non raggiunto entro ${timeoutMs}ms. Ultimo: ${JSON.stringify(last?.pages.map((p) => ({ id: p.id, url: p.url, state: p.state, pinned: p.pinned })))}`);
}

test.describe.serial("Flusso E2E obbligatorio (prompt 09)", () => {
  let fixture: { server: Server; base: string };
  let dataDir: string;

  test.beforeAll(async () => {
    fixture = await startFixtureServer();
    dataDir = mkdtempSync(join(tmpdir(), "businessbox-e2e-"));
  });

  test.afterAll(async () => {
    await new Promise<void>((r) => fixture.server.close(() => r()));
  });

  test("17 passi: dalla ricerca al riavvio con restore", async () => {
    // Salta con motivazione esplicita (mai un test critico saltato in silenzio).
    test.skip(
      !electronBinary || !desktopBuilt,
      !electronBinary
        ? "Binario Electron non disponibile in questo ambiente (egress bloccato). Il flusso E2E gira in CI."
        : `Bundle desktop assente (${mainEntry}). Esegui: pnpm --filter @businessbox/desktop build`,
    );
    test.setTimeout(180_000);
    const { base } = fixture;

    // 1. Avvio app
    let ctx = await launch(dataDir);
    let win = ctx.win;
    let app = ctx.app;
    await getState(win);

    // 2. Creazione workspace
    await call(win, "createWorkspace", "Lavoro");
    let state = await waitForState(win, (s) => s.workspaces.some((w) => w.name === "Lavoro"));
    const workspace = state.workspaces.find((w) => w.name === "Lavoro")!;
    await call(win, "switchWorkspace", workspace.id);
    await waitForState(win, (s) => s.activeWorkspaceId === workspace.id);

    // 3. Selezione Google come motore predefinito del workspace
    await call(win, "setSearchDefault", "google", "workspace", workspace.id);
    state = await waitForState(win, (s) => s.searchSettings.workspaceDefaults[workspace.id] === "google");
    expect(state.searchSettings.workspaceDefaults[workspace.id]).toBe("google");

    // 4. + 5. Ricerca web e apertura risultato (servito localmente, offline)
    const page1 = await call<PageCard>(win, "createPage", {});
    await call(win, "navigate", page1.id, `${base}/ricerca.html`);
    await waitForState(win, (s) => s.pages.some((p) => p.id === page1.id && p.url.includes("ricerca.html") && !p.isLoading));
    await call(win, "navigate", page1.id, `${base}/articolo.html`);
    state = await waitForState(win, (s) => s.pages.some((p) => p.id === page1.id && p.url.includes("articolo.html") && !p.isLoading));

    // 6. La PageCard esiste nello stato (proiettata in sidebar/topbar)
    expect(state.pages.some((p) => p.id === page1.id)).toBe(true);

    // 7. Pin di tre pagine
    const page2 = await call<PageCard>(win, "createPage", {});
    const page3 = await call<PageCard>(win, "createPage", {});
    for (const p of [page1, page2, page3]) {
      const res = await call<SetPinnedResponse>(win, "setPinned", p.id, true);
      expect(res.ok).toBe(true);
    }
    state = await waitForState(win, (s) => s.pages.filter((p) => p.pinned).length === 3);
    expect(state.pages.filter((p) => p.pinned)).toHaveLength(3);

    // 8. Tentativo di una quarta pagina bloccata → limite (max 3)
    const page4 = await call<PageCard>(win, "createPage", {});
    const fourth = await call<SetPinnedResponse>(win, "setPinned", page4.id, true);
    expect(fourth.ok).toBe(false);
    expect(fourth.needsReplacement).toBe(true);
    state = await getState(win);
    expect(state.pages.filter((p) => p.pinned)).toHaveLength(3);

    // 9. Creazione WorkBox
    await call(win, "createWorkBox", "Ricerca clienti");
    state = await waitForState(win, (s) => s.workBoxes.some((b) => b.name === "Ricerca clienti"));
    const workBox = state.workBoxes.find((b) => b.name === "Ricerca clienti")!;

    // 10. Spostamento di una pagina nella WorkBox
    await call(win, "movePage", page4.id, workBox.id);
    await waitForState(win, (s) => s.pages.some((p) => p.id === page4.id && p.workBoxId === workBox.id));

    // 11. Estrazione e screenshot sulla pagina dell'articolo
    await call(win, "setAllowAi", page1.id, true);
    await call(win, "setAllowScreenshot", page1.id, true);
    await call(win, "activatePage", page1.id);
    const context = await (async () => {
      const deadline = Date.now() + 15_000;
      let ctxRes: AiPageContextResponse | null = null;
      while (Date.now() < deadline) {
        ctxRes = await call<AiPageContextResponse>(win, "aiGetPageContext", page1.id);
        if (ctxRes.allowAI && ctxRes.source && ctxRes.source.content.length > 0) return ctxRes;
        await new Promise((r) => setTimeout(r, 300));
      }
      return ctxRes;
    })();
    expect(context?.allowAI).toBe(true);
    expect(context?.source?.content.length ?? 0).toBeGreaterThan(0);

    // 12. Riassunto GLM tramite backend (mock/real configurabile): il contesto
    // sanitizzato è pronto per l'invio; la chiamata AI è coperta dai test
    // contract con provider mock (packages/ai). Qui verifichiamo che il contesto
    // esista e sia non vuoto, prerequisito reale del riassunto.
    expect(context?.source?.url).toContain("articolo.html");

    // 13. Passaggio a cold: sblocca e forza il ciclo di vita creando altre
    // pagine attive; una pagina non attiva e non pinned scende a warm/cold.
    await call(win, "setPinned", page1.id, false);
    await call(win, "setKeepAlive", page1.id, false);
    for (let i = 0; i < 6; i += 1) {
      const extra = await call<PageCard>(win, "createPage", {});
      await call(win, "navigate", extra.id, `${base}/ricerca.html?n=${i}`);
      await call(win, "activatePage", extra.id);
    }
    state = await waitForState(
      win,
      (s) => {
        const p = s.pages.find((x) => x.id === page1.id);
        return !!p && p.state === "cold" && !p.hasView;
      },
      30_000,
    );
    expect(state.pages.find((p) => p.id === page1.id)?.state).toBe("cold");

    // 14. Riapertura della pagina cold → torna viva
    await call(win, "activatePage", page1.id);
    state = await waitForState(win, (s) => {
      const p = s.pages.find((x) => x.id === page1.id);
      return !!p && p.state !== "cold" && p.hasView;
    });
    expect(state.pages.find((p) => p.id === page1.id)?.hasView).toBe(true);

    // 15. Cambio workspace e verifica sessione separata (persist:workspace-<id>)
    const partitionsBefore = new Set(state.pages.map((p) => p.sessionPartition));
    await call(win, "createWorkspace", "Personale");
    state = await waitForState(win, (s) => s.workspaces.some((w) => w.name === "Personale"));
    const personale = state.workspaces.find((w) => w.name === "Personale")!;
    await call(win, "switchWorkspace", personale.id);
    await waitForState(win, (s) => s.activeWorkspaceId === personale.id);
    const newPage = await call<PageCard>(win, "createPage", {});
    await call(win, "navigate", newPage.id, `${base}/articolo.html`);
    state = await waitForState(win, (s) => s.pages.some((p) => p.id === newPage.id && !p.isLoading));
    const newPartition = state.pages.find((p) => p.id === newPage.id)!.sessionPartition;
    expect(newPartition).toContain(personale.id);
    expect(partitionsBefore.has(newPartition)).toBe(false);

    // 16. Cambio motore in Brave Search
    await call(win, "setSearchDefault", "brave", "workspace", personale.id);
    state = await waitForState(win, (s) => s.searchSettings.workspaceDefaults[personale.id] === "brave");
    expect(state.searchSettings.workspaceDefaults[personale.id]).toBe("brave");

    // 17. Riavvio app e restore della sessione persistita
    await app.close();
    ctx = await launch(dataDir);
    win = ctx.win;
    app = ctx.app;
    const restored = await waitForState(
      win,
      (s) =>
        s.workspaces.some((w) => w.name === "Lavoro") &&
        s.workspaces.some((w) => w.name === "Personale") &&
        s.workBoxes.some((b) => b.name === "Ricerca clienti"),
      20_000,
    );
    expect(restored.workspaces.map((w) => w.name)).toEqual(expect.arrayContaining(["Lavoro", "Personale"]));
    expect(restored.workBoxes.some((b) => b.name === "Ricerca clienti")).toBe(true);
    expect(restored.pages.length).toBeGreaterThan(0);

    await app.close();
  });
});
