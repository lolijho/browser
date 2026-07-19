import { INTERNAL_NEWTAB_URL } from "@businessbox/shared";
import { useActivePage, useShellStore, useWorkspacePages } from "../store";

export function StatusBar() {
  const activePage = useActivePage();
  const targetUrl = useShellStore((s) => s.browser.targetUrl);
  const browser = useShellStore((s) => s.browser);
  const pages = useWorkspacePages();

  const workspaceName =
    browser.workspaces.find((w) => w.id === browser.activeWorkspaceId)?.name ?? "—";
  const hot = pages.filter((p) => p.state === "hot").length;
  const warm = pages.filter((p) => p.state === "warm").length;
  const cold = pages.filter((p) => p.state === "cold").length;

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
      <span className="shrink-0" title="Renderer vivi / dormienti / distrutti">
        hot {hot} · warm {warm} · cold {cold}
      </span>
      <span className="shrink-0">workspace: {workspaceName}</span>
    </footer>
  );
}
