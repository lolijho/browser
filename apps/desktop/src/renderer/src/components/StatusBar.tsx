import { INTERNAL_NEWTAB_URL } from "@businessbox/shared";
import { useActivePage, useShellStore } from "../store";

export function StatusBar() {
  const activePage = useActivePage();
  const targetUrl = useShellStore((s) => s.browser.targetUrl);
  const pageCount = useShellStore((s) => s.browser.pages.length);

  const statusText = targetUrl
    ? targetUrl
    : activePage?.isLoading
      ? `Caricamento di ${activePage.url}…`
      : activePage && activePage.url !== INTERNAL_NEWTAB_URL
        ? activePage.url
        : "Pronto";

  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-zinc-200 bg-zinc-100 px-3 text-[11px] text-zinc-500">
      <span className="min-w-0 flex-1 truncate">{statusText}</span>
      <span className="shrink-0">
        {pageCount} {pageCount === 1 ? "pagina" : "pagine"} · workspace default
      </span>
    </footer>
  );
}
