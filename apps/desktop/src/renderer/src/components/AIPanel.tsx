import { useRef, useState } from "react";
import { BRANDING } from "@businessbox/shared";
import { useActivePage, useShellStore } from "../store";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
}

interface SseAiChunk {
  type: "text" | "done" | "error";
  text?: string;
  usedSourceIds?: string[];
  error?: { code: string; message: string };
}

async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseAiChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let index: number;
    while ((index = buffer.indexOf("\n\n")) !== -1) {
      const event = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const data = event
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("");
      if (!data || data === "[DONE]") {
        continue;
      }
      try {
        yield JSON.parse(data) as SseAiChunk;
      } catch {
        // chunk malformato: ignorato
      }
    }
  }
}

/**
 * Pannello AI (fase 05): chat sulla pagina attiva con streaming dal backend.
 * La chiave OpenRouter vive SOLO nel backend; il desktop parla con l'API.
 */
export function AIPanel() {
  const toggleAiPanel = useShellStore((s) => s.toggleAiPanel);
  const activePage = useActivePage();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runChat = async (userText: string) => {
    if (!activePage || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: userText }]);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const context = await window.businessbox.aiGetPageContext(activePage.id);
      if (!context.allowAI) {
        setError("L'AI è disattivata su questa pagina (allowAI=false).");
        return;
      }
      const history = messages
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
      const response = await fetch(`${BRANDING.defaultApiUrl}/api/v1/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: [...history, { role: "user", content: userText }],
          sources: context.source ? [context.source] : [],
        }),
      });
      if (!response.ok || !response.body) {
        const detail = response.status === 429 ? "budget AI esaurito" : `errore ${response.status}`;
        throw new Error(detail);
      }
      let assistant = "";
      let sources: string[] = [];
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      for await (const chunk of readSse(response.body)) {
        if (chunk.type === "text" && chunk.text) {
          assistant += chunk.text;
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: "assistant", content: assistant };
            return next;
          });
        } else if (chunk.type === "done") {
          sources = chunk.usedSourceIds ?? [];
        } else if (chunk.type === "error") {
          throw new Error(chunk.error?.message ?? "errore AI");
        }
      }
      if (context.source && sources.length > 0) {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            role: "assistant",
            content: assistant,
            sources: [context.source!.title || context.source!.url],
          };
          return next;
        });
      }
    } catch (cause) {
      if (controller.signal.aborted) {
        setError("Richiesta annullata.");
      } else {
        setError(
          `AI non disponibile (${cause instanceof Error ? cause.message : "errore"}). Il browser continua a funzionare normalmente.`,
        );
      }
      setMessages((prev) => (prev[prev.length - 1]?.content === "" ? prev.slice(0, -1) : prev));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const submit = () => {
    const text = input.trim();
    if (text) {
      setInput("");
      void runChat(text);
    }
  };

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

      <div className="flex-1 space-y-3 overflow-y-auto p-3 text-sm">
        {messages.length === 0 && (
          <p className="rounded-lg bg-zinc-100 p-3 text-xs text-zinc-500">
            Chiedi qualcosa sulla pagina attiva: il contenuto estratto viene passato come fonte
            (sanitizzato, mai campi sensibili). Le risposte citano le fonti usate.
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
            {message.sources && (
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
            onClick={() => abortRef.current?.abort()}
          >
            ■ Annulla generazione
          </button>
        ) : (
          <button
            type="button"
            disabled={!activePage?.hasView}
            className="w-full rounded-lg border border-zinc-300 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-40"
            onClick={() => void runChat("Riassumi questa pagina in punti operativi.")}
          >
            ✦ Riassumi pagina attiva
          </button>
        )}
        <div className="flex gap-2">
          <textarea
            rows={2}
            value={input}
            disabled={busy}
            placeholder="Chiedi qualcosa sulla pagina attiva…"
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
      </div>
    </aside>
  );
}
