import { INTERNAL_NEWTAB_URL, MAX_PINNED_PAGES } from "@businessbox/shared";
import type { PageState } from "@businessbox/contracts";
import { useShellStore } from "../store";

function SidebarItem({ page, active }: { page: PageState; active: boolean }) {
  const setPinError = useShellStore((s) => s.setPinError);

  const togglePin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const result = await window.businessbox.setPinned(page.id, !page.pinned);
    setPinError(result.ok ? null : (result.reason ?? "Operazione non consentita"));
  };

  return (
    <li
      className={`group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
        active ? "bg-blue-50 text-blue-900" : "text-zinc-700 hover:bg-zinc-100"
      }`}
      onClick={() => void window.businessbox.activatePage(page.id)}
      title={page.url}
    >
      {page.faviconUrl ? (
        <img src={page.faviconUrl} alt="" className="h-4 w-4 shrink-0" />
      ) : (
        <span className="h-4 w-4 shrink-0 rounded-sm bg-zinc-300" />
      )}
      <span className="min-w-0 flex-1 truncate">
        {page.title || (page.url === INTERNAL_NEWTAB_URL ? "Nuova pagina" : page.url)}
      </span>
      {page.isLoading && <span className="shrink-0 animate-pulse text-xs text-zinc-400">●</span>}
      {page.crashed && (
        <span className="shrink-0 text-xs text-red-500" title="Renderer in crash">
          !
        </span>
      )}
      <button
        type="button"
        title={page.pinned ? "Sblocca" : "Blocca in alto"}
        className={`shrink-0 text-xs ${
          page.pinned
            ? "text-blue-600"
            : "hidden text-zinc-400 hover:text-zinc-700 group-hover:block"
        }`}
        onClick={(e) => void togglePin(e)}
      >
        ⚲
      </button>
      <button
        type="button"
        title="Chiudi pagina"
        className="hidden shrink-0 text-xs text-zinc-400 hover:text-red-600 group-hover:block"
        onClick={(e) => {
          e.stopPropagation();
          void window.businessbox.closePage(page.id);
        }}
      >
        ✕
      </button>
    </li>
  );
}

function Section({
  title,
  pages,
  activeId,
}: {
  title: string;
  pages: PageState[];
  activeId: string | null;
}) {
  if (pages.length === 0) {
    return null;
  }
  return (
    <section className="mb-3">
      <h3 className="mb-1 px-2 text-[11px] font-semibold tracking-wide text-zinc-400 uppercase">
        {title} · {pages.length}
      </h3>
      <ul className="space-y-0.5">
        {pages.map((page) => (
          <SidebarItem key={page.id} page={page} active={page.id === activeId} />
        ))}
      </ul>
    </section>
  );
}

export function Sidebar() {
  const browser = useShellStore((s) => s.browser);
  const pinError = useShellStore((s) => s.pinError);
  const setPinError = useShellStore((s) => s.setPinError);

  const pinned = browser.pages.filter((p) => p.pinned);
  const others = browser.pages.filter((p) => !p.pinned);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50">
      <div className="flex items-center justify-between px-3 py-2.5">
        <h2 className="text-sm font-semibold text-zinc-800">Pagine</h2>
        <button
          type="button"
          title="Nuova pagina (Ctrl+T)"
          className="rounded-md px-2 py-0.5 text-sm text-zinc-600 hover:bg-zinc-200"
          onClick={() => void window.businessbox.createPage({})}
        >
          + Nuova
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        <Section
          title={`Pinned (max ${MAX_PINNED_PAGES})`}
          pages={pinned}
          activeId={browser.activePageId}
        />
        <Section title="Aperte" pages={others} activeId={browser.activePageId} />
      </div>
      {pinError && (
        <div className="m-2 flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 ring-1 ring-amber-200">
          <span className="min-w-0 flex-1">{pinError}</span>
          <button
            type="button"
            className="shrink-0 font-semibold"
            onClick={() => setPinError(null)}
          >
            ✕
          </button>
        </div>
      )}
      <p className="border-t border-zinc-200 px-3 py-2 text-[11px] text-zinc-400">
        Workspace e WorkBox arrivano con la fase 02.
      </p>
    </aside>
  );
}
