# Prompt 07 — Hardening di sicurezza e privacy

## Obiettivo

Eseguire un hardening completo dell'app Electron, backend, pipeline AI, motori di ricerca e sincronizzazione.

## Documentazione

Crea o aggiorna:

- `docs/SECURITY.md`
- `docs/THREAT_MODEL.md`
- `docs/PRIVACY_ARCHITECTURE.md`
- `docs/INCIDENT_RESPONSE.md`

## Threat model minimo

Copri:

- pagine web malevole;
- XSS nella shell;
- abuso IPC;
- navigazione a protocolli pericolosi;
- prompt injection;
- furto token;
- leakage verso OpenRouter;
- screenshot sensibili;
- download malevoli;
- permessi browser;
- session fixation;
- CSRF;
- SSRF;
- SQL injection;
- IDOR e abuso multi-tenant;
- supply chain;
- aggiornamenti desktop compromessi;
- log sensibili;
- motori di ricerca personalizzati malevoli.

## Electron

Verifica e testa:

- CSP della shell;
- sandbox;
- context isolation;
- preload minimale;
- allowlist IPC;
- validazione Zod di input e output;
- `setWindowOpenHandler`;
- permission request handler;
- navigazione consentita solo a protocolli ammessi;
- gestione download;
- crash renderer;
- nessun bypass TLS.

## Permessi

Deny-by-default per:

- camera;
- microfono;
- posizione;
- notifiche;
- MIDI;
- clipboard avanzata;
- screen capture.

Salva decisioni per dominio e workspace e permetti revoca.

## Privacy modes

Implementa:

1. Cloud AI.
2. Conferma prima dell'invio.
3. Solo locale.

In modalità privata:

- sessione in memoria senza `persist:`;
- nessun salvataggio cronologia;
- nessuno screenshot;
- nessuna sincronizzazione;
- suggerimenti remoti disabilitati;
- AI disabilitata per default, salvo consenso esplicito temporaneo.

## Sanitizzazione

Prima di AI, sync o log rimuovi:

- password;
- cookie;
- bearer token;
- session ID;
- OAuth code/state;
- numeri carta e CVV;
- query string sensibili;
- campi contrassegnati sensibili;
- header;
- markup e script inutili.

## Download manager

- progresso;
- annulla;
- apri file/cartella;
- conferma per estensioni rischiose;
- nessuna esecuzione automatica;
- nomi duplicati sicuri;
- percorso configurabile.

## Logging

Mai registrare:

- contenuto completo pagine;
- prompt e risposte sensibili;
- password;
- cookie;
- token;
- URL completi contenenti query private.

Usa request ID, codici errore e identificativi pseudonimi.

## Test di sicurezza

Aggiungi test per:

- IPC non autorizzato;
- protocolli bloccati;
- template search engine malevoli;
- XSS;
- prompt injection;
- sanitizzazione credenziali;
- isolamento workspace;
- tenant isolation;
- CSRF/SSRF;
- revoca permessi;
- modalità privata.

## Criteri di accettazione

- Nessuna chiave OpenRouter nel bundle desktop.
- Le pagine remote non accedono a Node o IPC generico.
- I test malevoli falliscono in modo sicuro.
- La modalità privata non lascia record persistenti.
- Le policy AI vengono applicate server-side, non solo UI.
- Il threat model elenca rischi residui reali.
