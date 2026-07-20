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

## Ricerca overview (in aggiunta alla ricerca classica)

Oltre alla ricerca classica (che apre la SERP del motore scelto nel `WebContentsView`),
il browser deve offrire una **modalità overview**: una sintesi AI con fonti citate,
mostrata accanto ai risultati e mai al posto della SERP.

- L'overview è **sempre esplicita e opzionale**: la ricerca normale resta il default e
  non invia nulla all'AI (vincolo confermato in `## Ricerca`).
- **Nessuno scraping delle SERP**, che resta un non-obiettivo: l'overview non può
  leggere i risultati di Google/Bing dalla pagina. Le fonti ammesse sono:
  1. **Memoria locale**: PageCard, snapshot ed estrazioni già presenti — risponde a
     "cosa so già su questo tema" senza alcuna chiamata esterna. È la modalità
     disponibile anche in privacy mode "solo locale".
  2. **API di ricerca licenziata** (es. Brave Search API), con chiave **solo lato
     backend** come per OpenRouter, quando l'utente richiede risultati dal web.
  3. **Pagine aperte esplicitamente** dall'utente e selezionate per il confronto.
- Ogni affermazione dell'overview deve essere **attribuita a una fonte cliccabile**;
  senza fonti sufficienti l'overview dichiara l'incertezza invece di inventare.
- L'overview rispetta i flag per pagina (`allowAI`) e le tre privacy mode; in
  "conferma per invio" richiede consenso prima di ogni chiamata.
- È un'operazione **a consumo**: rientra nel budget/quota del piano (v. sezione
  successiva) ed è contabilizzata per utente/org.

## Abbonamenti e monetizzazione

L'accesso alle funzioni AI (chat, overview, classificazione, riassunti) è a consumo e
richiede un piano attivo. Serve un **sito pubblico di acquisto e gestione abbonamento**,
distinto dalla dashboard admin interna.

- Nuova app web pubblica (Next.js, coerente con `apps/admin`): pagine piano e prezzi,
  registrazione, checkout, area cliente (fatture, consumo, upgrade/downgrade, disdetta).
- **Pagamenti solo tramite provider esterno** (es. Stripe): il prodotto non tratta né
  memorizza dati di carta; il flusso di pagamento avviene sul provider.
- Il ciclo di vita dell'abbonamento è guidato dai **webhook** del provider e persistito
  lato server sull'organizzazione già esistente (`org` + ruoli owner/admin/member).
- Il desktop non conosce prezzi né segreti di pagamento: riceve dal backend solo il
  proprio **entitlement** (piano attivo, quote residue) e degrada con grazia quando la
  quota è esaurita — il browser resta pienamente utilizzabile senza AI.
- Le quote si agganciano al budget AI già presente (`packages/ai/src/budget.ts`),
  estendendolo da limite tecnico a limite commerciale per piano.
- Requisiti legali minimi: termini di servizio, privacy policy, informativa sui
  subfornitori AI, gestione IVA/fatturazione e diritto di recesso.

## Non-obiettivi (alpha)

- Nessuno scraping SERP automatico (vale anche per la ricerca overview).
- Nessun invio email/pagamenti/azioni critiche automatiche da parte dell'AI.
- Nessun code signing simulato senza certificati reali.
