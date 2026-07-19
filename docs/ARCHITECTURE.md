# Architettura — BusinessBox Browser

## Vista d'insieme

```text
┌─────────────────────────────┐        ┌──────────────────────────────────────┐
│ Desktop (Electron)          │  HTTPS │ Server (Coolify)                     │
│  main process               │◄──────►│  api    (Fastify, /api/v1)           │
│   - browser controller      │        │  worker (BullMQ)                     │
│   - WebContentsView (f.01)  │        │  admin  (Next.js)                    │
│   - IPC allowlist + Zod     │        │  postgres + pgvector (privato)       │
│  renderer (React + Vite)    │        │  redis (privato)                     │
│  SQLite locale (f.04)       │        └──────────────────────────────────────┘
└─────────────────────────────┘                      │ HTTPS
                                                     ▼
                                          OpenRouter (z-ai/glm-5.2)
```

## Confini desktop / Coolify

- **Il desktop non viene mai eseguito su Coolify.** È un'app installabile
  (NSIS/DMG/AppImage/deb) che funziona offline grazie a SQLite locale.
- **Coolify esegue solo i servizi server**: `api`, `worker`, `admin`, PostgreSQL, Redis.
  Solo `api` e `admin` sono pubblicati; database e Redis restano su rete privata.
- **La chiave OpenRouter vive solo nel backend.** Il desktop parla con l'API, mai
  direttamente con OpenRouter; nessun segreto entra nel bundle desktop.

## Decisioni architetturali

### 1. Backend: Fastify modulare (non NestJS)

Scelta motivata come richiesto dal prompt 00:

- il backend è un insieme contenuto di moduli REST + SSE + code, non un'applicazione
  enterprise a grafo di dipendenze complesso: il DI container e i decorator di NestJS
  aggiungerebbero un layer di astrazione senza beneficio proporzionato;
- Fastify 5 offre nativamente ciò che serve: schema validation integrabile con Zod,
  hooks, encapsulation per modulo (`/auth`, `/sync`, `/ai`, …), logging Pino, streaming
  SSE senza adattatori;
- meno dipendenze = superficie supply-chain minore (rilevante per il threat model, f.07);
- la struttura modulare è imposta dalla disciplina dei plugin Fastify: un modulo per
  dominio in `apps/api/src/modules/<dominio>` (da fase 06), ognuno con routes, schemi
  Zod condivisi da `@businessbox/contracts` e test.

### 2. SQLite locale per funzionamento offline

Il desktop è local-first: workspace, WorkBox, PageCard, snapshot e impostazioni vivono
in SQLite (`better-sqlite3`, fase 04) con migrazioni versionate. Il browser è pienamente
utilizzabile senza rete, senza account e senza AI.

### 3. PostgreSQL remoto per account e sincronizzazione

Account, organizzazioni, dispositivi, piani e lo stato sincronizzato vivono in
PostgreSQL (+pgvector per la ricerca semantica). Il server è la fonte di verità solo
per identità e autorizzazione; per i dati di navigazione è un replica-target regolato
dai flag privacy (`allowSync`).

### 4. Sessioni Chromium separate per workspace

Ogni workspace usa una partizione persistente dedicata
(`persist:workspace-<uuid>`, helper in `@businessbox/shared`), quindi cookie, storage
e login sono isolati tra workspace. La modalità privata usa sessioni in memoria senza
prefisso `persist:` (fase 07).

### 5. Provider AI astratto

`@businessbox/ai` definisce l'interfaccia `AIProvider`; `DisabledAIProvider` esiste già
(fase 00) e garantisce il funzionamento senza AI. `OpenRouterGLMProvider` e
`MockAIProvider` arrivano nella fase 05 nel backend. Nessuna integrazione diretta Z.ai.

### 6. Search engine manager astratto

`@businessbox/search` contiene il modello `SearchEngine` e le utility di validazione /
costruzione URL (già testate). Il `SearchEngineManager` completo (registry, keyword,
OpenSearch, scope workspace) è implementato nella fase 03; la shell (fase 01) instrada
le ricerche solo attraverso questa astrazione, senza dipendenze fisse da Google.

### 7. Sincronizzazione local-first con coda mutazioni

Le modifiche locali vengono accodate (`sync_queue`) con UUID client-side e idempotency
key, inviate con retry+backoff, riconciliate con `syncVersion` e tombstone; conflitti
espliciti per note e spostamenti concorrenti, LWW solo per campi semplici documentati
(fase 06).

## Monorepo

```text
apps/
  desktop/   Electron + React + Vite (electron-vite; main CJS, preload sandbox, renderer React)
  api/       Fastify (/health, /health/live, /health/ready; moduli di dominio da f.06)
  worker/    BullMQ (coda businessbox-system; code di dominio da f.05-06)
  admin/     Next.js (dashboard amministrativa, contenuti reali da f.06)
packages/
  contracts/ Schemi Zod condivisi (health, app-info, allowlist IPC)
  config/    Parsing tipizzato delle variabili d'ambiente (Zod)
  shared/    Branding centralizzato + regole di prodotto (max pinned, partizioni sessione)
  database/  Schema e migrazioni (SQLite f.04, PostgreSQL f.06)
  ui/        Componenti UI condivisi (f.01-02)
  ai/        Astrazione AIProvider + DisabledAIProvider
  search/    Modello SearchEngine + validazione template (manager completo in f.03)
infra/
  docker/    Dockerfile (f.08)
  coolify/   Compose per Coolify (f.08)
  scripts/   Migrazioni/backup (f.04, f.06, f.08)
e2e/         Base Playwright (API oggi; Electron dalle f.01/09)
docs/        Documentazione + copia dei prompt di fase
```

### Convenzioni

- TypeScript strict ovunque; `any` vietato salvo casi motivati e commentati.
- I package condivisi sono ESM compilati con `tsc` (`dist/` + declaration).
- Nel desktop, main e preload sono bundle CJS (richiesto dal preload sandboxed);
  i package workspace vengono inclusi nel bundle, non externalizzati.
- IPC: ogni canale è dichiarato nell'allowlist di `@businessbox/contracts` e validato
  con Zod; il preload espone solo metodi nominati, mai `ipcRenderer`.
- Contratti API e IPC vivono in `@businessbox/contracts`, mai duplicati nelle app.
