# Problemi conosciuti — BusinessBox Browser (alpha)

Elenco trasparente dei limiti noti dell'alpha. Distingue vincoli d'ambiente,
scelte deliberate e lavoro futuro. Aggiornato: 2026-07-20.

## Vincoli d'ambiente (non difetti del codice)

1. **Binario Electron non scaricabile in questo ambiente**: l'egress verso
   `github.com/electron/electron/releases` è bloccato (403). Di conseguenza il
   **packaging desktop e i test E2E Electron girano in CI** (Linux + `xvfb`),
   non nella sandbox di sviluppo. La logica è comunque coperta da unit test e i
   test E2E si saltano con motivazione esplicita quando il binario manca.
2. **Code signing / notarization assenti**: nessun certificato _Developer ID_
   disponibile. L'alpha usa firma **ad-hoc** su macOS (serve `xattr -cr` o
   click-destro → Apri al primo avvio) ed è non firmata su Windows/Linux. Non è
   simulata alcuna firma reale. La pipeline è però già predisposta: con i
   certificati, `hardenedRuntime`, entitlements e notarization si attivano senza
   modifiche al codice (vedi `docs/DESKTOP_RELEASE.md`).
   Nota: un certificato _Apple Development_ non è sufficiente e viene
   deliberatamente **ignorato** dalla build — firmarci un pacchetto produrrebbe
   un'app che sembra firmata ma che Gatekeeper rifiuta sulle macchine altrui.
3. **Verifica live con servizi esterni**: chiamate reali a OpenRouter e a un
   Postgres/Redis vivi richiedono credenziali/infra. In CI è verificato l'avvio
   dello stack Docker con healthcheck; le chiamate AI reali sono coperte da test
   con provider mock/contract.

## Scelte deliberate (documentate)

4. **Datastore in-memory come fallback dev/alpha**: senza `DATABASE_URL` l'API
   usa repository in memoria (i dati non sopravvivono al riavvio) e lo dichiara
   nei log all'avvio. In produzione/Coolify `DATABASE_URL` è sempre impostata →
   PostgreSQL. Non è un mock nascosto sul percorso di produzione.
5. **Idempotenza worker in memoria**: il ledger di idempotenza dei job è per-
   processo. Gli handler di dominio dei job sono ancora placeholder osservabili
   (log): la logica reale (embeddings/AI async) e un ledger condiviso (Redis/DB)
   arrivano quando i job verranno collegati. Vedi ROADMAP.
6. **Auto-update inerte in alpha**: `electron-updater` è integrato e verifica
   sempre firma/integrità, ma senza feed firmato non applica aggiornamenti. Si
   attiva con build firmate + feed configurato, senza modifiche al codice.
7. **Auth rate limiting a livello proxy**: previsto sul reverse proxy Coolify,
   non applicato nel codice API.

## Lavoro parziale

8. **AI (fase 05) — nucleo completato**: provider OpenRouter GLM 5.2 con
   streaming, circuit breaker, budget, sanitizzazione e policy privacy sono
   pronti e testati; il collegamento worker asincrono (code BullMQ) e alcune UI
   di conferma sono da completare.
9. **UI permessi/modalità privata**: la logica (`PermissionManager`,
   `resolveAiPolicy`) è completa e testata; i dialoghi visuali e i toggle in
   barra sono da rifinire.

## Difetti aperti (verifica indipendente 2026-07-20)

10. **Permessi negati in silenzio (camera/microfono/posizione)**: `PermissionManager.check()`
    ritorna `null` per "mai deciso", ma il main fa `callback(check(...) === "granted")`
    (`apps/desktop/src/main/index.ts`), quindi `null` diventa un **diniego definitivo e
    silenzioso**. Non esistendo né UI di prompt né canale IPC per registrare la decisione
    (`permissionManager.set()` non è mai chiamato), camera, microfono e posizione sono
    **permanentemente inutilizzabili** e l'utente non riceve alcun feedback. Vedi M3.

11. **`aiPrivacyMode: "confirm"` non applicato**: `resolveAiPolicy()` è implementato e
    testato in `packages/ai/src/policy.ts` ma **non è chiamato da nessuna parte** del
    percorso di runtime. `AIPanel` invia il contenuto della pagina al backend
    controllando solo `allowAI`, senza la conferma prevista dal default documentato.

12. **Rotte AI senza autenticazione**: in `apps/api/src/server.ts` le rotte AI sono
    registrate senza `requireAuth` (a differenza di sync/auth), quindi
    `/api/v1/ai/chat` è un **proxy LLM aperto** a chiunque raggiunga l'API. Da chiudere
    prima di qualunque fatturazione a consumo (M8).

13. **Cronologia back/forward non ripristinata dopo la sospensione**: `restoreIfCold`
    esegue solo `loadURL`; la navigation history di Chromium viene persa alla
    distruzione della view. La tabella `page_navigation_history` viene scritta ma
    **mai riletta** da alcun punto del codice.

## Risolti (2026-07-20)

- **App macOS non avviabile** — firma ad-hoc incompleta (mancava
  `_CodeSignature/CodeResources`) + quarantena da download: macOS segnalava
  "danneggiata", blocco che nemmeno click-destro → Apri supera.
  Causa individuata alla radice: con `CSC_IDENTITY_AUTO_DISCOVERY=false`
  electron-builder produce un sigillo incompleto. Risolto con l'hook `afterSign`
  in `apps/desktop/electron-builder.cjs`, che ri-firma il bundle e **verifica**
  l'esito facendo fallire la build se il sigillo non è valido.
  Resta necessario `xattr -cr` finché non c'è la notarization (M1).
- **`window.businessbox` undefined** — i preload girano in sandbox e non possono
  `require()` chunk relativi, ma Rollup estraeva un chunk condiviso tra le due entry
  (`index` + `page`): il preload andava in eccezione prima di `exposeInMainWorld`.
  Risolto con il plugin `inlinePreloadChunks` in `apps/desktop/electron.vite.config.ts`.
- **Loop di render infinito (React #185)** — con zustand v5 un selettore che ritorna un
  nuovo riferimento a ogni chiamata manda `useSyncExternalStore` in loop.
  `useWorkspacePages` usava `.filter()`: risolto con `useShallow`.

## Note

- Nessun segreto è presente nel repository (`.env` non tracciato; `dev.env`
  contiene solo valori fittizi per lo sviluppo locale).
- Nessuna vulnerabilità nota nelle dipendenze di produzione (`pnpm audit --prod`
  pulito dopo l'override di `postcss >=8.5.10`).
- Licenze delle dipendenze principali: MIT (Apache-2.0 per `@mozilla/readability`),
  tutte permissive.
