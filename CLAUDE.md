# CLAUDE.md — Istruzioni permanenti del progetto

## Prodotto

Nome provvisorio: **BusinessBox Browser**. Tutto il branding deve essere centralizzato e modificabile.

Costruisci un browser desktop AI-first per imprenditori e professionisti. Non è una normale applicazione web: deve navigare siti reali tramite Chromium incorporato in Electron.

## Caratteristica principale

La barra superiore deve restare pulita:

- una pagina attiva;
- massimo tre pagine bloccate;
- tutte le altre pagine vengono automaticamente spostate nella sidebar;
- le pagine laterali sono organizzate in workspace e WorkBox;
- una pagina non è considerata chiusa solo perché non compare nella barra superiore.

## Stack vincolante

- Monorepo pnpm + Turborepo
- TypeScript strict
- Electron + React + Vite
- `WebContentsView`, non `BrowserView` e non `<webview>`
- Zustand, TanStack Query, Tailwind, Radix UI o shadcn/ui
- SQLite locale
- Backend Node.js con NestJS + Fastify oppure Fastify modulare ben motivato
- PostgreSQL + pgvector
- Redis + BullMQ
- Next.js per dashboard amministrativa
- Docker Compose e Coolify
- OpenRouter come provider AI
- Modello predefinito: `z-ai/glm-5.2`

## Motori di ricerca

Il browser deve consentire di usare e cambiare:

- Google
- Brave Search
- Bing
- DuckDuckGo
- Startpage
- Qwant
- Ecosia
- motori personalizzati con template `%s`
- motori rilevati tramite OpenSearch

Nessuno scraping automatico delle SERP. Una ricerca normale genera l'URL del motore scelto e lo apre nel browser.

## Sicurezza Electron

Obbligatorio:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- preload minimo e tipizzato
- IPC esplicito, validato con Zod e con allowlist
- nessuna esposizione diretta di `ipcRenderer`
- permessi negati per impostazione predefinita
- `setWindowOpenHandler`
- nessuna chiave API nel renderer o nel bundle desktop
- sessioni separate tramite `persist:workspace-<id>`

## Qualità

- Non produrre mockup scollegati.
- Ogni fase deve creare una vertical slice funzionante.
- Non usare `any` salvo casi motivati e documentati.
- Non lasciare pseudocodice o TODO generici.
- Non dichiarare completata una funzionalità simulata.
- Aggiorna sempre `IMPLEMENTATION_STATUS.md`.
- Esegui lint, typecheck e test prima di concludere ogni fase.
- Correggi gli errori trovati, non nasconderli.
- Mantieni migrazioni e schema versionati.

## Metodo di lavoro

Prima di modificare il codice:

1. leggi questo file;
2. leggi `docs/ARCHITECTURE.md` se esiste;
3. leggi `IMPLEMENTATION_STATUS.md` se esiste;
4. ispeziona repository, package e configurazioni;
5. preserva il lavoro valido già esistente;
6. scrivi un breve piano operativo nel terminale o nel report;
7. implementa senza chiedere conferme per decisioni tecniche ordinarie.

Al termine di ogni prompt riporta:

- file creati o modificati;
- funzioni completate;
- test eseguiti e risultati;
- problemi ancora aperti;
- istruzioni per provare la fase.

## Allegati e input del progetto

Se esiste `inputs/ATTACHMENT_MANIFEST.md`:

1. leggilo prima di aprire gli allegati;
2. usa soltanto file elencati come validi;
3. apri solo gli allegati rilevanti per la fase corrente;
4. non assumere che un file sia più aggiornato soltanto dal timestamp del filesystem;
5. segnala conflitti, duplicati, file mancanti o illeggibili;
6. non inventare contenuti assenti;
7. non cercare, copiare o registrare segreti;
8. non copiare pixel per pixel interfacce o asset proprietari di terzi;
9. indica nel report di fase gli allegati effettivamente usati.
