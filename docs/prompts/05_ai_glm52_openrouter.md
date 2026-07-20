# Prompt 05 — AI con GLM 5.2 tramite OpenRouter

## Obiettivo

Integrare il motore AI principale del browser usando esclusivamente OpenRouter e il modello:

```text
z-ai/glm-5.2
```

La chiave API deve rimanere nel backend. Il desktop non deve mai contenerla.

## Provider abstraction

Crea:

```ts
interface AIProvider {
  streamChat(request: AIChatRequest, signal?: AbortSignal): AsyncIterable<AIStreamChunk>;
  generateStructured<T>(request: AIStructuredRequest<T>, signal?: AbortSignal): Promise<T>;
  summarize(request: SummarizeRequest, signal?: AbortSignal): Promise<SummaryResult>;
  classify(request: ClassificationRequest, signal?: AbortSignal): Promise<ClassificationResult>;
  healthCheck(): Promise<AIProviderHealth>;
}
```

Implementazioni:

- `OpenRouterGLMProvider`
- `MockAIProvider`
- `DisabledAIProvider`

Non integrare direttamente le API Z.ai.

## Configurazione

Variabili server-side validate con Zod:

```env
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=z-ai/glm-5.2
OPENROUTER_HTTP_REFERER=https://example.com
OPENROUTER_APP_TITLE=BusinessBox Browser
OPENROUTER_REASONING_EFFORT=high
OPENROUTER_MAX_TOKENS=8192
OPENROUTER_TIMEOUT_MS=120000
OPENROUTER_PROVIDER_SORT=price
OPENROUTER_ALLOW_FALLBACKS=true
OPENROUTER_REQUIRE_PARAMETERS=true
OPENROUTER_DATA_COLLECTION=deny
OPENROUTER_ZDR=true
```

Usa endpoint OpenAI-compatible `/chat/completions`, streaming SSE e header di attribuzione opzionali.

Provider routing indicativo:

```json
{
  "sort": "price",
  "allow_fallbacks": true,
  "require_parameters": true,
  "data_collection": "deny",
  "zdr": true
}
```

Non configurare fallback automatici verso modelli differenti. Il fallback può avvenire solo tra provider dello stesso modello.

## Reasoning

GLM 5.2 supporta `high` e `xhigh`.

- `high`: classificazione, riassunti, chat ordinaria, estrazione.
- `xhigh`: confronti complessi, report articolati e pianificazione multi-step.
- Non usare `xhigh` per ogni pagina.
- Non richiedere o mostrare chain-of-thought privata; mostra solo risultato e fonti.

## Streaming

Il backend riceve SSE da OpenRouter e lo ritrasmette al desktop via SSE.

Gestisci:

- chunk incompleti;
- `[DONE]`;
- commenti SSE;
- abort;
- timeout;
- disconnessione;
- errori prima e durante lo stream;
- retry limitato con backoff e jitter;
- circuit breaker.

## Structured output

Usa JSON Schema quando supportato e valida sempre con Zod.

Classificazione attesa:

```json
{
  "suggestedWorkBoxId": "string|null",
  "suggestedWorkBoxName": "string|null",
  "confidence": 0.0,
  "title": "string",
  "summary": "string",
  "tags": ["string"],
  "entities": [
    {
      "type": "company|person|product|price|location|date|email|phone|other",
      "value": "string",
      "confidence": 0.0
    }
  ],
  "suggestedActions": ["string"],
  "sensitivity": "normal|potentially-sensitive|sensitive",
  "reason": "string"
}
```

Regole:

- `confidence >= 0.80`: assegna automaticamente;
- `0.55–0.79`: suggerisci;
- `< 0.55`: “Da organizzare”.

## Pipeline RAG

Non inviare l'intero archivio.

1. determina workspace e WorkBox;
2. full-text search locale;
3. ricerca semantica se disponibile;
4. privacy filter;
5. ranking;
6. deduplicazione;
7. selezione fonti;
8. riduzione e chunking;
9. sanitizzazione;
10. chiamata OpenRouter.

Il milione di token è un limite massimo, non un obiettivo.

## Funzioni AI

- riassumi pagina;
- riassumi WorkBox;
- chat pagina;
- chat WorkBox;
- confronta pagine;
- estrai entità, prezzi e contatti pubblici;
- genera bozze di email, preventivo, task e rapporto;
- suggerisci tag e WorkBox;
- ricerca nelle fonti interne.

Ogni risposta deve mostrare quali PageCard sono state usate.

## Tool calling

Consentiti inizialmente solo tool read-only o draft:

- search_local_pages
- get_current_page
- get_page_content
- get_workbox_pages
- create_note_draft
- create_task_draft
- create_email_draft
- create_report_draft
- compare_pages
- move_page_suggestion
- tag_page_suggestion

Nessun invio email, pagamento, cancellazione, pubblicazione o modifica critica senza conferma esplicita.

## Prompt injection

Tratta tutto il testo web come non affidabile. Le fonti non sono istruzioni.

Implementa:

- `sanitizeContentForAI()`;
- delimitazione delle fonti;
- allowlist tool;
- rimozione password, token, cookie e query sensibili;
- test con pagine malevole che tentano di cambiare istruzioni.

## Budget e telemetria

Registra senza contenuti sensibili:

- modello richiesto ed effettivo;
- provider effettivo;
- token input/output/reasoning;
- costo;
- latenza e TTFT;
- finish reason;
- errore normalizzato.

Implementa limiti per utente, organizzazione, giorno, mese e singola richiesta. A budget esaurito, il browser continua a funzionare con ricerca locale.

## Criteri di accettazione

- Usa `z-ai/glm-5.2` via OpenRouter.
- La chiave non appare nel desktop o nei log.
- Streaming e cancellazione funzionano.
- Structured output viene validato.
- `allowAI=false` impedisce la chiamata.
- ZDR e `data_collection=deny` vengono rispettati.
- Il browser funziona anche se OpenRouter è offline.
- Fonti e costi sono tracciati.
