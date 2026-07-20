# BusinessBox Browser

Browser desktop AI-first per imprenditori e professionisti: Chromium reale incorporato
in Electron, barra superiore sempre pulita (1 pagina attiva + max 3 pinned), pagine
organizzate automaticamente in sidebar/WorkBox, motori di ricerca configurabili e AI
(GLM 5.2 via OpenRouter) con chiave solo lato server.

> Stato: **alpha — fasi 00–10 completate** (fase 05 AI: nucleo). Build server e
> desktop verdi negli ambienti disponibili; test 160/160. Vedi
> `IMPLEMENTATION_STATUS.md`, `docs/RELEASE_CHECKLIST.md`, `docs/KNOWN_ISSUES.md`.

## Struttura

```text
apps/       desktop (Electron), api (Fastify), worker (BullMQ), admin (Next.js)
packages/   contracts, config, shared, database, ui, ai, search
infra/      docker, coolify, scripts (fase 08)
e2e/        base Playwright
docs/       documentazione + prompt di fase (docs/prompts/)
```

## Avvio rapido

```bash
pnpm install
pnpm build
pnpm dev:api      # http://localhost:3000/health
pnpm dev:desktop  # finestra Electron
```

Verifica completa: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
Stack server in locale: `docker compose --env-file infra/docker/dev.env -f docker-compose.yml -f docker-compose.dev.yml up --build`.
Tutti i comandi e i dettagli: `docs/DEVELOPMENT.md`.

## Ordine di esecuzione del progetto

Le fasi sono definite dai prompt in `docs/prompts/` e vanno eseguite in ordine:

| Fase | Argomento                                             |
| ---- | ----------------------------------------------------- |
| 00   | Bootstrap, architettura e monorepo                    |
| 01   | Shell browser Electron (`WebContentsView`)            |
| 02   | Smart Tabs, sidebar e WorkBox                         |
| 03   | Gestore multi-motore di ricerca                       |
| 04   | Persistenza locale, estrazione e memoria delle pagine |
| 05   | AI con GLM 5.2 tramite OpenRouter                     |
| 06   | Backend, autenticazione e sincronizzazione            |
| 07   | Hardening di sicurezza e privacy                      |
| 08   | Docker e deploy su Coolify                            |
| 09   | Test end-to-end, build desktop e release              |
| 10   | Audit finale e consegna alpha                         |

## Documenti chiave

- `CLAUDE.md` — istruzioni permanenti del progetto
- `docs/PRODUCT_REQUIREMENTS.md` — requisiti di prodotto
- `docs/ARCHITECTURE.md` — architettura e confini desktop/Coolify
- `docs/DATABASE.md` — piano database locale/remoto
- `docs/DEVELOPMENT.md` — guida allo sviluppo
- `docs/COOLIFY_DEPLOY.md` — deploy dello stack server su Coolify
- `docs/DESKTOP_RELEASE.md` — build e release dell'app desktop
- `docs/SECURITY.md` / `docs/THREAT_MODEL.md` / `docs/PRIVACY_ARCHITECTURE.md` — sicurezza e privacy
- `docs/RELEASE_CHECKLIST.md` — stato test e criteri di rilascio alpha
- `docs/KNOWN_ISSUES.md` — limiti noti dell'alpha
- `docs/ROADMAP.md` — prossime milestone
- `IMPLEMENTATION_STATUS.md` — stato reale di avanzamento
