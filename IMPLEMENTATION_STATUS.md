# IMPLEMENTATION_STATUS

Ultimo aggiornamento: 2026-07-19 — fase 00 completata.

## Stato fasi

| Fase | Argomento                                  | Stato          |
| ---- | ------------------------------------------ | -------------- |
| 00   | Bootstrap, architettura e monorepo         | ✅ completata  |
| 01   | Shell browser Electron (`WebContentsView`) | ⬜ da iniziare |
| 02   | Smart Tabs, sidebar e WorkBox              | ⬜ da iniziare |
| 03   | Gestore multi-motore di ricerca            | ⬜ da iniziare |
| 04   | Persistenza locale, estrazione e memoria   | ⬜ da iniziare |
| 05   | AI con GLM 5.2 tramite OpenRouter          | ⬜ da iniziare |
| 06   | Backend, autenticazione e sincronizzazione | ⬜ da iniziare |
| 07   | Hardening di sicurezza e privacy           | ⬜ da iniziare |
| 08   | Docker e deploy su Coolify                 | ⬜ da iniziare |
| 09   | Test E2E, build desktop e release          | ⬜ da iniziare |
| 10   | Audit finale e consegna alpha              | ⬜ da iniziare |

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

### Limitazioni dell'ambiente di sviluppo remoto

- Il binario Electron non è scaricabile in questo ambiente: la egress policy del proxy
  blocca `github.com/electron/electron/releases` (403). Il bundle desktop compila
  correttamente (`electron-vite build` ✅) e i test unitari del main process passano,
  ma l'apertura reale della finestra va verificata su una macchina con accesso a
  GitHub Releases (`pnpm install` scarica il binario automaticamente) — criterio di
  accettazione "Desktop apre una finestra React" verificabile localmente, non qui.

### Come provare la fase

Vedi `docs/DEVELOPMENT.md` → "Verifiche rapide fase 00".
