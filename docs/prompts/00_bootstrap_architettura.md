# Prompt 00 — Bootstrap, architettura e monorepo

Leggi `CLAUDE.md`, ispeziona il repository e costruisci le fondamenta del progetto.

## Obiettivo

Creare un monorepo avviabile e documentato, senza ancora tentare di completare tutte le funzionalità del browser.

## Struttura richiesta

```text
apps/
  desktop/
  api/
  worker/
  admin/
packages/
  contracts/
  database/
  shared/
  config/
  ui/
  ai/
  search/
infra/
  docker/
  coolify/
  scripts/
docs/
```

## Attività

1. Configura pnpm workspaces e Turborepo.
2. Abilita TypeScript strict, ESLint e Prettier condivisi.
3. Crea app minime compilabili:
   - Electron desktop con React e Vite;
   - API con endpoint `/health`, `/health/live`, `/health/ready`;
   - worker BullMQ minimale;
   - dashboard Next.js minimale.
4. Crea package condivisi per contratti, configurazione e tipi.
5. Configura test con Vitest e una base Playwright.
6. Crea `.env.example` senza segreti reali.
7. Crea:
   - `docs/PRODUCT_REQUIREMENTS.md`
   - `docs/ARCHITECTURE.md`
   - `docs/DATABASE.md`
   - `docs/DEVELOPMENT.md`
   - `IMPLEMENTATION_STATUS.md`
8. Centralizza branding provvisorio:
   - product name;
   - bundle identifier `com.businessbox.browser`;
   - nome applicazione;
   - URL API;
   - canale release.
9. Aggiungi script root coerenti:

```text
pnpm dev
pnpm dev:desktop
pnpm dev:api
pnpm dev:worker
pnpm dev:admin
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

## Decisioni architetturali da documentare

- Electron desktop separato dai servizi Coolify.
- SQLite locale per funzionamento offline.
- PostgreSQL remoto per account, organizzazioni e sincronizzazione.
- Sessioni Chromium separate per workspace.
- Provider AI astratto, con OpenRouter implementato in una fase successiva.
- Search engine manager astratto, implementato in una fase successiva.
- Sincronizzazione local-first con coda mutazioni.

## Criteri di accettazione

- `pnpm install` funziona.
- Tutte le app compilano.
- API health risponde.
- Desktop apre una finestra React.
- Lint e typecheck passano.
- Esiste almeno un test unitario per app o package principale.
- La documentazione descrive chiaramente i confini tra desktop e Coolify.

Non implementare ancora tab avanzate, OpenRouter o sincronizzazione completa. Costruisci fondamenta pulite e realmente eseguibili.
