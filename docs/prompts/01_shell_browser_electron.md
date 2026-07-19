# Prompt 01 — Shell del browser Electron

Leggi `CLAUDE.md`, `docs/ARCHITECTURE.md` e `IMPLEMENTATION_STATUS.md`. Preserva il codice esistente.

## Obiettivo

Trasformare l'app desktop in una vera shell browser sicura, capace di aprire e controllare pagine remote tramite `WebContentsView`.

## Layout

Crea:

- barra superiore;
- sidebar sinistra richiudibile;
- area centrale riservata al `WebContentsView` attivo;
- pannello AI destro richiudibile, inizialmente placeholder funzionale;
- barra di stato minimale.

## Barra superiore

Deve includere:

- indietro;
- avanti;
- ricarica/stop;
- omnibox;
- titolo della pagina attiva;
- area delle tre schede bloccate;
- pulsante sidebar;
- pulsante pannello AI;
- menu impostazioni.

## Browser controller

Implementa nel main process un servizio tipizzato che gestisca:

- creazione e distruzione `WebContentsView`;
- caricamento URL;
- back, forward, reload, stop;
- aggiornamento bounds al resize della finestra e all'apertura dei pannelli;
- eventi titolo, URL, favicon, loading e crash;
- intercettazione di `window.open` tramite `setWindowOpenHandler`;
- errori di navigazione;
- apertura link esterni autorizzati;
- pagina interna di errore.

## Sicurezza

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- nessun `<webview>`
- nessun `BrowserView`
- preload della shell separato dal contenuto remoto
- IPC con canali nominati, tipi condivisi e validazione Zod
- non esporre metodi generici come `invoke(channel, payload)`
- permission handler deny-by-default
- non ignorare errori TLS

## Navigazione iniziale

- Nuova scheda interna `businessbox://newtab` oppure route interna equivalente sicura.
- L'omnibox deve distinguere almeno URL e testo di ricerca.
- In questa fase usa Google come fallback temporaneo, ma lascia il routing dietro `SearchEngineManager` perché sarà sostituito nel prompt dedicato.

## Sessioni workspace

Crea un servizio `WorkspaceSessionManager` che utilizzi:

```text
persist:workspace-<uuid>
```

Ogni pagina deve essere creata con la sessione del workspace attivo. Aggiungi un test che dimostri che due workspace producono partizioni diverse.

## Scorciatoie

Implementa:

- Ctrl/Cmd+L omnibox
- Ctrl/Cmd+T nuova pagina
- Ctrl/Cmd+R reload
- Ctrl/Cmd+B sidebar
- Ctrl/Cmd+Shift+A pannello AI
- Alt+Left e Alt+Right

## Criteri di accettazione

- È possibile aprire siti HTTPS reali.
- Back, forward, reload e stop funzionano.
- I bounds della pagina seguono layout e resize.
- Popup normali diventano nuove PageCard, non nuove finestre arbitrarie.
- Due workspace usano sessioni persistenti distinte.
- Un renderer crashato viene segnalato e può essere ripristinato.
- Nessuna API Node è disponibile alle pagine remote.
- Lint, typecheck e test passano.
