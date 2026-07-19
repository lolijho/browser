# IMPLEMENTATION_STATUS

Ultimo aggiornamento: 2026-07-19 — fase 00 completata.

## Stato fasi

| Fase | Argomento                                  | Stato                               |
| ---- | ------------------------------------------ | ----------------------------------- |
| 00   | Bootstrap, architettura e monorepo         | ✅ completata                       |
| 01   | Shell browser Electron (`WebContentsView`) | ✅ completata                       |
| 02   | Smart Tabs, sidebar e WorkBox              | ✅ completata                       |
| 03   | Gestore multi-motore di ricerca            | ✅ completata                       |
| 04   | Persistenza locale, estrazione e memoria   | ✅ completata                       |
| 05   | AI con GLM 5.2 tramite OpenRouter          | 🟡 nucleo completato (v. dettaglio) |
| 06   | Backend, autenticazione e sincronizzazione | ✅ completata                       |
| 07   | Hardening di sicurezza e privacy           | ⬜ da iniziare                      |
| 08   | Docker e deploy su Coolify                 | ⬜ da iniziare                      |
| 09   | Test E2E, build desktop e release          | ⬜ da iniziare                      |
| 10   | Audit finale e consegna alpha              | ⬜ da iniziare                      |

## Fase 06 — dettaglio (2026-07-19)

### Architettura dati testabile

Il layer dati è dietro l'interfaccia `Repositories` con **due implementazioni**:
in-memory (test + dev/alpha senza Postgres) e **PostgreSQL** (`pg`). La stessa
logica di auth, sync e tenancy gira identica su entrambe, quindi i criteri di
accettazione sono testati end-to-end anche dove qui non c'è un Postgres attivo.

### Fatto

- **Schema PostgreSQL multi-tenant** (`apps/api/src/data/pg/schema.sql`): le 23+
  tabelle del prompt (users, organizations, organization_members, devices,
  refresh_tokens, workspaces, workspace_members, workboxes, page_cards,
  page_snapshots, tags, page_tags, entities, page_entities, notes, tasks,
  ai_conversations, ai_messages, ai_runs, ai_usage, sync_events, audit_logs,
  plans, subscriptions) + pgvector per gli embedding; migrazione idempotente
  con **advisory lock** (repliche concorrenti sicure).
- **Autenticazione**: registrazione, login, logout, reset password, verifica
  email predisposta; **Argon2id** per le password; access token JWT breve
  (jose); **refresh token rotation** con conservazione solo dell'hash e
  **rilevamento del riuso** (un token ruotato e riusato revoca l'intera catena
  del dispositivo); revoca dispositivo; confronto a tempo costante per non
  rivelare l'esistenza dell'account.
- **Multi-tenancy**: il guard verifica **server-side l'appartenenza**
  all'organizzazione a ogni richiesta; l'`org` proviene sempre dai claims
  firmati, mai dal corpo — difesa centrale contro IDOR/abuso tenant (testato).
- **API `/api/v1`** con moduli auth, users, devices, sync, admin, ai (fase 05),
  health; **OpenAPI** generato (`@fastify/swagger`).
- **Sincronizzazione local-first** (`SyncEngine`): UUID client-side,
  **idempotency key** (retry non duplica), versioni per il rilevamento
  conflitti, **tombstone** per le eliminazioni, **conflitti espliciti** per note
  e spostamenti pagina concorrenti, **LWW documentato** solo per i campi
  semplici (per `updatedAt`); pull incrementale con cursore. Mai sincronizzati
  cookie/token/localStorage dei siti.
- **Desktop**: `AuthTokenStore` con **access token solo in memoria**, **refresh
  token cifrato via safeStorage** su disco (mai in chiaro, mai in localStorage),
  logout con cancellazione sicura del file (testato con crypto iniettabile).
- **Worker BullMQ**: code per classificazione, riassunti, embeddings, dedup,
  cleanup, email, sync; handler **idempotenti** (`runIdempotent` salta i
  contentHash già elaborati). Termina pulito senza `REDIS_URL`.
- **Dashboard admin** (Next.js): pagine reali collegate all'API admin —
  panoramica/salute, utenti, organizzazioni, consumo AI, code, feature flag,
  versioni desktop, audit log; chiave admin **solo server-side**; gli admin
  **non vedono il contenuto privato delle pagine** (le rotte non lo espongono).

