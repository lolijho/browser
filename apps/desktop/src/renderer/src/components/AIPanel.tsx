import { useEffect, useRef, useState } from "react";
import { aiChatChunkEventSchema, authStatusSchema, type AuthStatus } from "@businessbox/contracts";
import { useActivePage, useShellStore, useWorkspacePages } from "../store";
import { AuthGate } from "./AuthGate";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
}

/** Ambito del contesto inviato all'AI. */
type Scope = "page" | "workspace";

/**
 * Pannello AI (fase 05 + M6).
 *
 * Due invarianti rispetto alla versione precedente:
 * 1. la richiesta HTTP parte dal MAIN, non da qui: l'access token non è mai
 *    esposto al renderer;
 * 2. il contesto può essere multi-fonte (pagina attiva oppure tutte le pagine
 *    del workspace), non più solo la pagina corrente.
 */
export function AIPanel() {
  const toggleAiPanel = useShellStore((s) => s.toggleAiPanel);
  const activePage = useActivePage();
  const workspacePages = useWorkspacePages();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("page");
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const runIdRef = useRef<string | null>(null);

  useEffect(() => {
    void window.businessbox.authGetStatus().then(setAuth);
    return window.businessbox.onAuthState((payload) => {
      const parsed = authStatusSchema.safeParse(payload);
      if (parsed.success) {
        setAuth(parsed.data);
      }
    });
  }, []);

  /**
   * Sottoscrizione unica ai chunk: filtra per `runId` così due generazioni
   * concorrenti non si mescolano.
   */
  useEffect(() => {
    return window.businessbox.onAiChatChunk((payload) => {
      const parsed = aiChatChunkEventSchema.safeParse(payload);
      if (!parsed.success || parsed.data.runId !== runIdRef.current) {
        return;
      }
      const { chunk } = parsed.data;
      if (chunk.type === "text") {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, content: last.content + chunk.text };
          }
          return next;
        });
        return;
      }
      if (chunk.type === "error") {
        setError(`${chunk.error.message} Il browser continua a funzionare normalmente.`);
        setMessages((prev) => (prev[prev.length - 1]?.content === "" ? prev.slice(0, -1) : prev));
      }
      // done | error: la generazione è conclusa.
      runIdRef.current = null;
      setBusy(false);
    });
  }, []);

  const runChat = async (userText: string) => {
    if (busy) {
      return;
    }
    const pageIds =
      scope === "workspace"
        ? workspacePages.filter((p) => !p.archived).map((p) => p.id)
        : activePage
          ? [activePage.id]
          : [];
    if (pageIds.length === 0) {
      setError("Nessuna pagina disponibile come contesto.");
      return;
    }

    setBusy(true);
    setError(null);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: userText },
      { role: "assistant", content: "" },
    ]);

    try {
      const history = messages
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
      const started = await window.businessbox.aiChatStart({
        messages: [...history, { role: "user", content: userText }],
        pageIds,
      });
      runIdRef.current = started.runId;

      if (started.sources.length === 0) {
        setError(
          started.excluded.some((e) => e.reason === "ai-disabilitata")
            ? "L'AI è disattivata sulle pagine selezionate."
            : "Nessun contenuto estratto disponibile come fonte.",
        );
        setMessages((prev) => prev.slice(0, -1));
        runIdRef.current = null;
        setBusy(false);
        return;
      }
      // Citazioni note in anticipo: sono le fonti realmente inviate.
      const labels = started.sources.map((s) => s.title || s.url);
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant") {
          next[next.length - 1] = { ...last, sources: labels };
        }
        return next;
      });
    } catch (cause) {
      setError(
        `AI non disponibile (${cause instanceof Error ? cause.message : "errore"}). Il browser continua a funzionare normalmente.`,
      );
      setMessages((prev) => (prev[prev.length - 1]?.content === "" ? prev.slice(0, -1) : prev));
      runIdRef.current = null;
      setBusy(false);
    }
  };

  const cancel = () => {
    if (runIdRef.current) {
      void window.businessbox.aiChatCancel(runIdRef.current);
      runIdRef.current = null;
    }
    setBusy(false);
    setError("Richiesta annullata.");
  };

  const submit = () => {
    const text = input.trim();
    if (text) {
      setInput("");
      void runChat(text);
    }
  };

  const contextCount =
    scope === "workspace" ? workspacePages.filter((p) => !p.archived).length : activePage ? 1 : 0;

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-zinc-200 bg-zinc-50">
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2.5">
        <h2 className="text-sm font-semibold text-zinc-800">Assistente AI · GLM 5.2</h2>
        <button
          type="button"
          title="Chiudi pannello (Ctrl+Shift+A)"
          className="rounded-md px-1.5 text-sm text-zinc-500 hover:bg-zinc-200"
          onClick={toggleAiPanel}
        >
          ✕
        </button>
      </div>

      {auth && !auth.authenticated ? (
        <AuthGate offline={auth.offline} onAuthenticated={setAuth} />
      ) : (
        <>
          <div className="flex items-center gap-1 border-b border-zinc-200 px-3 py-2 text-xs">
            <span className="text-zinc-500">Contesto:</span>
            <button
              type="button"
              className={`rounded-full px-2 py-0.5 ${scope === "page" ? "bg-blue-600 text-white" : "text-zinc-600 hover:bg-zinc-200"}`}
              onClick={() => setScope("page")}
            >
              Pagina attiva
            </button>
            <button
              type="button"
              className={`rounded-full px-2 py-0.5 ${scope === "workspace" ? "bg-blue-600 text-white" : "text-zinc-600 hover:bg-zinc-200"}`}
              onClick={() => setScope("workspace")}
            >
              Workspace
            </button>
            <span className="ml-auto text-zinc-400">{contextCount} fonti</span>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-3 text-sm">
            {messages.length === 0 && (
              <p className="rounded-lg bg-zinc-100 p-3 text-xs text-zinc-500">
                Chiedi qualcosa sulle pagine in contesto: il contenuto estratto viene passato come
                fonte (sanitizzato, mai campi sensibili). Con contesto “Workspace” puoi confrontare
                più pagine. Le risposte citano le fonti usate.
              </p>
            )}
            {messages.map((message, index) => (
              <div
                key={index}
                className={`rounded-xl px-3 py-2 whitespace-pre-wrap ${
                  message.role === "user"
                    ? "ml-6 bg-blue-600 text-white"
                    : "mr-6 bg-white text-zinc-800 ring-1 ring-zinc-200"
                }`}
              >
                {message.content || "…"}
                {message.sources && message.sources.length > 0 && (
                  <p className="mt-1 text-[10px] opacity-70">
                    Fonti usate: {message.sources.join(", ")}
                  </p>
                )}
              </div>
            ))}
            {error && (
              <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800 ring-1 ring-amber-200">
                {error}
              </p>
            )}
          </div>

          <div className="space-y-2 border-t border-zinc-200 p-3">
            {busy ? (
              <button
                type="button"
                className="w-full rounded-lg border border-zinc-300 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
                onClick={cancel}
              >
                ■ Annulla generazione
              </button>
            ) : (
              <button
                type="button"
                disabled={contextCount === 0}
                className="w-full rounded-lg border border-zinc-300 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-40"
                onClick={() =>
                  void runChat(
                    scope === "workspace"
                      ? "Confronta le pagine in contesto ed evidenzia differenze e punti chiave."
                      : "Riassumi questa pagina in punti operativi.",
                  )
                }
              >
                {scope === "workspace" ? "✦ Confronta le pagine" : "✦ Riassumi pagina attiva"}
              </button>
            )}
            <div className="flex gap-2">
              <textarea
                rows={2}
                value={input}
                disabled={busy}
                placeholder="Chiedi qualcosa sulle pagine in contesto…"
                className="w-full resize-none rounded-lg border border-zinc-300 bg-white p-2 text-sm outline-none focus:border-blue-500 disabled:bg-zinc-100"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
              <button
                type="button"
                disabled={busy || !input.trim()}
                className="shrink-0 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white disabled:opacity-40"
                onClick={submit}
              >
                ↑
              </button>
            </div>
            {auth?.email && (
              <p className="text-[10px] text-zinc-400">
                {auth.email}
                {" · "}
                <button
                  type="button"
                  className="underline hover:text-zinc-600"
                  onClick={() => void window.businessbox.authLogout().then(setAuth)}
                >
                  esci
                </button>
              </p>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
