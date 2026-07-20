# infra/docker

Dockerfile multi-stage per i servizi server (fase 08). Contesto di build =
**radice del monorepo**.

| File               | Servizio         | Note                                             |
| ------------------ | ---------------- | ------------------------------------------------ |
| `Dockerfile.api`   | API Fastify      | build → `pnpm deploy --prod`, runtime non-root   |
| `Dockerfile.worker`| Worker BullMQ    | endpoint di liveness su loopback                 |
| `Dockerfile.admin` | Dashboard Next.js| output `standalone`, runtime non-root            |
| `dev.env`          | —                | variabili **fittizie** per lo stack Compose in locale |

Caratteristiche: build multi-stage, utente `node` non-root, `pnpm install
--frozen-lockfile`, immagini ridotte, nessun `.env` copiato (escluso da
`.dockerignore`). L'app desktop Electron **non** viene containerizzata.

Vedi `docs/COOLIFY_DEPLOY.md`.
