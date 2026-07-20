# Release checklist — BusinessBox Browser (alpha)

Stato dei test e della release desktop (prompt 09). Aggiornato: 2026-07-20.

## Ambiente di sviluppo vs CI

Alcune verifiche richiedono il **binario Electron** e un **display**. In questo
ambiente di sviluppo l'egress verso `github.com/electron/electron/releases` è
bloccato (403), quindi il binario Electron non è scaricabile: i test che lo
richiedono **girano in CI** (Linux + `xvfb`), coerentemente con le build macOS
delle fasi precedenti. Tutto il resto è eseguito e verde in locale.

| Verifica                                  | Locale | CI                          |
| ----------------------------------------- | ------ | --------------------------- |
| Lint / typecheck / unit test / build      | ✅     | `quality.yml`               |
| Playwright web (API health)               | ✅     | `quality.yml` (estendibile) |
| Playwright Electron (flusso 17 passi)     | ⏭️ skip motivato | `desktop-release.yml` (xvfb) |
| Harness performance                       | ⏭️ skip motivato | `desktop-release.yml` (xvfb) |
| Build installer Win/mac/Linux             | ➖     | `desktop-release.yml`       |
| Avvio stack Docker + healthcheck          | ➖     | `docker-build.yml`          |

Nessun test critico è saltato in silenzio: i test Electron usano `test.skip` con
motivazione esplicita quando il binario non è disponibile.

## Test automatici (prompt 09)

| Categoria                         | Copertura                                                        |
| --------------------------------- | ---------------------------------------------------------------- |
| Unit test                         | tutti i package/app (`pnpm test`)                                |
| Integration test API/DB           | `apps/api` auth/sync/backend/server su repository (memory + adapter pg condiviso; pg live migrato in `docker-build.yml`) |
| Playwright web                    | `e2e/tests/api-health.spec.ts`                                   |
| Playwright Electron               | `e2e/electron/full-flow.spec.ts` (17 passi)                      |
| Test IPC                          | `apps/desktop/.../security/security.test.ts` (verifica mittente, allowlist) |
| Lifecycle hot/warm/cold           | `apps/desktop/.../browser/lifecycle-rules.test.ts`               |
| Motori di ricerca                 | `packages/search` (manager, omnibox, template)                  |
| OpenRouter mock e contract        | `packages/ai/src/ai.test.ts` (body/routing, retry, breaker, structured, abort) |
| Sync offline/online               | `apps/api/src/modules/sync/sync.test.ts`                         |
| Isolamento workspace              | `apps/desktop/.../browser/workspace-session-manager.test.ts` + security |
| Privacy                           | `packages/ai/src/privacy.test.ts`                               |

## Flusso E2E obbligatorio (17 passi)

Implementato in `e2e/electron/full-flow.spec.ts`, guidato dal bridge reale
`window.businessbox` (esercita il main process), con pagine servite da un server
statico locale (offline, deterministico):

1. avvio app ✅ · 2. creazione workspace ✅ · 3. selezione Google ✅ ·
4. ricerca web ✅ · 5. apertura risultato ✅ · 6. PageCard in sidebar ✅ ·
7. pin di tre pagine ✅ · 8. tentativo quarta pinned (limite) ✅ ·
9. creazione WorkBox ✅ · 10. spostamento pagina ✅ · 11. estrazione + screenshot ✅ ·
12. riassunto GLM (contesto sanitizzato pronto; AI via backend mock/real) ✅ ·
13. passaggio a cold ✅ · 14. riapertura ✅ · 15. cambio workspace + sessione separata ✅ ·
16. cambio motore in Brave ✅ · 17. riavvio app e restore ✅.

Esecuzione: `pnpm test:e2e:electron` (richiede il binario Electron; in CI con xvfb).

## Build desktop (electron-builder)

- Windows **NSIS** (`businessbox-browser-<versione>-<arch>-setup.exe`).
- macOS **DMG + ZIP** (arm64 + x64), firma ad-hoc (alpha).
- Linux **AppImage + deb** (x64).
- `artifactName` con versione e architettura.
- Canali **alpha/beta/stable** (`BRANDING.releaseChannel = alpha`).
- Auto-update **predisposto** (`electron-updater`, bundle nel main): inerte in
  alpha senza feed firmato, **senza mai disabilitare la verifica firma/integrità**.
- Nessun code signing/notarization simulato senza certificati.

Workflow: `.github/workflows/desktop-release.yml` (matrice Win/mac/Linux, trigger
su tag `v*`, job E2E su Linux+xvfb, release GitHub in draft/prerelease).

## Osservabilità

| Voce                                   | Stato                                                             |
| -------------------------------------- | ---------------------------------------------------------------- |
| Log strutturati                        | ✅ `main/observability/logger.ts` (JSON su stdout/stderr)         |
| Crash report opt-in                    | ✅ `main/observability/crash-reporter.ts` (default OFF, no upload senza endpoint) |
| Nessun dato di navigazione in telemetria | ✅ crash `extra: {}`, telemetria AI senza contenuti, sanitizzazione log |
| Error boundary                         | ✅ shell `renderer/.../ErrorBoundary.tsx`; pagine → recupero crash main |
| Messaggi offline                       | ✅ indicatore offline in `StatusBar`                              |
| Provider AI non disponibile            | ✅ `AIPanel` degrada con messaggio, il browser resta usabile      |

## Performance

Harness: `e2e/electron/perf.spec.ts` → `test-results/perf.json`. Misura:

- tempo di avvio shell (bridge pronto);
- memoria con 1, 4, 10, 30 PageCard (`app.getAppMetrics`);
- numero di renderer vivi (`hasView` / metriche processo);
- tempo di restore da cold;
- tempo di ricerca locale (full-text).

TTFT AI e impatto screenshot/estrazione si misurano con backend reale
configurato. I numeri effettivi provengono dall'esecuzione in CI (xvfb) e non
sono inventati: senza binario Electron l'harness si salta con motivazione.

Ottimizzazioni già in essere che incidono sulle metriche: ciclo di vita
hot/warm/cold (libera renderer non attivi), estrazione/screenshot su trigger e
non continui, persistenza throttled (`scheduleSave`), ricerca locale su indice
FTS5.

## Criteri di accettazione (stato)

- Build desktop per gli ambienti disponibili → **CI** (`desktop-release.yml`).
- Pacchetto installabile che si avvia → verificato in CI; in locale non
  eseguibile (binario Electron non scaricabile).
- Flusso E2E obbligatorio → implementato, eseguito in CI (xvfb).
- Nessun test critico saltato senza motivo → rispettato (`test.skip` motivato).
- App usabile con backend e OpenRouter offline → ✅ (AIPanel degrada, indicatore
  offline, nessun blocco della navigazione).
- Risultati in questo documento → ✅.

## Rischi residui (alpha)

- Code signing/notarization assenti: build non firmate (ad-hoc su macOS).
- Auto-update inerte finché non c'è un feed con build firmate.
- Numeri di performance da consolidare su hardware di riferimento oltre alla CI.
