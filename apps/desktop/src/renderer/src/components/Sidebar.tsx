import { useEffect, useMemo, useRef, useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useVirtualizer } from "@tanstack/react-virtual";
import { INTERNAL_NEWTAB_URL } from "@businessbox/shared";
import type { LocalSearchResult, PageCard, WorkBox } from "@businessbox/contracts";
import { useShellStore } from "../store";
import { copyPageUrl, requestDeletePage, requestPinToggle } from "../actions";
import { NameDialog } from "./dialogs/NameDialog";

/** Destinazione di un drop: null = Da organizzare, stringa = WorkBox. */
type DropTarget = string | null;

type Row =
  | { kind: "section"; key: string; label: string; count: number; dropTarget?: DropTarget }
  | { kind: "page"; key: string; page: PageCard };

const menuItemClass =
  "flex cursor-pointer items-center rounded px-2 py-1 text-[13px] text-zinc-800 outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-zinc-100";
const menuContentClass = "z-50 min-w-52 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg";

function lifecycleDot(page: PageCard): string {
  if (page.state === "hot") {
    return "bg-emerald-500";
  }
  if (page.state === "warm") {
    return "bg-amber-400";
  }
  return "bg-zinc-300";
}

function PageRow({
  page,
  active,
  workBoxes,
}: {
  page: PageCard;
  active: boolean;
  workBoxes: WorkBox[];
}) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("businessbox/page-id", page.id);
            e.dataTransfer.effectAllowed = "move";
          }}
          className={`group flex h-full cursor-pointer items-center gap-2 rounded-lg px-2 text-[13px] ${
            active ? "bg-blue-50 text-blue-900" : "text-zinc-700 hover:bg-zinc-100"
          }`}
          onClick={() => void window.businessbox.activatePage(page.id)}
          title={page.url}
        >
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${lifecycleDot(page)}`}
            title={`Stato: ${page.state}`}
          />
          {page.faviconUrl ? (
            <img src={page.faviconUrl} alt="" className="h-4 w-4 shrink-0" />
          ) : (
            <span className="h-4 w-4 shrink-0 rounded-sm bg-zinc-200" />
          )}
          <span className="min-w-0 flex-1 truncate">
            {page.title || (page.url === INTERNAL_NEWTAB_URL ? "Nuova pagina" : page.url)}
          </span>
          {page.dirtyState && (
            <span className="shrink-0 text-amber-500" title="Modifiche non salvate">
              ●
            </span>
          )}
          {page.keepAlive && !page.dirtyState && (
            <span className="shrink-0 text-[10px] text-zinc-400" title="Keep alive">
              ∞
            </span>
          )}
          {page.crashed && (
            <span className="shrink-0 text-red-500" title="Renderer in crash">
              !
            </span>
          )}
          {page.pinned && (
            <span className="shrink-0 text-blue-500" title="Pagina bloccata in alto">
              ⚲
            </span>
          )}
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={menuContentClass}>
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={() => void window.businessbox.activatePage(page.id)}
          >
            Apri
          </ContextMenu.Item>
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={() => void requestPinToggle(page.id, !page.pinned)}
          >
            {page.pinned ? "Sblocca dalla barra" : "Blocca in alto"}
          </ContextMenu.Item>
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={() => void window.businessbox.setKeepAlive(page.id, !page.keepAlive)}
          >
            {page.keepAlive ? "Disattiva keep alive" : "Mantieni attiva (keep alive)"}
          </ContextMenu.Item>
          <ContextMenu.Sub>
            <ContextMenu.SubTrigger className={menuItemClass}>Sposta in…</ContextMenu.SubTrigger>
            <ContextMenu.Portal>
              <ContextMenu.SubContent className={menuContentClass}>
                <ContextMenu.Item
                  className={menuItemClass}
                  onSelect={() => void window.businessbox.movePage(page.id, null)}
                >
                  Da organizzare
                </ContextMenu.Item>
                {workBoxes.map((box) => (
                  <ContextMenu.Item
                    key={box.id}
                    className={menuItemClass}
                    onSelect={() => void window.businessbox.movePage(page.id, box.id)}
                  >
                    {box.name}
                  </ContextMenu.Item>
                ))}
              </ContextMenu.SubContent>
            </ContextMenu.Portal>
          </ContextMenu.Sub>
          <ContextMenu.Separator className="my-1 h-px bg-zinc-200" />
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={() => void window.businessbox.archivePage(page.id, !page.archived)}
          >
            {page.archived ? "Ripristina dalle archiviate" : "Archivia"}
          </ContextMenu.Item>
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={() => void window.businessbox.duplicatePage(page.id)}
          >
            Duplica
          </ContextMenu.Item>
          <ContextMenu.Item className={menuItemClass} onSelect={() => void copyPageUrl(page.url)}>
            Copia URL
          </ContextMenu.Item>
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={() =>
              void window.businessbox.setAllowScreenshot(page.id, !page.allowScreenshot)
            }
          >
            {page.allowScreenshot ? "Disattiva screenshot" : "Consenti screenshot"}
          </ContextMenu.Item>
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={() => void window.businessbox.deleteScreenshot(page.id)}
          >
            Elimina screenshot salvato
          </ContextMenu.Item>
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={() => void window.businessbox.setAllowAi(page.id, !page.allowAI)}
          >
            {page.allowAI ? "Escludi dall'AI" : "Consenti all'AI"}
          </ContextMenu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-zinc-200" />
          <ContextMenu.Item
            className={`${menuItemClass} text-red-600`}
            onSelect={() => void requestDeletePage(page.id)}
          >
            Elimina definitivamente
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function SectionRow({ row }: { row: Extract<Row, { kind: "section" }> }) {
  const [dragOver, setDragOver] = useState(false);
  const acceptsDrop = row.dropTarget !== undefined;

  return (
    <div
      className={`flex h-full items-end px-2 pb-0.5 text-[10px] font-semibold tracking-wide uppercase ${
        dragOver ? "rounded bg-blue-100 text-blue-700" : "text-zinc-400"
      }`}
      onDragOver={(e) => {
        if (acceptsDrop) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false);
        if (!acceptsDrop) {
          return;
        }
        const pageId = e.dataTransfer.getData("businessbox/page-id");
        if (pageId) {
          void window.businessbox.movePage(pageId, row.dropTarget ?? null);
        }
      }}
    >
      {row.label} · {row.count}
      {acceptsDrop && dragOver && <span className="ml-2 normal-case">rilascia qui</span>}
    </div>
  );
}

/**
 * Ricerca nell'archivio (FTS su contenuto estratto, fase 04): integra la
 * ricerca rapida sulle pagine aperte con i risultati dal database locale.
 */
function ArchiveSearchResults() {
  const query = useShellStore((s) => s.searchQuery);
  const activeWorkspaceId = useShellStore((s) => s.browser.activeWorkspaceId);
  const [results, setResults] = useState<LocalSearchResult[]>([]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      void window.businessbox
        .searchLocal({ query: trimmed, workspaceId: activeWorkspaceId })
        .then((response) => setResults(response.results))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, activeWorkspaceId]);

  if (results.length === 0) {
    return null;
  }

  return (
    <div className="max-h-56 shrink-0 overflow-y-auto border-t border-zinc-200 px-2 py-1">
      <p className="px-2 py-1 text-[10px] font-semibold tracking-wide text-zinc-400 uppercase">
        Archivio · {results.length}
      </p>
      {results.map((result) => (
        <button
          key={result.pageId}
          type="button"
          className="block w-full rounded-lg px-2 py-1 text-left hover:bg-zinc-100"
          title={result.url}
          onClick={() => void window.businessbox.activatePage(result.pageId)}
        >
          <span className="block truncate text-[13px] text-zinc-800">
            {result.title || result.url}
            {result.archived && <span className="ml-1 text-[10px] text-zinc-400">archiviata</span>}
          </span>
          <span className="block truncate text-[11px] text-zinc-400">{result.snippet}</span>
        </button>
      ))}
    </div>
  );
}

function WorkspaceSwitcher() {
  const browser = useShellStore((s) => s.browser);
  const [creating, setCreating] = useState(false);
  const activeWorkspace = browser.workspaces.find((w) => w.id === browser.activeWorkspaceId);

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-semibold text-zinc-800 hover:bg-zinc-200"
            title="Cambia workspace"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded bg-blue-600 text-[10px] font-bold text-white">
              {(activeWorkspace?.name ?? "?").slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate">{activeWorkspace?.name ?? "Workspace"}</span>
            <span className="text-xs text-zinc-400">▾</span>
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="start" sideOffset={4} className={menuContentClass}>
            {browser.workspaces.map((workspace) => (
              <DropdownMenu.Item
                key={workspace.id}
                className={menuItemClass}
                onSelect={() => void window.businessbox.switchWorkspace(workspace.id)}
              >
                {workspace.name}
                {workspace.id === browser.activeWorkspaceId && (
                  <span className="ml-auto text-xs text-blue-600">attivo</span>
                )}
              </DropdownMenu.Item>
            ))}
            <DropdownMenu.Separator className="my-1 h-px bg-zinc-200" />
            <DropdownMenu.Item className={menuItemClass} onSelect={() => setCreating(true)}>
              + Nuovo workspace
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <NameDialog
        open={creating}
        title="Nuovo workspace"
        description="Ogni workspace ha sessione, cookie e login separati."
        placeholder="Es. Cliente Rossi"
        onCancel={() => setCreating(false)}
        onConfirm={(name) => {
          setCreating(false);
          void window.businessbox.createWorkspace(name);
        }}
      />
    </>
  );
}

export function Sidebar() {
  const browser = useShellStore((s) => s.browser);
  const notice = useShellStore((s) => s.notice);
  const setNotice = useShellStore((s) => s.setNotice);
  const searchQuery = useShellStore((s) => s.searchQuery);
  const setSearchQuery = useShellStore((s) => s.setSearchQuery);
  const [creatingBox, setCreatingBox] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const workspacePages = browser.pages.filter((p) => p.workspaceId === browser.activeWorkspaceId);
  const workBoxes = browser.workBoxes.filter((b) => b.workspaceId === browser.activeWorkspaceId);

  const rows = useMemo<Row[]>(() => {
    const query = searchQuery.trim().toLowerCase();
    const matches = (p: PageCard) =>
      query === "" ||
      p.title.toLowerCase().includes(query) ||
      p.url.toLowerCase().includes(query) ||
      p.domain.toLowerCase().includes(query);

    const visible = workspacePages.filter(matches);
    const byRecency = (a: PageCard, b: PageCard) =>
      Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt);

    const pinned = visible.filter((p) => p.pinned && !p.archived);
    const recent = visible
      .filter((p) => !p.archived && !p.pinned)
      .sort(byRecency)
      .slice(0, 5);
    const unorganized = visible.filter((p) => !p.archived && !p.pinned && p.workBoxId === null);
    const archived = visible.filter((p) => p.archived);

    const result: Row[] = [];
    const pushSection = (
      key: string,
      label: string,
      pages: PageCard[],
      dropTarget?: DropTarget,
    ) => {
      if (pages.length === 0 && dropTarget === undefined) {
        return;
      }
      result.push({ kind: "section", key: `s:${key}`, label, count: pages.length, dropTarget });
      for (const page of pages) {
        result.push({ kind: "page", key: `${key}:${page.id}`, page });
      }
    };

    pushSection("pinned", "Pinned", pinned);
    pushSection("recent", "Recenti", recent);
    for (const box of workBoxes) {
      const boxPages = visible.filter((p) => p.workBoxId === box.id && !p.archived);
      pushSection(`box:${box.id}`, box.name, boxPages, box.id);
    }
    pushSection("unorganized", "Da organizzare", unorganized, null);
    pushSection("archived", "Archiviate", archived);
    return result;
  }, [workspacePages, workBoxes, searchQuery]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (rows[index]?.kind === "section" ? 26 : 32),
    overscan: 10,
  });

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50">
      <div className="space-y-2 px-2 pt-2">
        <WorkspaceSwitcher />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Cerca nelle pagine…"
          spellCheck={false}
          className="h-7 w-full rounded-md border border-zinc-200 bg-white px-2 text-[13px] outline-none placeholder:text-zinc-400 focus:border-blue-500"
        />
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="rounded-md px-2 py-0.5 text-[13px] text-zinc-600 hover:bg-zinc-200"
            onClick={() => void window.businessbox.createPage({})}
            title="Nuova pagina (Ctrl+T)"
          >
            + Pagina
          </button>
          <button
            type="button"
            className="rounded-md px-2 py-0.5 text-[13px] text-zinc-600 hover:bg-zinc-200"
            onClick={() => setCreatingBox(true)}
          >
            + WorkBox
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="mt-1 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            if (!row) {
              return null;
            }
            return (
              <div
                key={row.key}
                className="absolute top-0 left-0 w-full"
                style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
              >
                {row.kind === "section" ? (
                  <SectionRow row={row} />
                ) : (
                  <PageRow
                    page={row.page}
                    active={row.page.id === browser.activePageId}
                    workBoxes={workBoxes}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <ArchiveSearchResults />

      {notice && (
        <div className="m-2 flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 ring-1 ring-amber-200">
          <span className="min-w-0 flex-1">{notice}</span>
          <button type="button" className="shrink-0 font-semibold" onClick={() => setNotice(null)}>
            ✕
          </button>
        </div>
      )}

      <NameDialog
        open={creatingBox}
        title="Nuova WorkBox"
        description="Raggruppa le pagine di un progetto o attività."
        placeholder="Es. Fornitori"
        onCancel={() => setCreatingBox(false)}
        onConfirm={(name) => {
          setCreatingBox(false);
          void window.businessbox.createWorkBox(name);
        }}
      />
    </aside>
  );
}
