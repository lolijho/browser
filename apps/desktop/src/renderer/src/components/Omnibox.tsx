import { useEffect, useMemo, useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { INTERNAL_NEWTAB_URL } from "@businessbox/shared";
import type { SearchEngine } from "@businessbox/contracts";
import { useActivePage, useActiveSearchEngine, useShellStore, useWorkspacePages } from "../store";

const menuItemClass =
  "flex cursor-pointer items-center rounded px-2 py-1.5 text-[13px] text-zinc-800 outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-zinc-100";
const menuContentClass = "z-50 min-w-60 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg";

function engineInitial(engine: SearchEngine | null): string {
  return (engine?.name ?? "?").slice(0, 1).toUpperCase();
}

/** Menu del motore: usa una volta, default globale, default workspace, gestione. */
function EngineMenu({
  tempEngine,
  onUseOnce,
}: {
  tempEngine: SearchEngine | null;
  onUseOnce: (engine: SearchEngine) => void;
}) {
  const browser = useShellStore((s) => s.browser);
  const setShowEngineManager = useShellStore((s) => s.setShowEngineManager);
  const setNotice = useShellStore((s) => s.setNotice);
  const defaultEngine = useActiveSearchEngine();
  const shown = tempEngine ?? defaultEngine;

  const engines = browser.searchSettings.engines.filter((e) => e.enabled);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          title={`Motore di ricerca: ${shown?.name ?? "?"}`}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
            tempEngine ? "bg-violet-600 text-white" : "bg-zinc-200 text-zinc-700"
          }`}
        >
          {engineInitial(shown)}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={6} className={menuContentClass}>
          {engines.map((engine) => (
            <DropdownMenu.Sub key={engine.id}>
              <DropdownMenu.SubTrigger className={menuItemClass}>
                <span className="min-w-0 flex-1 truncate">{engine.name}</span>
                <span className="ml-2 text-[11px] text-zinc-400">:{engine.keyword}</span>
                {engine.id === defaultEngine?.id && (
                  <span className="ml-1 text-[11px] text-blue-600">default</span>
                )}
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent className={menuContentClass}>
                  <DropdownMenu.Item className={menuItemClass} onSelect={() => onUseOnce(engine)}>
                    Usa solo questa volta
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className={menuItemClass}
                    onSelect={() => void window.businessbox.setSearchDefault(engine.id, "global")}
                  >
                    Imposta come default globale
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className={menuItemClass}
                    onSelect={() =>
                      void window.businessbox.setSearchDefault(
                        engine.id,
                        "workspace",
                        browser.activeWorkspaceId,
                      )
                    }
                  >
                    Imposta come default del workspace
                  </DropdownMenu.Item>
                  {(engine.type === "custom" || engine.type === "opensearch") && (
                    <DropdownMenu.Item
                      className={`${menuItemClass} text-red-600`}
                      onSelect={() =>
                        void window.businessbox.removeEngine(engine.id).then((r) => {
                          if (!r.ok) {
                            setNotice(r.reason ?? "Rimozione non consentita");
                          }
                        })
                      }
                    >
                      Rimuovi motore
                    </DropdownMenu.Item>
                  )}
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
          ))}
          <DropdownMenu.Separator className="my-1 h-px bg-zinc-200" />
          <DropdownMenu.Item className={menuItemClass} onSelect={() => setShowEngineManager(true)}>
            Gestisci motori…
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function Omnibox() {
  const activePage = useActivePage();
  const focusToken = useShellStore((s) => s.omniboxFocusToken);
  const browser = useShellStore((s) => s.browser);
  const workspacePages = useWorkspacePages();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [tempEngine, setTempEngine] = useState<SearchEngine | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);

  const displayedUrl = activePage && activePage.url !== INTERNAL_NEWTAB_URL ? activePage.url : "";
  const value = draft ?? displayedUrl;

  useEffect(() => {
    if (focusToken > 0) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [focusToken]);

  // Suggerimenti SOLO locali (pagine aperte del workspace): quelli remoti
  // restano disabilitati fino al consenso (fase 04, prompt 03).
  const localSuggestions = useMemo(() => {
    const query = (draft ?? "").trim().toLowerCase();
    if (query.length < 2) {
      return [];
    }
    return workspacePages
      .filter(
        (p) =>
          p.id !== activePage?.id &&
          (p.title.toLowerCase().includes(query) || p.url.toLowerCase().includes(query)),
      )
      .slice(0, 5);
  }, [draft, workspacePages, activePage?.id]);

  const submit = () => {
    const input = value.trim();
    if (!input || !activePage) {
      return;
    }
    void window.businessbox.navigate(activePage.id, input, tempEngine?.id);
    setDraft(null);
    setTempEngine(null);
    setSuggestOpen(false);
    inputRef.current?.blur();
  };

  const tryEnterKeywordMode = (): boolean => {
    const keyword = (draft ?? "").trim();
    if (!keyword || keyword.includes(" ")) {
      return false;
    }
    const engine = browser.searchSettings.engines.find(
      (e) => e.enabled && (e.keyword === keyword || e.keyword === keyword.replace(/^:/, "")),
    );
    if (!engine) {
      return false;
    }
    setTempEngine(engine);
    setDraft("");
    return true;
  };

  return (
    <div className="relative flex h-8 w-full min-w-40 flex-1 items-center gap-1.5 rounded-full border border-zinc-300 bg-zinc-50 px-2 focus-within:border-blue-500 focus-within:bg-white">
      <EngineMenu
        tempEngine={tempEngine}
        onUseOnce={(engine) => {
          setTempEngine(engine);
          inputRef.current?.focus();
        }}
      />
      {tempEngine && (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">
          {tempEngine.name}
          <button
            type="button"
            title="Annulla selezione temporanea"
            onClick={() => setTempEngine(null)}
          >
            ✕
          </button>
        </span>
      )}
      <input
        ref={inputRef}
        type="text"
        spellCheck={false}
        placeholder={
          tempEngine
            ? `Cerca con ${tempEngine.name} (solo questa volta)…`
            : "Cerca o inserisci un indirizzo — :g query, /brave query, keyword+Tab"
        }
        className="h-full w-full flex-1 bg-transparent text-sm text-zinc-800 outline-none placeholder:text-zinc-400"
        value={value}
        onChange={(e) => {
          setDraft(e.target.value);
          setSuggestOpen(true);
        }}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => {
          setDraft(null);
          window.setTimeout(() => setSuggestOpen(false), 150);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            submit();
          } else if (e.key === "Tab") {
            if (tryEnterKeywordMode()) {
              e.preventDefault();
            }
          } else if (e.key === "Escape") {
            if (tempEngine) {
              setTempEngine(null);
            } else {
              setDraft(null);
              e.currentTarget.blur();
            }
          } else if (e.key === "Backspace" && (draft ?? "") === "" && tempEngine) {
            setTempEngine(null);
          }
        }}
      />
      {suggestOpen && localSuggestions.length > 0 && (
        <div className="absolute top-9 right-0 left-0 z-40 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
          <p className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wide text-zinc-400 uppercase">
            Pagine aperte (locale)
          </p>
          {localSuggestions.map((page) => (
            <button
              key={page.id}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-zinc-700 hover:bg-zinc-100"
              onMouseDown={(e) => {
                e.preventDefault();
                void window.businessbox.activatePage(page.id);
                setDraft(null);
                setSuggestOpen(false);
              }}
            >
              {page.faviconUrl ? (
                <img src={page.faviconUrl} alt="" className="h-4 w-4 shrink-0" />
              ) : (
                <span className="h-4 w-4 shrink-0 rounded-sm bg-zinc-200" />
              )}
              <span className="min-w-0 flex-1 truncate">{page.title || page.url}</span>
              <span className="shrink-0 text-[10px] text-zinc-400">apri scheda</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
