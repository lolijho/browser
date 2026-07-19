import { INTERNAL_NEWTAB_URL } from "@businessbox/shared";
import type { PageState } from "@businessbox/contracts";
import { useActivePage, useShellStore } from "../store";
import { Omnibox } from "./Omnibox";
import { SettingsMenu } from "./SettingsMenu";

function NavButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-full text-base text-zinc-700 hover:bg-zinc-200 disabled:cursor-default disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function PageChip({ page, active }: { page: PageState; active: boolean }) {
  return (
    <div
      className={`group flex h-8 max-w-44 min-w-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-sm ${
        active ? "bg-white shadow-sm ring-1 ring-zinc-300" : "hover:bg-zinc-200"
      }`}
      onClick={() => void window.businessbox.activatePage(page.id)}
      title={page.title}
    >
      {page.faviconUrl ? (
        <img src={page.faviconUrl} alt="" className="h-4 w-4 shrink-0" />
      ) : (
        <span className="h-4 w-4 shrink-0 rounded-sm bg-zinc-300" />
      )}
      <span className="truncate text-zinc-800">{page.title || page.url}</span>
      {page.pinned && (
        <button
          type="button"
          title="Sblocca pagina"
          className="hidden shrink-0 text-xs text-zinc-400 hover:text-zinc-700 group-hover:block"
          onClick={(e) => {
            e.stopPropagation();
            void window.businessbox.setPinned(page.id, false);
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

export function TopBar() {
  const activePage = useActivePage();
  const pages = useShellStore((s) => s.browser.pages);
  const toggleSidebar = useShellStore((s) => s.toggleSidebar);
  const toggleAiPanel = useShellStore((s) => s.toggleAiPanel);

  const pinnedPages = pages.filter((p) => p.pinned);
  const showActiveChip =
    activePage !== null && !activePage.pinned && activePage.url !== INTERNAL_NEWTAB_URL;

  const pageId = activePage?.id;

  return (
    <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-zinc-200 bg-zinc-100 px-2">
      <NavButton label="Mostra/nascondi sidebar (Ctrl+B)" onClick={toggleSidebar}>
        ☰
      </NavButton>
      <NavButton
        label="Indietro (Alt+←)"
        disabled={!activePage?.canGoBack}
        onClick={() => pageId && void window.businessbox.goBack(pageId)}
      >
        ←
      </NavButton>
      <NavButton
        label="Avanti (Alt+→)"
        disabled={!activePage?.canGoForward}
        onClick={() => pageId && void window.businessbox.goForward(pageId)}
      >
        →
      </NavButton>
      {activePage?.isLoading ? (
        <NavButton
          label="Interrompi"
          onClick={() => pageId && void window.businessbox.stop(pageId)}
        >
          ✕
        </NavButton>
      ) : (
        <NavButton
          label="Ricarica (Ctrl+R)"
          disabled={!activePage?.hasView}
          onClick={() => pageId && void window.businessbox.reload(pageId)}
        >
          ⟳
        </NavButton>
      )}

      <Omnibox />

      <div className="flex max-w-[45%] items-center gap-1 overflow-hidden">
        {showActiveChip && <PageChip page={activePage} active />}
        {pinnedPages.map((page) => (
          <PageChip key={page.id} page={page} active={page.id === activePage?.id} />
        ))}
      </div>

      <NavButton
        label="Nuova pagina (Ctrl+T)"
        onClick={() => void window.businessbox.createPage({})}
      >
        +
      </NavButton>
      <NavButton label="Mostra/nascondi pannello AI (Ctrl+Shift+A)" onClick={toggleAiPanel}>
        ✦
      </NavButton>
      <SettingsMenu />
    </header>
  );
}
