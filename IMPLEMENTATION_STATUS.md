# IMPLEMENTATION_STATUS

Ultimo aggiornamento: 2026-07-19 — fase 00 completata.

## Stato fasi

| Fase | Argomento                                  | Stato          |
| ---- | ------------------------------------------ | -------------- |
| 00   | Bootstrap, architettura e monorepo         | ✅ completata  |
| 01   | Shell browser Electron (`WebContentsView`) | ✅ completata  |
| 02   | Smart Tabs, sidebar e WorkBox              | ✅ completata  |
| 03   | Gestore multi-motore di ricerca            | ✅ completata  |
| 04   | Persistenza locale, estrazione e memoria   | ⬜ da iniziare |
| 05   | AI con GLM 5.2 tramite OpenRouter          | ⬜ da iniziare |
| 06   | Backend, autenticazione e sincronizzazione | ⬜ da iniziare |
| 07   | Hardening di sicurezza e privacy           | ⬜ da iniziare |
| 08   | Docker e deploy su Coolify                 | ⬜ da iniziare |
| 09   | Test E2E, build desktop e release          | ⬜ da iniziare |
| 10   | Audit finale e consegna alpha              | ⬜ da iniziare |

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
