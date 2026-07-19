import { useShellStore } from "../store";

/**
 * Pannello AI destro: placeholder funzionale (si apre/chiude, spiega cosa
 * arriverà). L'integrazione GLM 5.2 via OpenRouter è la fase 05 e passa dal
 * backend: nessuna chiave API vive nel desktop.
 */
export function AIPanel() {
  const toggleAiPanel = useShellStore((s) => s.toggleAiPanel);

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-zinc-200 bg-zinc-50">
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2.5">
        <h2 className="text-sm font-semibold text-zinc-800">Assistente AI</h2>
        <button
          type="button"
          title="Chiudi pannello (Ctrl+Shift+A)"
          className="rounded-md px-1.5 text-sm text-zinc-500 hover:bg-zinc-200"
          onClick={toggleAiPanel}
        >
          ✕
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm text-zinc-600">
        <p>
          Qui vivrà l'assistente basato su <strong>GLM 5.2</strong> (via OpenRouter, chiave solo
          lato server): riassunti di pagina e WorkBox, chat sulle fonti aperte, confronti ed
          estrazione di entità.
        </p>
        <p className="rounded-lg bg-zinc-100 p-3 text-xs text-zinc-500">
          Disponibile dalla fase 05. Il browser resta pienamente utilizzabile anche senza AI.
        </p>
      </div>
      <div className="border-t border-zinc-200 p-3">
        <textarea
          disabled
          rows={2}
          placeholder="Chiedi qualcosa sulle tue pagine… (fase 05)"
          className="w-full resize-none rounded-lg border border-zinc-200 bg-zinc-100 p-2 text-sm text-zinc-400"
        />
      </div>
    </aside>
  );
}
