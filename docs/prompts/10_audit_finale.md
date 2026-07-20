# Prompt 10 — Audit finale e consegna alpha

## Obiettivo

Eseguire un audit completo del repository, correggere difetti reali e preparare una consegna alpha trasparente.

## Audit

Controlla sistematicamente:

- requisiti in `CLAUDE.md`;
- architettura;
- dipendenze obsolete o vulnerabili;
- sicurezza Electron;
- sessioni workspace;
- limite tre pinned;
- lifecycle hot/warm/cold;
- dirty state;
- motori Google, Brave e custom;
- OpenSearch;
- ricerca locale;
- persistenza e restore;
- GLM 5.2 via OpenRouter;
- privacy ZDR e data collection;
- auth e multi-tenancy;
- sync offline;
- Compose Coolify;
- release desktop;
- test e documentazione.

## Regola

Non limitarti a elencare problemi: correggi quelli correggibili. Non mascherare quelli che richiedono credenziali, certificati o servizi esterni.

## Pulizia

- rimuovi codice morto;
- rimuovi mock dal percorso production;
- elimina secret o dati dimostrativi impropri;
- uniforma error handling;
- verifica migrazioni da database vuoto;
- verifica aggiornamento da una versione schema precedente;
- controlla licenze dipendenze principali.

## Documenti finali

Aggiorna o crea:

- `README.md`
- `IMPLEMENTATION_STATUS.md`
- `docs/ARCHITECTURE.md`
- `docs/SECURITY.md`
- `docs/COOLIFY_DEPLOY.md`
- `docs/DESKTOP_RELEASE.md`
- `docs/RELEASE_CHECKLIST.md`
- `docs/KNOWN_ISSUES.md`
- `docs/ROADMAP.md`

## Report finale

Fornisci:

1. riepilogo architettura;
2. struttura repository;
3. funzionalità complete;
4. funzionalità parziali;
5. funzionalità non implementate;
6. rischi residui;
7. comandi sviluppo/test/build;
8. procedura Coolify;
9. procedura release desktop;
10. variabili ambiente;
11. credenziali esterne necessarie;
12. risultati test con numeri reali;
13. problemi conosciuti;
14. prossime cinque milestone.

## Criteri di accettazione

- Lint, typecheck e test critici passano.
- Build API, worker, admin e desktop passa negli ambienti disponibili.
- Non ci sono secret nel repository.
- Il browser funziona senza AI e senza backend.
- Google e Brave Search sono selezionabili.
- Il limite di tre pinned è rispettato.
- Tutte le pagine restano recuperabili nella sidebar.
- Coolify può distribuire lo stack server.
- Il report distingue chiaramente realtà, mock e lavoro futuro.
