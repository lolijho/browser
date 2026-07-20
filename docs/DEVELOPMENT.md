# Sviluppo — BusinessBox Browser

## Prerequisiti

- Node.js ≥ 22.12
- pnpm 10 (`corepack enable` oppure `npm i -g pnpm`)
- Per il desktop su Linux headless: un display X/Wayland (o `xvfb-run`) per aprire la finestra

## Setup

```bash
pnpm install
cp .env.example .env   # opzionale in fase 00: tutte le variabili hanno default sensati
pnpm build             # compila packages e app (necessario prima del primo dev)
```

## Comandi principali (root)

| Comando            | Effetto                                                          |
| ------------------ | ---------------------------------------------------------------- |
| `pnpm dev`         | Avvia tutte le app in watch (via Turborepo)                      |
| `pnpm dev:desktop` | Solo app Electron (electron-vite dev, HMR)                       |
| `pnpm dev:api`     | Solo API Fastify su `http://localhost:3000`                      |
| `pnpm dev:worker`  | Solo worker BullMQ (termina se `REDIS_URL` non è impostata)      |
| `pnpm dev:admin`   | Solo dashboard Next.js su `http://localhost:3001`                |
| `pnpm lint`        | ESLint su tutto il repo                                          |
| `pnpm typecheck`   | `tsc --noEmit` per ogni package/app                              |
| `pnpm test`        | Unit test Vitest per ogni package/app                            |
| `pnpm test:e2e`    | Playwright (avvia l'API reale e ne verifica gli endpoint health) |
| `pnpm build`       | Build di tutti i package e app                                   |
| `pnpm format`      | Prettier su tutto il repo                                        |

## Verifiche rapide fase 00

```bash
# API
pnpm dev:api &
curl http://localhost:3000/health
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready

# Desktop (apre una finestra React con le info di runtime via IPC)
pnpm dev:desktop
```

## Struttura del repo

Vedi `docs/ARCHITECTURE.md`. Regole permanenti in `CLAUDE.md`; stato per fase in
`IMPLEMENTATION_STATUS.md`; prompt di fase in `docs/prompts/`.

## Note operative

- I package condivisi vanno ricompilati dopo modifiche (`pnpm build` o il `dependsOn`
  di Turborepo lo fa automaticamente per i task che li usano).
- Il worker senza `REDIS_URL` esce con codice 0 e un avviso: comportamento previsto in
  fase 00, Redis diventa un requisito dalla fase 06.
- Non committare mai `.env` o segreti; `.env.example` è l'unico riferimento versionato.
- Electron scarica il proprio binario al `pnpm install` (script post-install approvato
  in `package.json` → `pnpm.onlyBuiltDependencies`).
