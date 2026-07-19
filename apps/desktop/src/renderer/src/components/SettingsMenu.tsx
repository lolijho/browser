import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect, useState } from "react";
import type { AppInfo } from "@businessbox/contracts";
import { useActivePage, useShellStore } from "../store";

const itemClass =
  "flex cursor-pointer items-center rounded px-2 py-1.5 text-sm text-zinc-800 outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-zinc-100";

export function SettingsMenu() {
  const activePage = useActivePage();
  const toggleSidebar = useShellStore((s) => s.toggleSidebar);
  const toggleAiPanel = useShellStore((s) => s.toggleAiPanel);
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    void window.businessbox.getAppInfo().then(setInfo);
  }, []);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          title="Impostazioni"
          aria-label="Impostazioni"
          className="flex h-8 w-8 items-center justify-center rounded-full text-base text-zinc-700 hover:bg-zinc-200"
        >
          ⋮
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-56 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg"
        >
          <DropdownMenu.Item
            className={itemClass}
            onSelect={() => void window.businessbox.createPage({})}
          >
            Nuova pagina
            <span className="ml-auto text-xs text-zinc-400">Ctrl+T</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item className={itemClass} onSelect={toggleSidebar}>
            Sidebar
            <span className="ml-auto text-xs text-zinc-400">Ctrl+B</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item className={itemClass} onSelect={toggleAiPanel}>
            Pannello AI
            <span className="ml-auto text-xs text-zinc-400">Ctrl+Shift+A</span>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-zinc-200" />
          <DropdownMenu.Item
            className={itemClass}
            disabled={!activePage?.hasView}
            onSelect={() => activePage && void window.businessbox.openDevTools(activePage.id)}
          >
            DevTools pagina attiva
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-zinc-200" />
          <DropdownMenu.Item className={`${itemClass} cursor-default`} disabled>
            {info
              ? `${info.productName} ${info.appVersion} (${info.releaseChannel})`
              : "Caricamento…"}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
