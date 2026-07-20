# Problemi conosciuti — BusinessBox Browser (alpha)

Elenco trasparente dei limiti noti dell'alpha. Distingue vincoli d'ambiente,
scelte deliberate e lavoro futuro. Aggiornato: 2026-07-20.

## Vincoli d'ambiente (non difetti del codice)

1. **Binario Electron non scaricabile in questo ambiente**: l'egress verso
   `github.com/electron/electron/releases` è bloccato (403). Di conseguenza il
   **packaging desktop e i test E2E Electron girano in CI** (Linux + `xvfb`),
   non nella sandbox di sviluppo. La logica è comunque coperta da unit test e i
   test E2E si saltano con motivazione esplicita quando il binario manca.
2. **Code signing / notarization assenti**: nessun certificato disponibile.
   L'alpha usa firma **ad-hoc** su macOS (serve `xattr -cr` al primo avvio) ed è
   non firmata su Windows/Linux. Non è simulata alcuna firma reale.
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

## Note

- Nessun segreto è presente nel repository (`.env` non tracciato; `dev.env`
  contiene solo valori fittizi per lo sviluppo locale).
- Nessuna vulnerabilità nota nelle dipendenze di produzione (`pnpm audit --prod`
  pulito dopo l'override di `postcss >=8.5.10`).
- Licenze delle dipendenze principali: MIT (Apache-2.0 per `@mozilla/readability`),
  tutte permissive.
