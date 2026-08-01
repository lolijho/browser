# Roadmap — BusinessBox Browser

Direzione dopo l'alpha. Le priorità restano coerenti con `CLAUDE.md`: browser
desktop AI-first, barra pulita, sicurezza Electron, privacy.

## Prossime 5 milestone

### M1 — Firma e distribuzione reali

Pipeline già predisposta (`apps/desktop/electron-builder.cjs`, entitlements in
`apps/desktop/build/`, workflow `desktop-mac-build.yml`): si attiva da sola quando i
certificati esistono. Resta da fare solo la parte non automatizzabile — vedi
`docs/DESKTOP_RELEASE.md`.

- [ ] Iscrizione all'Apple Developer Program (99 USD/anno): senza, esiste solo il
      certificato _Apple Development_, valido per il test locale ma **non** per la
      distribuzione.
- [ ] Creare il certificato **Developer ID Application** ed esportarlo in `.p12`.
- [ ] Caricare i GitHub Secrets (`MAC_CERTIFICATE_P12`, `MAC_CERTIFICATE_PASSWORD`,
      `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_SPECIFIC_PASSWORD`).
- [x] Hardened runtime + entitlements + notarization condizionali alla presenza dei
      certificati, con avviso esplicito quando la firma non è reale.
- [x] Firma ad-hoc riparata e verificata in build (l'alpha non è più "danneggiata").
- Certificato Authenticode Windows.
- Feed di update firmato (canali alpha/beta/stable già predisposti).
- Attivazione effettiva di `electron-updater` con verifica firma end-to-end.

### M2 — Worker asincrono collegato

- Handler reali per le code BullMQ (embeddings, riassunti asincroni, email).
- Ledger di idempotenza condiviso (Redis/DB) al posto di quello in memoria.
- Backpressure e retry con dead-letter documentati.
- Metriche code nella dashboard admin (già presente la pagina).

### M3 — Rifinitura UX permessi e privacy

- Dialoghi di richiesta permessi (camera/mic/geo/notifiche) collegati alla UI.
- Toggle modalità privata in barra + indicatori per pagina.
- Gestione visuale degli screenshot (anteprima, eliminazione, allowScreenshot).
- Onboarding motori di ricerca e OpenSearch.

### M4 — Sync e multi-dispositivo

- Sync in background continuo (oltre al pull incrementale) con risoluzione
  conflitti assistita nella UI (note/spostamenti).
- Cifratura end-to-end opzionale dei contenuti sincronizzati.
- Gestione dispositivi e revoca dalla dashboard.

### M5 — Osservabilità e performance di produzione

- Telemetria opt-in aggregata (senza dati di navigazione) e crash report reali.
- Budget di memoria adattivo per il ciclo hot/warm/cold su macchine con poca RAM.
- Consolidamento delle metriche di performance su hardware di riferimento.
- Rate limiting auth applicativo oltre al proxy.

### M6 — Superficie AI oltre la pagina singola (prerequisito)

Collo di bottiglia strutturale: l'unico canale IPC AI è `ai:get-page-context`,
read-only e **mono-pagina**. Finché resta così, confronto tra pagine, analisi di una
WorkBox e domande sulla memoria sono irrealizzabili lato desktop, anche se il backend
accetterebbe fino a 8 fonti (`aiSourceSchema.max(8)`).

- Nuovi canali IPC in allowlist: contesto multi-pagina, contesto WorkBox, query memoria.
- Collegare i chiamanti mancanti: `provider.classify()` e `generateStructured()` oggi
  non hanno alcun invocante fuori dai test.
- Rendere persistenti le conversazioni AI (oggi vivono solo in `useState`).
- Popolare davvero le colonne già previste: `summary`, `tags`, `entities`, `notes`
  (nessuna `INSERT` esiste oggi) e i campi FTS corrispondenti.

### M7 — Ricerca overview

Vedi `docs/PRODUCT_REQUIREMENTS.md` → _Ricerca overview_. Vincolo: nessuno scraping SERP.

- Overview da **memoria locale** (funziona offline e in privacy mode "solo locale").
- Overview da **API di ricerca licenziata** (Brave Search API) con chiave solo backend.
- Citazioni obbligatorie e dichiarazione di incertezza quando le fonti non bastano.
- Contabilizzazione a consumo agganciata alle quote di piano (M8).
- Prerequisiti: M6 (contesto multi-fonte) e, per il retrieval semantico, gli embedding
  della M2 — oggi la colonna `embedding vector(1536)` esiste ma non è mai popolata.

### M8 — Sito abbonamenti e monetizzazione

Vedi `docs/PRODUCT_REQUIREMENTS.md` → _Abbonamenti e monetizzazione_.

- Nuova app web pubblica (Next.js) con prezzi, checkout e area cliente.
- Integrazione provider di pagamento esterno + webhook per il ciclo di vita.
- Entitlement per organizzazione esposto al desktop; degrado con grazia a quota esaurita.
- Estensione di `packages/ai/src/budget.ts` da limite tecnico a quota commerciale.
- Prerequisito di sicurezza: le rotte AI sono oggi registrate **senza `requireAuth`**
  (`apps/api/src/server.ts`) — vanno protette prima di qualunque fatturazione a consumo.

## Oltre le milestone

- Estensioni/automazioni per flussi imprenditoriali (WorkBox come playbook).
- Motori di ricerca aziendali e connettori documentali interni.
- Pacchettizzazione Linux aggiuntiva (Flatpak/Snap) se richiesta.
- Localizzazione oltre l'italiano.
