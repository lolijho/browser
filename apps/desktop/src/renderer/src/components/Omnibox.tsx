import { useEffect, useRef, useState } from "react";
import { INTERNAL_NEWTAB_URL } from "@businessbox/shared";
import { useActivePage, useShellStore } from "../store";

export function Omnibox() {
  const activePage = useActivePage();
  const focusToken = useShellStore((s) => s.omniboxFocusToken);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);

  const displayedUrl = activePage && activePage.url !== INTERNAL_NEWTAB_URL ? activePage.url : "";
  const value = draft ?? displayedUrl;

  useEffect(() => {
    if (focusToken > 0) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [focusToken]);

  const submit = () => {
    const input = value.trim();
    if (!input || !activePage) {
      return;
    }
    void window.businessbox.navigate(activePage.id, input);
    setDraft(null);
    inputRef.current?.blur();
  };

  return (
    <input
      ref={inputRef}
      type="text"
      spellCheck={false}
      placeholder="Cerca con Google o inserisci un indirizzo"
      className="h-8 w-full min-w-40 flex-1 rounded-full border border-zinc-300 bg-zinc-50 px-4 text-sm text-zinc-800 outline-none placeholder:text-zinc-400 focus:border-blue-500 focus:bg-white"
      value={value}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          submit();
        } else if (e.key === "Escape") {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
