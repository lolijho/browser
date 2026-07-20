/**
 * Parser SSE minimale e robusto (prompt 05): gestisce chunk incompleti,
 * eventi multipli per chunk, commenti (righe che iniziano con ":"),
 * CRLF e il sentinello [DONE]. Ritorna i payload delle righe `data:`.
 */
export async function* parseSSE(
  stream: AsyncIterable<Uint8Array | string>,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of stream) {
    buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
    // Un evento SSE termina con una riga vuota.
    let separatorIndex: number;
    while ((separatorIndex = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex).replace(/^\r?\n\r?\n/, "");
      const data = extractData(rawEvent);
      if (data === null) {
        continue;
      }
      if (data === "[DONE]") {
        return;
      }
      yield data;
    }
  }
  // Flush finale: alcuni server non terminano l'ultimo evento con riga vuota.
  const trailing = extractData(buffer);
  if (trailing !== null && trailing !== "[DONE]") {
    yield trailing;
  }
}

function extractData(rawEvent: string): string | null {
  const dataLines = rawEvent
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""));
  if (dataLines.length === 0) {
    return null;
  }
  return dataLines.join("\n");
}
