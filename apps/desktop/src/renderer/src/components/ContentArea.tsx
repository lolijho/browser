import { useEffect, useRef } from "react";
import { INTERNAL_NEWTAB_URL } from "@businessbox/shared";
import { useActivePage, useShellStore } from "../store";

function NewTabView() {
  const activePage = useActivePage();
  const requestOmniboxFocus = useShellStore((s) => s.requestOmniboxFocus);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-white">
      <h1 className="text-3xl font-semibold text-zinc-800">BusinessBox Browser</h1>
      <p className="text-sm text-zinc-500">Cerca sul web o inserisci un indirizzo per iniziare.</p>
      <input
        type="text"
        autoFocus
        spellCheck={false}
        placeholder="Cerca con Google o inserisci un indirizzo"
        className="h-11 w-[32rem] max-w-[80%] rounded-full border border-zinc-300 px-5 text-[15px] shadow-sm outline-none focus:border-blue-500"
        onKeyDown={(e) => {
          const input = e.currentTarget.value.trim();
          if (e.key === "Enter" && input && activePage) {
            void window.businessbox.navigate(activePage.id, input);
          }
        }}
      />
      <button
        type="button"
        className="text-xs text-zinc-400 hover:text-zinc-600"
        onClick={requestOmniboxFocus}
      >
        Suggerimento: premi Ctrl/Cmd+L per usare l'omnibox
      </button>
    </div>
  );
}

function ErrorView() {
  const activePage = useActivePage();
  const requestOmniboxFocus = useShellStore((s) => s.requestOmniboxFocus);
  if (!activePage?.loadError) {
    return null;
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-white px-8 text-center">
      <span className="text-4xl">⚠️</span>
      <h1 className="text-xl font-semibold text-zinc-800">Impossibile caricare la pagina</h1>
      <p className="max-w-xl text-sm break-all text-zinc-500">{activePage.loadError.failedUrl}</p>
      <p className="text-xs text-zinc-400">
        {activePage.loadError.description} (codice {activePage.loadError.code})
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className="rounded-full bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          onClick={() => void window.businessbox.reload(activePage.id)}
        >
          Riprova
        </button>
        <button
          type="button"
          className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
          onClick={requestOmniboxFocus}
        >
          Modifica indirizzo
        </button>
      </div>
    </div>
  );
}

function CrashView() {
  const activePage = useActivePage();
  if (!activePage) {
    return null;
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-white px-8 text-center">
      <span className="text-4xl">💥</span>
      <h1 className="text-xl font-semibold text-zinc-800">La pagina si è interrotta</h1>
      <p className="max-w-xl text-sm text-zinc-500">
        Il processo di rendering è terminato in modo imprevisto. Puoi ripristinare la pagina.
      </p>
      <button
        type="button"
        className="mt-2 rounded-full bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        onClick={() => void window.businessbox.reload(activePage.id)}
      >
        Ripristina pagina
      </button>
    </div>
  );
}

/**
 * Area centrale riservata al WebContentsView attivo. Il renderer misura il
 * rettangolo (ResizeObserver) e lo comunica al main, che posiziona la view
 * nativa sopra quest'area. Le pagine interne (newtab/errore/crash) sono rese
 * qui dalla shell React, senza alcun contenuto remoto.
 */
export function ContentArea() {
  const containerRef = useRef<HTMLDivElement>(null);
  const activePage = useActivePage();

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    const report = () => {
      const rect = element.getBoundingClientRect();
      void window.businessbox.setContentBounds({
        x: Math.max(0, Math.round(rect.x)),
        y: Math.max(0, Math.round(rect.y)),
        width: Math.max(0, Math.round(rect.width)),
        height: Math.max(0, Math.round(rect.height)),
      });
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    window.addEventListener("resize", report);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", report);
    };
  }, []);

  const overlay = activePage?.crashed ? (
    <CrashView />
  ) : activePage?.loadError ? (
    <ErrorView />
  ) : activePage && activePage.url === INTERNAL_NEWTAB_URL ? (
    <NewTabView />
  ) : null;

  return (
    <main ref={containerRef} className="relative min-w-0 flex-1 bg-white">
      {overlay}
    </main>
  );
}
