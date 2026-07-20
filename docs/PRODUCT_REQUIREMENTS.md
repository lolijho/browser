# Requisiti di prodotto — BusinessBox Browser

> Sintesi operativa dei requisiti in `CLAUDE.md` e `docs/prompts/*`. In caso di
> dubbio fa fede il prompt di fase originale.

## Visione

Browser desktop AI-first per imprenditori e professionisti, basato su Electron con
Chromium reale. Non è una web app: naviga siti reali tramite `WebContentsView`.
Distribuito come applicazione installabile (Windows NSIS, macOS DMG/ZIP, Linux
AppImage/deb) con canali alpha/beta/stable.

## Caratteristica distintiva: barra superiore pulita

- 1 pagina attiva + massimo **3 pagine pinned** nella barra superiore.
- Tutte le altre pagine vivono nella **sidebar**, organizzate in **workspace** e **WorkBox**.
- Chiudere dalla barra archivia la pagina lateralmente; l'eliminazione definitiva è
  un'azione esplicita separata.
- Lifecycle deterministico delle pagine: **hot** (renderer vivo, attiva/pinned, max 4),
  **warm** (renderer vivo non visibile, max 6), **cold** (renderer distrutto, metadati
  conservati, ripristino nella stessa session partition).
- Dirty state: pagine con modifiche non salvate non vengono mai distrutte senza conferma.

## Ricerca

- Motori preinstallati: Google (`g`), Brave Search (`br`), Bing (`b`), DuckDuckGo (`d`),
  Startpage (`s`), Qwant (`q`), Ecosia (`e`).
- Motori custom con template `%s` (HTTPS, validazione severa) e rilevamento OpenSearch
  con conferma dell'utente.
- Default: globale Google, modalità privata Brave Search; override per workspace e per
  singola ricerca (`:g query`, `/google query`, keyword+Tab).
- Nessuno scraping delle SERP: la ricerca costruisce l'URL e lo apre nel `WebContentsView`.
- Intent parser con precedenze: comando browser → comando AI → keyword motore → URL →
  dominio → ricerca locale → ricerca web. Le ricerche web normali NON vanno all'AI.

## Memoria locale (local-first)

- SQLite locale con migrazioni versionate: workspace, WorkBox, PageCard, snapshot,
  cronologia, motori, tag, entità, note, task, conversazioni AI, coda sync.
- Estrazione contenuti (Readability) sanitizzata, senza mai leggere credenziali.
- Full-text search locale su titolo, URL, testo estratto, tag, entità, note.
- Ripristino completo al riavvio (workspace, attiva, pinned, cold).

## AI

- Esclusivamente **OpenRouter** con modello **`z-ai/glm-5.2`**; chiave API solo nel backend.
- Reasoning `high` di default, `xhigh` solo per compiti complessi.
- Streaming SSE backend→desktop, structured output validato Zod, RAG con privacy filter.
- Classificazione automatica nei WorkBox: confidence ≥0.80 auto, 0.55–0.79 suggerita,
  <0.55 "Da organizzare".
- Tool calling solo read-only/draft; azioni critiche mai senza conferma.
- Budget per utente/org/giorno/mese; senza AI il browser resta pienamente utilizzabile.

## Account e sincronizzazione

- Backend Fastify + PostgreSQL/pgvector + Redis/BullMQ, dashboard admin Next.js.
- Sync local-first con mutation queue, idempotency key, tombstone, conflitti espliciti.
- Flag per PageCard: `allowSync`, `allowAI`, `allowScreenshot`, retention, sensitivity.
- Multi-tenant con verifica server-side; offline completo supportato.

## Sicurezza e privacy

- Electron: `contextIsolation`, `sandbox`, no `nodeIntegration`, IPC allowlist + Zod,
  permessi deny-by-default, `setWindowOpenHandler`, sessioni `persist:workspace-<uuid>`.
- Tre privacy mode: Cloud AI / conferma per invio / solo locale.
- Modalità privata: sessione in memoria, niente cronologia, screenshot, sync o AI di default.
- Sanitizzazione di credenziali e dati sensibili prima di AI, sync e log.

## Non-obiettivi (alpha)

- Nessuno scraping SERP automatico.
- Nessun invio email/pagamenti/azioni critiche automatiche da parte dell'AI.
- Nessun code signing simulato senza certificati reali.
