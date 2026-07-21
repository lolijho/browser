import { parseSSE } from "@businessbox/ai";
import type { AiChatMessage, AiSourcePayload } from "@businessbox/contracts";

/** Chunk normalizzato inoltrato al renderer via IPC. */
export type AiStreamChunk =
  | { type: "text"; text: string }
  | { type: "done"; usedSourceIds: string[] }
  | { type: "error"; error: { code: string; message: string } };

export interface AiClientDeps {
  apiBaseUrl: string;
  /** Restituisce un access token valido, rinnovandolo se serve. */
  getAccessToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

export interface AiChatParams {
  messages: AiChatMessage[];
  sources: AiSourcePayload[];
  reasoningEffort?: "high" | "xhigh";
  signal: AbortSignal;
}

/**
 * Client AI del processo principale.
 *
 * Vive qui, e non nel renderer, perché deve allegare l'access token: esporlo
 * alla UI significherebbe metterlo a portata di qualunque contenuto remoto che
 * riuscisse a eseguire codice nella shell. Il renderer riceve solo i chunk.
 */
export class AiClient {
  constructor(private readonly deps: AiClientDeps) {}

  private get fetch(): typeof fetch {
    return this.deps.fetchImpl ?? globalThis.fetch;
  }

  async *streamChat(params: AiChatParams): AsyncGenerator<AiStreamChunk> {
    const token = await this.deps.getAccessToken();
    if (!token) {
      yield {
        type: "error",
        error: {
          code: "unauthenticated",
          message: "Accedi al tuo account BusinessBox per usare l'AI.",
        },
      };
      return;
    }

    let response: Response;
    try {
      response = await this.fetch(`${this.deps.apiBaseUrl}/api/v1/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        signal: params.signal,
        body: JSON.stringify({
          messages: params.messages,
          sources: params.sources,
          ...(params.reasoningEffort ? { reasoningEffort: params.reasoningEffort } : {}),
        }),
      });
    } catch (error) {
      if (params.signal.aborted) {
        return;
      }
      yield {
        type: "error",
        error: {
          code: "network",
          message: `Impossibile raggiungere il servizio AI: ${describe(error)}`,
        },
      };
      return;
    }

    if (!response.ok || !response.body) {
      yield { type: "error", error: httpError(response.status) };
      return;
    }

    try {
      for await (const data of parseSSE(streamOf(response.body))) {
        const chunk = toChunk(data);
        if (chunk) {
          yield chunk;
        }
      }
    } catch (error) {
      if (!params.signal.aborted) {
        yield {
          type: "error",
          error: { code: "stream", message: `Stream interrotto: ${describe(error)}` },
        };
      }
    }
  }
}

/** `ReadableStream` → `AsyncIterable`, che Node non garantisce su tutte le versioni. */
async function* streamOf(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }
      if (value) {
        yield value;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function toChunk(data: string): AiStreamChunk | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  if (record["type"] === "text" && typeof record["text"] === "string") {
    return { type: "text", text: record["text"] };
  }
  if (record["type"] === "done") {
    const ids = record["usedSourceIds"];
    return {
      type: "done",
      usedSourceIds: Array.isArray(ids)
        ? ids.filter((v): v is string => typeof v === "string")
        : [],
    };
  }
  if (record["type"] === "error") {
    const err = record["error"] as Record<string, unknown> | undefined;
    return {
      type: "error",
      error: {
        code: typeof err?.["code"] === "string" ? (err["code"] as string) : "unknown",
        message:
          typeof err?.["message"] === "string"
            ? (err["message"] as string)
            : "Errore del servizio AI.",
      },
    };
  }
  return null;
}

function httpError(status: number): { code: string; message: string } {
  if (status === 401) {
    return { code: "unauthenticated", message: "Sessione scaduta: accedi di nuovo." };
  }
  if (status === 429) {
    return { code: "budget_exceeded", message: "Budget AI esaurito per oggi." };
  }
  if (status === 503) {
    return { code: "disabled", message: "Il servizio AI non è configurato." };
  }
  return { code: "http_error", message: `Il servizio AI ha risposto con errore ${status}.` };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
