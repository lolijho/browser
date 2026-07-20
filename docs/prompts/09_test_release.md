# Prompt 09 — Test end-to-end, build desktop e release

## Obiettivo

Portare il progetto a una release alpha realmente installabile e testata.

## Test automatici

Completa:

- unit test;
- integration test API/database;
- Playwright web;
- Playwright Electron;
- test IPC;
- test lifecycle hot/warm/cold;
- test motori di ricerca;
- test OpenRouter mock e contract;
- test sync offline/online;
- test isolamento workspace;
- test privacy.

## Flusso E2E obbligatorio

1. avvio app;
2. creazione workspace;
3. selezione Google;
4. ricerca web;
5. apertura risultato;
6. PageCard in sidebar;
7. pin di tre pagine;
8. tentativo quarta pinned;
9. creazione WorkBox;
10. spostamento pagina;
11. estrazione e screenshot;
12. riassunto GLM tramite backend mock/real configurabile;
13. passaggio a cold;
14. riapertura;
15. cambio workspace e verifica sessione separata;
16. cambio motore in Brave Search;
17. riavvio app e restore.

## Electron builder

Configura:

- Windows NSIS;
- macOS DMG e ZIP;
- Linux AppImage e deb;
- artifact naming con versione e architettura;
- canali alpha/beta/stable;
- aggiornamento automatico predisposto;
- verifica firma aggiornamenti.

Non fingere code signing o notarization senza certificati.

## GitHub Actions

Crea:

- `quality.yml`
- `desktop-release.yml`
- `docker-build.yml`

La release desktop deve usare matrice Windows/macOS/Linux e trigger su tag `v*`.

## Osservabilità

Verifica:

- log strutturati;
- crash report opt-in;
- nessun dato di navigazione nella telemetria;
- error boundaries;
- messaggi offline e provider AI non disponibile.

## Performance

Misura e documenta:

- tempo avvio shell;
- memoria con 1, 4, 10 e 30 PageCard;
- numero renderer vivi;
- tempo restore cold;
- tempo ricerca locale;
- TTFT AI;
- impatto screenshot ed estrazione.

Ottimizza senza alterare i requisiti funzionali.

## Criteri di accettazione

- Build desktop passa per gli ambienti disponibili.
- Il pacchetto installabile si avvia.
- Il flusso E2E obbligatorio passa.
- Nessun test critico è saltato senza motivazione.
- L'app resta usabile con backend e OpenRouter offline.
- I risultati dei test sono riportati in `docs/RELEASE_CHECKLIST.md`.
