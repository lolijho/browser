# Sicurezza — BusinessBox Browser

Riepilogo delle misure di sicurezza implementate e verificate. Documenti
collegati: `THREAT_MODEL.md`, `PRIVACY_ARCHITECTURE.md`, `INCIDENT_RESPONSE.md`.

## Electron (shell desktop)

| Controllo                                  | Stato | Dove                                                                      |
| ------------------------------------------ | ----- | ------------------------------------------------------------------------- |
| `sandbox: true` globale                    | ✅    | `app.enableSandbox()` in `main/index.ts`                                  |
| `contextIsolation: true`                   | ✅    | tutte le `webPreferences`                                                 |
| `nodeIntegration: false`                   | ✅    | shell e pagine remote                                                     |
| Nessun `<webview>` / `BrowserView`         | ✅    | solo `WebContentsView`                                                    |
| Preload separato shell / pagine            | ✅    | `preload/index.ts` (shell), `preload/page.ts` (pagine, non espone nulla)  |
| IPC con allowlist + Zod                    | ✅    | `@businessbox/contracts` (canali), `main/ipc.ts` (validazione)            |
| Verifica mittente IPC                      | ✅    | i canali della shell accettano solo `event.sender === shell`              |
| Nessun `invoke(channel, payload)` generico | ✅    | il preload espone solo metodi nominati                                    |
| `setWindowOpenHandler`                     | ✅    | shell nega tutto; pagine → nuove PageCard (solo https)                    |
| Navigazione solo http/https                | ✅    | `will-navigate` blocca gli altri protocolli                               |
| `will-attach-webview` bloccato             | ✅    | `browser-controller.ts`                                                   |
| Permessi deny-by-default                   | ✅    | `PermissionManager` per dominio+workspace                                 |
| Nessun bypass TLS                          | ✅    | nessun `certificate-error` ignorato, nessun `--ignore-certificate-errors` |
| CSP della shell                            | ✅    | `renderer/index.html` (`script-src 'self'`)                               |
| Crash renderer gestito                     | ✅    | `render-process-gone` → pagina di ripristino                              |

## Permessi browser (fase 07)

Deny-by-default per camera, microfono, geolocalizzazione, notifiche, MIDI,
clipboard avanzata e screen capture. Le decisioni sono salvate per
**(dominio, workspace)** e revocabili (`PermissionManager`). Un permesso è
concesso solo se esplicitamente approvato; ogni origine non http/https è negata.

## Download

`sanitizeFilename` (niente path traversal / caratteri di controllo),
`uniqueFilename` (nomi duplicati sicuri), `isRiskyDownload` (estensioni
eseguibili). Nessuna esecuzione automatica; le estensioni rischiose richiedono
conferma esplicita nella UI.

## Backend / API

- Autenticazione Argon2id, access token JWT breve, **refresh rotation** con
  rilevamento del riuso (furto → revoca catena).
- Multi-tenancy: il guard verifica **server-side l'appartenenza**;
  l'organizzazione proviene dai claims firmati, mai dal body (difesa IDOR).
- Query PostgreSQL **parametrizzate** (niente SQL injection).
- CORS ristretto in produzione (`CORS_ALLOWED_ORIGINS`).
- Chiave OpenRouter **solo server-side**; policy AI applicate nel backend, non
  solo in UI.

## Sanitizzazione (prima di AI, sync, log)

`sanitizeContentForAI` (bearer/JWT/API key/cookie/carte/password nelle query),
`sanitizeUrlForLog` (redazione parametri sensibili + fragment),
`sanitizeForLog` (righe di log). Le fonti web sono sempre delimitate e marcate
come "dati non affidabili" (anti prompt-injection).

## Motori di ricerca custom

Validazione severa dei template: HTTPS obbligatorio, `%s` richiesto, blocco di
`javascript:`/`data:`/`file:`, rifiuto di credenziali nel template, keyword
univoca per scope, query sempre `encodeURIComponent`.

## Segreti

Nessuna chiave OpenRouter nel bundle desktop o nei log. `.env` mai committato.
Token desktop: access token solo in memoria, refresh token cifrato via
`safeStorage` (mai in chiaro, mai in `localStorage`).

## Test di sicurezza (automatici)

IPC non autorizzato (verifica mittente), protocolli bloccati, template motori
malevoli, prompt injection (pagina malevola), sanitizzazione credenziali,
isolamento workspace, **isolamento tenant** (HTTP), revoca permessi, modalità
privacy, download rischiosi. Vedi le suite in `packages/*/src/*.test.ts` e
`apps/*/src/**/*.test.ts`.

## Rischi residui

Elencati in `THREAT_MODEL.md` (sezione "Rischi residui"): code signing/
notarization desktop assenti in alpha, auto-update non ancora firmato,
verifica live OpenRouter/Postgres da completare in ambiente con credenziali.
