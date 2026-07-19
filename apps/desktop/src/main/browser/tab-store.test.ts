import { describe, expect, it } from "vitest";
import { TabStore } from "./tab-store";

describe("TabStore — regole Smart Tabs", () => {
  it("la nuova pagina attivata diventa l'attiva del workspace", () => {
    const store = new TabStore();
    const a = store.createPage({ url: "https://a.example" });
    store.activatePage(a.id);
    const b = store.createPage({ url: "https://b.example" });
    store.activatePage(b.id);
    expect(store.getActivePageId()).toBe(b.id);
  });

  it("top bar = attiva + pinned: le non pinned restano solo in sidebar", () => {
    const store = new TabStore();
    const a = store.createPage({ url: "https://a.example" });
    store.activatePage(a.id);
    const b = store.createPage({ url: "https://b.example" });
    store.activatePage(b.id);
    const snapshot = store.getSnapshot(null);
    const topBar = snapshot.pages.filter(
      (p) => p.id === snapshot.activePageId || (p.pinned && !p.archived),
    );
    expect(topBar.map((p) => p.id)).toEqual([b.id]);
    // "a" non è chiusa: resta recuperabile in sidebar.
    expect(snapshot.pages.some((p) => p.id === a.id)).toBe(true);
  });

  it("non permette più di tre pinned e chiede quale sostituire", () => {
    const store = new TabStore();
    const ids = ["1", "2", "3", "4"].map(
      (n) => store.createPage({ url: `https://p${n}.example` }).id,
    );
    expect(store.setPinned(ids[0]!, true).ok).toBe(true);
    expect(store.setPinned(ids[1]!, true).ok).toBe(true);
    expect(store.setPinned(ids[2]!, true).ok).toBe(true);

    const fourth = store.setPinned(ids[3]!, true);
    expect(fourth.ok).toBe(false);
    expect(fourth.needsReplacement).toBe(true);
    expect(fourth.pinnedIds).toHaveLength(3);

    const replaced = store.setPinned(ids[3]!, true, ids[0]!);
    expect(replaced.ok).toBe(true);
    expect(store.getCard(ids[0]!)?.pinned).toBe(false);
    expect(store.getCard(ids[3]!)?.pinned).toBe(true);
  });

  it("chiudere dalla barra archivia (non elimina) e sceglie un ripiego", () => {
    const store = new TabStore();
    const a = store.createPage({ url: "https://a.example" });
    store.activatePage(a.id);
    const b = store.createPage({ url: "https://b.example" });
    store.activatePage(b.id);

    store.archivePage(b.id, true);
    expect(store.getCard(b.id)).toBeDefined();
    expect(store.getCard(b.id)?.archived).toBe(true);
    expect(store.getActivePageId()).toBeNull();
    expect(store.pickFallbackPageId(store.getActiveWorkspaceId())).toBe(a.id);
  });

  it("l'eliminazione definitiva di una pagina dirty richiede conferma", () => {
    const store = new TabStore();
    const page = store.createPage({ url: "https://form.example" });
    store.setDirty(page.id, true);

    const attempt = store.deletePage(page.id);
    expect(attempt.ok).toBe(false);
    expect(attempt.needsConfirmation).toBe(true);
    expect(store.getCard(page.id)).toBeDefined();

    const forced = store.deletePage(page.id, true);
    expect(forced.ok).toBe(true);
    expect(store.getCard(page.id)).toBeUndefined();
  });

  it("dirty imposta keepAlive temporaneo", () => {
    const store = new TabStore();
    const page = store.createPage({ url: "https://form.example" });
    store.setDirty(page.id, true);
    expect(store.getCard(page.id)?.keepAlive).toBe(true);
  });

  it("dieci pagine aperte restano tutte recuperabili", () => {
    const store = new TabStore();
    for (let i = 0; i < 10; i += 1) {
      const page = store.createPage({ url: `https://sito${i}.example` });
      store.activatePage(page.id);
    }
    expect(store.getSnapshot(null).pages).toHaveLength(10);
  });

  it("le pagine usano la partizione di sessione del proprio workspace", () => {
    const store = new TabStore();
    const wsB = store.createWorkspace("Cliente B");
    const inDefault = store.createPage({ url: "https://a.example" });
    const inB = store.createPage({ url: "https://b.example", workspaceId: wsB.id });
    expect(inDefault.sessionPartition).toBe("persist:workspace-default");
    expect(inB.sessionPartition).toBe(`persist:workspace-${wsB.id}`);
    expect(inDefault.sessionPartition).not.toBe(inB.sessionPartition);
  });

  it("drag and drop: movePage aggiorna il modello e valida il workspace", () => {
    const store = new TabStore();
    const box = store.createWorkBox("Fornitori");
    const page = store.createPage({ url: "https://f.example" });
    store.movePage(page.id, box.id);
    expect(store.getCard(page.id)?.workBoxId).toBe(box.id);
    store.movePage(page.id, null);
    expect(store.getCard(page.id)?.workBoxId).toBeNull();

    const wsB = store.createWorkspace("Altro");
    const foreign = store.createPage({ url: "https://x.example", workspaceId: wsB.id });
    expect(() => store.movePage(foreign.id, box.id)).toThrow();
  });

  it("duplica mantiene url e WorkBox ma crea una card indipendente", () => {
    const store = new TabStore();
    const box = store.createWorkBox("Ricerca");
    const page = store.createPage({ url: "https://doc.example" });
    store.movePage(page.id, box.id);
    const copy = store.duplicatePage(page.id);
    expect(copy.id).not.toBe(page.id);
    expect(copy.url).toBe(page.url);
    expect(copy.workBoxId).toBe(box.id);
  });

  it("cambiare workspace mantiene l'attiva per workspace", () => {
    const store = new TabStore();
    const a = store.createPage({ url: "https://a.example" });
    store.activatePage(a.id);
    const wsB = store.createWorkspace("Cliente B");
    store.switchWorkspace(wsB.id);
    expect(store.getActivePageId()).toBeNull();
    const b = store.createPage({ url: "https://b.example" });
    store.activatePage(b.id);
    expect(store.getActivePageId()).toBe(b.id);
    store.switchWorkspace("default");
    expect(store.getActivePageId()).toBe(a.id);
  });
});