### Test eseguiti (fase 06)

- `pnpm lint` ✅ — `pnpm typecheck` ✅ 17/17 — `pnpm build` ✅ 11/11.
- `pnpm test` ✅ **146 test** (api 35: auth register/login/refresh-rotation/
  riuso-furto/revoca-device/reset, sync applied/duplicate/tombstone/LWW/
  conflitti note+move/pull incrementale/**isolamento tenant** via HTTP, admin
  con chiave + 503 + OpenAPI; worker 4: idempotenza per contentHash; desktop
  30: incluso token-store safeStorage).

### Rimandato / note

- Verifica con **Postgres reale**: l'adapter `pg` compila e usa query
  parametrizzate; l'esecuzione contro un Postgres vivo avviene con
  `docker compose` nella fase 08 (qui non c'è un DB attivo).
- Verifica email/reset via email transazionale reale: predisposta (job `email`),
  invio effettivo con provider SMTP nella fase 08.
- Statistiche live delle code worker in admin: richiedono Redis (fase 08).
- Il client di sync nel desktop (mutation queue → push/pull con l'API) è
  predisposto lato token/auth; il collegamento completo alla UI prosegue.

## Fase 05 — dettaglio (2026-07-19)

### Fatto (nucleo funzionante end-to-end)

- **`@businessbox/ai` completo**: interfaccia `AIProvider` del prompt 05
  (streamChat, generateStructured, summarize, classify, healthCheck) con TRE
  implementazioni: **`OpenRouterGLMProvider`** (reale), `MockAIProvider`,
  `DisabledAIProvider`. Nessuna integrazione diretta Z.ai.
- **OpenRouter**: endpoint OpenAI-compatible `/chat/completions`, streaming
  SSE (parser robusto: chunk incompleti, commenti, `[DONE]`, CRLF), header di
  attribuzione, provider routing `{sort:price, allow_fallbacks,
require_parameters, data_collection:deny, zdr:true}`; **mai** il campo
  `models` (fallback solo tra provider dello stesso `z-ai/glm-5.2`); retry
  limitato con backoff esponenziale + jitter (mai su 4xx/auth), timeout,
  abort, **circuit breaker** (5 errori/30s → stop 60s).
- **Reasoning**: `high` default, `xhigh` selezionabile per richiesta; mai
  chain-of-thought esposta (system prompt esplicito).
- **Structured output**: `response_format: json_schema` + validazione Zod
  obbligatoria; schema di classificazione del prompt con **soglie 0.80/0.55**
  (auto / suggerisci / Da organizzare) implementate e testate.
- **Anti prompt-injection**: `sanitizeContentForAI()` (bearer/JWT/API key/
  cookie/carte/password nelle query → [REDACTED]), delimitazione fonti
  `<<<FONTE>>>…<<<FINE-FONTE>>>` con istruzione esplicita "dati, non
  istruzioni", test con pagina malevola.
- **Budget**: limiti per richiesta e giornalieri (Zod env), 429 a budget
  esaurito, **il browser continua a funzionare** (test); telemetria senza
  contenuti (modello, provider effettivo, token in/out/reasoning, costo,
  latenza, TTFT, finish reason, errore normalizzato).
- **Backend** (`/api/v1/ai`): chat SSE ritrasmesso al desktop (hijack,
  disconnessione→abort), summarize, health, usage; chiave SOLO server-side
  (`aiEnvSchema`); senza chiave → `DisabledAIProvider` (503/errore tipizzato,
  mai crash). CORS per il desktop (restrizione in fase 07-08).
- **Desktop**: flag **`allowAI` per pagina** (migrazione DB v3, toggle nel
  menu contestuale) — `allowAI=false` impedisce l'invio del contesto (test di
  accettazione); contesto = snapshot estratto sanitizzato nel main (mai il
  DOM live); **pannello AI reale**: chat streaming sulla pagina attiva,
  "Riassumi pagina", fonti usate mostrate, annulla generazione, errori chiari
  offline/budget.

### Rimandato (dichiarato, non simulato)

- Tool calling (search_local_pages, draft di note/task/email/report) e
  relative bozze; riassunto/chat WorkBox; confronto pagine; estrazione
  entità in UI; pipeline RAG completa con ricerca semantica (richiede
  pgvector, fase 06); classificazione automatica collegata al worker (fase
  06); limiti per utente/organizzazione/mese su `ai_usage` (fase 06).

### Test eseguiti (fase 05)

- `pnpm lint` ✅ — `pnpm typecheck` ✅ 17/17 — `pnpm build` ✅ 11/11.
- `pnpm test` ✅ **114 test** (ai 16: SSE parser, sanitize/injection, soglie,
  budget, breaker, OpenRouter con fetch finto — body/routing/no-models,
  auth senza retry, 5xx con retry, breaker aperto, structured Zod, abort;
  api 9: stream SSE ritrasmesso con fonti e [DONE], 400, 429 budget,
  summarize con usage, disabled 503 e health sempre ok).

### Verifica reale OpenRouter

- La chiamata live a `z-ai/glm-5.2` (chiave reale, supporto effettivo di
  `reasoning.effort=xhigh` con `require_parameters=true`) va verificata con
  `OPENROUTER_API_KEY` impostata: questo ambiente non ha la chiave né
  l'egress. Procedura: `.env` con la chiave → `pnpm dev:api` →
  `pnpm dev:desktop` → pannello AI.

## Fase 04 — dettaglio (2026-07-19)

### Fatto

- **`@businessbox/database`**: driver SQLite astratto con implementazione su
  `node:sqlite` (valutazione better-sqlite3 documentata in docs/DATABASE.md),
  migrazioni versionate (v1: 20 tabelle richieste + FTS5; v2: indici),
  `LocalDatabase` con integrity check, quarantena file corrotto e backup
  `VACUUM INTO`, `Repositories` tipizzati (modello browser, snapshot,
  cronologia, impostazioni KV, ricerca FTS con filtri).
- **Persistenza**: `PersistenceService` nel main — carica all'avvio (hydrate del
  TabStore + import impostazioni motori), salva con debounce 800ms a ogni
  mutazione, flush su `will-quit`. Stato di sessione persistito (workspace
  attivo + ultima pagina attiva per workspace).
- **Ripristino al riavvio**: ultimo workspace, pagina attiva ricreata, pinned
  ricreate entro il limite hot, tutte le altre cold, WorkBox e ordinamento
  preservati, stessa `session_partition` (assert nel controller).
- **Estrazione** nel preload isolato con **Mozilla Readability** (bundled):
  testo leggibile, headings, meta description, lingua, canonical, Open Graph,
  JSON-LD validato (mai eseguito), autore/data, link principali (dedup, max
  25), testo tabelle; sanitizzazione (control char) e limiti severi su ogni
  campo (Zod nel main); mai bloccante; SPA gestite con richiesta di
  ri-estrazione debounced su `did-navigate-in-page`.
- **Content hash**: sha256 di titolo+testo+tabelle — se invariato lo snapshot
  non viene riscritto (niente re-processing); `normalized_url_hash` con host
  normalizzato e parametri di tracking rimossi.
- **Screenshot**: `capturePage` best-effort della sola pagina attiva (PNG in
  `userData/screenshots/`), rispetta `allowScreenshot` per pagina (toggle nel
  menu contestuale) e il flag globale `screenshots.enabled`; comando "Elimina
  screenshot salvato"; nessuna sincronizzazione.
- **Ricerca locale**: sezione "Archivio" nella sidebar (debounce 250ms) con
  snippet FTS evidenziati; filtri API: workspace, WorkBox, dominio, pinned,
  archiviate, limite.
- **Cronologia**: `page_navigation_history` alimentata da `did-navigate` e
  `did-navigate-in-page`.

### Test eseguiti (fase 04)

- `pnpm lint` ✅ — `pnpm typecheck` ✅ 16/16 — `pnpm build` ✅ 11/11.
- `pnpm test` ✅ **94 test** (database 14: migrazioni da zero/da versione
  precedente/idempotenti, quarantena corrotto, backup+restore, roundtrip
  modello, prune pagine eliminate, content hash dedupe, FTS su testo e
  tabelle, filtri, cronologia, query FTS ostili, normalizzazione URL).

### Problemi aperti / note

- Il riavvio reale dell'app (restore end-to-end con finestra) va verificato con
  il binario Electron (artifact CI / `pnpm dev:desktop`): la logica è coperta
  dai test di hydrate/restore ma non da un test Playwright Electron (fase 09).
- `node:sqlite` emette un ExperimentalWarning su Node 22: innocuo; sparisce con
  i runtime Node 24+ (Electron recente).
- Tabelle `tags/entities/notes/tasks/ai_*/classification_rules/sync_*` create e
  migrate: la logica applicativa arriva nelle fasi 05-06.

## Fase 03 — dettaglio (2026-07-19)

### Fatto

- **`ConfigurableSearchEngineManager`** (`@businessbox/search`, puro e testato):
  7 motori preinstallati nel registry centralizzato (Google `g`, Brave `br`,
  Bing `b`, DuckDuckGo `d`, Startpage `s`, Qwant `q`, Ecosia `e`), default
  globale Google, **default modalità privata Brave** (pronto per la fase 07),
  default per workspace con ereditarietà del globale, selezione temporanea mai
  persistita, risoluzione keyword (workspace prima di globale) e alias.
- **Precedenze omnibox**: override esplicito → `:keyword query` → `/alias
query` → URL completo → dominio → ricerca col default del contesto. Le
  ricerche web normali non toccano mai l'AI. Slot comandi browser/AI riservati
  alle fasi 05+ (documentato).
- **Motori custom**: validazioni severe (HTTPS salvo localhost dev, `%s`
  obbligatorio, blocco `javascript:`/`data:`/`file:`, keyword univoca nello
  scope, **rifiuto di credenziali nei template** — parametri api_key/token/…),
  query sempre `encodeURIComponent`. Rimozione consentita solo per
  custom/opensearch con reset dei default.
- **OpenSearch**: rilevamento nel preload isolato (`link rel=search`), fetch
  del descriptor solo HTTPS ≤64KB nel main, parsing conservativo (ShortName +
  template html, `{searchTerms}`→`%s`, parametri opzionali rimossi),
  **proposta con conferma esplicita** (banner Aggiungi/Ignora), dedupe per
  template e per descriptor già visto.
- **Import/export impostazioni** (JSON validato Zod; i built-in restano
  canonici; export negli appunti, import da textarea).
- **UI**: icona del motore a sinistra nell'omnibox con menu (usa solo questa
  volta / default globale / default workspace / rimuovi / gestisci…), modalità
  **keyword+Tab** con chip del motore temporaneo (Esc/Backspace per uscire),
  dialogo "Motori di ricerca" (elenco, default, aggiunta custom con errori
  inline, import/export), suggerimenti **solo locali** (pagine aperte del
  workspace, etichettati come locali).
- Suggerimenti remoti: NON implementati — restano disabilitati finché non
  esisterà il consenso persistito (fase 04); mai attivi in privata (fase 07).

### Test eseguiti (fase 03)

- `pnpm lint` ✅ — `pnpm typecheck` ✅ 15/15 — `pnpm build` ✅ 11/11.
- `pnpm test` ✅ **80 test** (search 33: cambio Google↔Brave senza riavvio,
  default workspace con ereditarietà, `:br crm per pmi` → Brave e query
  successiva → default, alias, precedenze, override temporaneo non persistito,
  custom valido funzionante, template pericolosi/credenziali rifiutati,
  keyword duplicata rifiutata, import/export roundtrip, OpenSearch parsing e
  non-installazione senza conferma).

### Problemi aperti / note

- I suggerimenti remoti (`suggestUrlTemplate`) attendono il consenso
  persistito della fase 04.
- Le impostazioni motori sono in-memory: la persistenza (tabelle
  `search_engines`, `workspace_search_settings`) arriva con la fase 04.
- La modalità privata che usa il default Brave arriva con la fase 07 (l'API
  `getDefaultFor({privateMode})` è già pronta e testata).

## Fase 02 — dettaglio (2026-07-19)

### Fatto

- **Modello dati** (`@businessbox/contracts`): `PageCard` completo del prompt 02
  (workBoxId, parentPageId, domain, state hot/warm/cold, pinned, keepAlive,
  dirtyState, archived, sessionPartition, scrollPosition, timestamp) +
  `Workspace` e `WorkBox`.
- **TabStore** (dominio puro, in-memory fino alla fase 04): regole 1-7 del
  lifecycle — nuova pagina attiva, top bar = attiva + pinned, max 3 pinned con
  flusso "scegli quale sostituire", chiusura dalla barra = archiviazione,
  eliminazione definitiva esplicita con conferma se dirty; workspace multipli
  con attiva per workspace; WorkBox con validazione workspace; duplica, sposta,
  keep alive, dirty ⇒ keepAlive temporaneo.
- **Motore lifecycle puro** (`computeDesiredLifecycle`): hot = attiva+pinned del
  workspace attivo (max 4), warm = renderer vivi recenti (max 6, timeout 5 min
  configurabile), cold = renderer distrutto; dirty/keepAlive mai declassate
  automaticamente; archiviate sempre cold. Tick periodico (30 s) nel controller.
- **BrowserController riconciliatore**: distrugge i renderer che diventano cold,
  ricrea le pagine cold alla riattivazione **nella stessa session partition**
  (assert di coerenza), ripristina la posizione di scroll dopo il restore.
- **Dirty state**: preload isolato nelle pagine remote che osserva input,
  textarea, contenteditable e submit **senza mai leggere i valori dei campi**;
  esclusi password, hidden, autocomplete cc-*/one-time-code e nomi sensibili
  (card/cvv/iban/token/otp/pin…). Badge nella UI, conferma prima della chiusura
  definitiva. Scroll tracciato (solo coordinata Y, throttling 500 ms).
- **Sidebar completa**: switcher workspace (creazione inclusa), elenco WorkBox,
  ricerca rapida, lista **virtualizzata** (@tanstack/react-virtual), drag&drop
  delle pagine su WorkBox/Da organizzare (aggiorna realmente il modello), menu
  contestuale (apri, pin/unpin, keep alive, sposta in…, archivia/ripristina,
  duplica, copia URL, elimina definitivamente), contatori per sezione, sezioni
  Pinned/Recenti/WorkBox/Da organizzare/Archiviate, indicatore stato
  hot/warm/cold per pagina.
- **Dialoghi**: sostituzione quarta pinned; conferma eliminazione pagina dirty;
  creazione workspace/WorkBox. Status bar con contatori hot/warm/cold e nome
  workspace. Copia URL via clipboard nel main (IPC dedicato).

### Test eseguiti (fase 02)

- `pnpm lint` ✅ — `pnpm typecheck` ✅ 15/15 — `pnpm build` ✅ 11/11.
- `pnpm test` ✅ **66 test** (desktop 26: TabStore con regole 1-7, limite
  pinned con sostituzione, archivia/elimina, dirty→conferma, 10 pagine
  recuperabili, partizioni per workspace, drag&drop, duplica, attiva per
  workspace; lifecycle-rules 7 casi; pin-rules; sessioni; app-info).

### Problemi aperti / note

- Il timeout warm→cold e i limiti hot/warm sono costanti condivise
  (`@businessbox/shared`), configurabili dal controller; la configurabilità
  utente arriva con le impostazioni (fase 04+).
- La virtualizzazione usa altezze stimate fisse (26/32 px): sufficiente per
  liste piatte; da rivedere se le card diventeranno multielemento.
- Persistenza al riavvio: fase 04 (oggi il modello è in-memory).

## Fase 01 — dettaglio (2026-07-19)

### Fatto

- **BrowserController** nel main process (`apps/desktop/src/main/browser/`):
  creazione/distruzione `WebContentsView`, loadURL, back/forward/reload/stop
  (API `navigationHistory`), eventi titolo/URL/favicon/loading/target-url,
  crash del renderer segnalato e ripristinabile, errori di navigazione con
  pagina interna di errore, popup intercettati con `setWindowOpenHandler` e
  trasformati in nuove pagine dello stesso workspace (mai finestre arbitrarie).
- **Bounds**: il renderer misura l'area contenuto (ResizeObserver) e la
  comunica via IPC; il main posiziona la view attiva e la segue a ogni resize
  e apertura/chiusura dei pannelli. Solo la view attiva è attaccata alla
  finestra.
- **WorkspaceSessionManager** con `persist:workspace-<id>`, factory iniettabile,
  permessi deny-by-default per sessione; test che dimostra partizioni distinte
  per due workspace. Fase 01 usa il workspace `default`.
- **Navigazione iniziale**: newtab interna `businessbox://newtab` resa dalla
  shell React (zero contenuto remoto); omnibox con classificatore URL/ricerca
  (`@businessbox/search`, testato); ricerca instradata dietro
  `SearchEngineManager` (registry dei 7 motori centralizzato, default Google,
  implementazione completa in fase 03).
- **Layout**: barra superiore (indietro/avanti/ricarica-stop, omnibox, titolo
  pagina attiva, area 3 pinned con limite applicato dal main, pulsanti sidebar
  e AI, menu impostazioni Radix), sidebar sinistra richiudibile con sezioni
  Pinned/Aperte e azioni (attiva, pin/unpin, chiudi), pannello AI destro
  richiudibile (placeholder funzionale), status bar (stato caricamento, URL,
  target-url hover, contatore pagine).
- **Scorciatoie** via menu applicativo: Ctrl/Cmd+L, Ctrl/Cmd+T, Ctrl/Cmd+R,
  Ctrl/Cmd+B, Ctrl/Cmd+Shift+A, Alt+Left/Right.
- **Sicurezza**: sandbox globale, contextIsolation, nessun preload nelle pagine
  remote, IPC nominati con Zod e verifica del mittente (solo la shell),
  navigazione limitata a http/https, `will-attach-webview` bloccato, nessun
  bypass TLS, shell con window-open e will-navigate negati.
- **UI stack**: Zustand (store shell), Tailwind 4, Radix UI dropdown.

### Test eseguiti (fase 01)

- `pnpm lint` ✅ — `pnpm typecheck` ✅ 15/15 — `pnpm build` ✅ 11/11.
- `pnpm test` ✅ 48 test (search 19: classificatore omnibox, registry motori,
  template; desktop 8: sessioni workspace, regola max 3 pinned, app-info).

### Problemi aperti / note

- Verifica interattiva (apertura siti reali, resize, crash/restore) eseguibile
  solo dove il binario Electron è disponibile: `pnpm dev:desktop` in locale o
  artifact CI macOS. In questo ambiente remoto la egress policy lo impedisce.
- Il flusso "quarta pinned → scegli quale sostituire" è deliberatamente
  rimandato alla fase 02 (ora: rifiuto con messaggio in sidebar).
- `update-target-url` emette lo snapshot completo: se diventasse rumoroso,
  introdurre un canale evento dedicato leggero.

## Fase 00 — dettaglio

### Fatto

- Monorepo pnpm + Turborepo (`apps/*`, `packages/*`, `infra/`, `docs/`, `e2e/`).
- TypeScript strict condiviso (`tsconfig.base.json`), ESLint 10 flat + typescript-eslint,
  Prettier.
- `apps/api`: Fastify 5 con `/health`, `/health/live`, `/health/ready` (contratti Zod
  condivisi, check non attivi dichiarati `skipped`).
- `apps/worker`: worker BullMQ minimale (coda `businessbox-system`, job `heartbeat`,
  graceful shutdown; termina in modo pulito senza `REDIS_URL`).
- `apps/admin`: Next.js 16 minimale con branding centralizzato.
- `apps/desktop`: Electron 43 + React 19 + electron-vite; sandbox globale,
  `contextIsolation`, preload minimo tipizzato, IPC allowlist validato Zod
  (`app:get-info`), permessi deny-by-default, `setWindowOpenHandler` deny.
- `packages/contracts` (Zod: health, app-info, allowlist IPC), `packages/config`
  (env tipizzate), `packages/shared` (branding + regole prodotto: max 3 pinned,
  partizioni `persist:workspace-<id>`), `packages/search` (modello SearchEngine +
  validazione template con blocklist protocolli e `encodeURIComponent`, testata),
  `packages/ai` (interfaccia AIProvider + DisabledAIProvider funzionante),
  `packages/database` e `packages/ui` (costanti stabili, implementazione nelle fasi 04 e 01-02).
- Vitest: 8 suite di unit test (contracts, config, shared, search, ai, worker, api, desktop).
- Base Playwright in `e2e/` (avvia l'API reale e verifica gli endpoint health).
- `.env.example` senza segreti; branding centralizzato (`com.businessbox.browser`).
- Documentazione: PRODUCT_REQUIREMENTS, ARCHITECTURE (con motivazione Fastify vs
  NestJS), DATABASE (piano SQLite/PostgreSQL + mappatura sync), DEVELOPMENT.
- Copia dei prompt di fase in `docs/prompts/` con manifest.

### Non fatto (per scelta, come da prompt 00)

- Nessuna tab avanzata, `WebContentsView`, OpenRouter reale o sincronizzazione.
- Nessun Docker Compose (fase 08), nessuno schema database (fasi 04/06).

### Note e incongruenze rilevate nei prompt

1. Gli schemi SQLite (f.04) e PostgreSQL (f.06) divergono volutamente; la mappatura è
   documentata in `docs/DATABASE.md`.
2. `OPENROUTER_MAX_TOKENS` e `OPENROUTER_TIMEOUT_MS` compaiono nel prompt 05 ma non
   nell'elenco variabili del prompt 08: inclusi comunque in `.env.example`.
3. Il supporto `reasoning effort high/xhigh` di `z-ai/glm-5.2` andrà verificato a
   runtime contro OpenRouter nella fase 05 (interazione con `require_parameters=true`).
4. Conteggio hot (max 4) vs 1 attiva + 3 pinned coincide; il caso pinned-e-attiva +
   keep-alive dirty verrà precisato nella fase 02 con limiti configurabili.

### Test eseguiti (2026-07-19)

- `pnpm lint` — ✅ 0 errori (ESLint 10 + typescript-eslint).
- `pnpm typecheck` — ✅ 14/14 task.
- `pnpm test` — ✅ 8 suite, 29 test passati (contracts 5, config 5, shared 3,
  search 7, ai 2, worker 2, desktop 2, api 3).
- `pnpm test:e2e` — ✅ 2/2 (Playwright avvia l'API reale e verifica gli health endpoint).
- `pnpm build` — ✅ 11/11 task (packages tsc, api, worker, admin Next 16, desktop electron-vite).
- Smoke test worker senza `REDIS_URL` — ✅ esce con codice 0 e messaggio esplicito.

### Aggiunta post-fase 00: packaging macOS anticipato (2026-07-19)

Su richiesta, parte del packaging della fase 09 è stata anticipata:

- `apps/desktop/electron-builder.yml` — config packaging (mac dmg+zip arm64/x64,
  win NSIS e linux AppImage/deb predisposti), `appId com.businessbox.browser`,
  output in `apps/desktop/release/` (gitignorata), nessuna firma simulata.
- Script `build:mac`, `build:win`, `build:linux` in `apps/desktop`.
- Workflow CI `.github/workflows/desktop-mac-build.yml`: build su runner macOS a ogni
  push rilevante, artifact scaricabile `businessbox-browser-mac` (dmg+zip, arm64+x64).
- Documentazione: `docs/DESKTOP_RELEASE.md` (come ottenere/aprire l'app non firmata).

Restano per la fase 09: matrice completa multi-OS su tag `v*`, canali, auto-update,
firma/notarization con certificati reali.

Esito verificato: run #3 del workflow (commit `ea11a26`) concluso con successo sul
runner macOS; artifact `businessbox-browser-mac` (~489 MB: dmg+zip per arm64 e x64)
pubblicato. I run #1-2 erano falliti per `${name}` nell'`artifactName` (la `/` di
`@businessbox/desktop` veniva letta come directory), corretto con nome letterale.

### Limitazioni dell'ambiente di sviluppo remoto

- Il binario Electron non è scaricabile in questo ambiente: la egress policy del proxy
  blocca `github.com/electron/electron/releases` (403). Il bundle desktop compila
  correttamente (`electron-vite build` ✅) e i test unitari del main process passano,
  ma l'apertura reale della finestra va verificata su una macchina con accesso a
  GitHub Releases (`pnpm install` scarica il binario automaticamente) — criterio di
  accettazione "Desktop apre una finestra React" verificabile localmente, non qui.

### Come provare la fase

Vedi `docs/DEVELOPMENT.md` → "Verifiche rapide fase 00".
