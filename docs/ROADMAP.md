# Roadmap — BusinessBox Browser

Direzione dopo l'alpha. Le priorità restano coerenti con `CLAUDE.md`: browser
desktop AI-first, barra pulita, sicurezza Electron, privacy.

## Prossime 5 milestone

### M1 — Firma e distribuzione reali

- Certificati Apple (Developer ID) + notarization macOS.
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

## Oltre le milestone

- Estensioni/automazioni per flussi imprenditoriali (WorkBox come playbook).
- Motori di ricerca aziendali e connettori documentali interni.
- Pacchettizzazione Linux aggiuntiva (Flatpak/Snap) se richiesta.
- Localizzazione oltre l'italiano.
