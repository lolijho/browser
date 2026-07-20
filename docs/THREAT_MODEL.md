# Threat model — BusinessBox Browser

Modello di minaccia dell'alpha. Per ogni categoria: rischio, mitigazione
attuale, stato. Le mitigazioni sono verificate dai test dove indicato.

| #   | Minaccia                                | Mitigazione                                                                                                              | Stato                       |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| 1   | **Pagine web malevole**                 | sandbox + contextIsolation + nessuna API Node nelle pagine; preload pagina non espone nulla                              | ✅                          |
| 2   | **XSS nella shell**                     | CSP `script-src 'self'`, React senza `dangerouslySetInnerHTML`, nessun input remoto nel DOM della shell                  | ✅                          |
| 3   | **Abuso IPC**                           | allowlist canali, validazione Zod, verifica `event.sender === shell`                                                     | ✅ (test)                   |
| 4   | **Navigazione a protocolli pericolosi** | `will-navigate` e omnibox: solo http/https; `javascript:`/`data:`/`file:` trattati come ricerca                          | ✅ (test)                   |
| 5   | **Prompt injection**                    | fonti delimitate come "dati non affidabili", system prompt esplicito, `sanitizeContentForAI`                             | ✅ (test pagina malevola)   |
| 6   | **Furto token**                         | access token solo in memoria, refresh cifrato `safeStorage`, mai in localStorage; refresh rotation con rilevamento riuso | ✅ (test)                   |
| 7   | **Leakage verso OpenRouter**            | `data_collection=deny`, ZDR, sanitizzazione fonti, `allowAI`/privacy mode, chiave solo server-side                       | ✅                          |
| 8   | **Screenshot sensibili**                | `allowScreenshot` per pagina + flag globale, disabilitati in modalità privata, eliminazione esplicita                    | ✅                          |
| 9   | **Download malevoli**                   | estensioni rischiose segnalate, nomi sanitizzati, nessuna esecuzione automatica                                          | ✅ (test)                   |
| 10  | **Permessi browser**                    | deny-by-default per dominio+workspace, revocabili                                                                        | ✅ (test)                   |
| 11  | **Session fixation**                    | sessione nuova a ogni login, device id nei claims, revoca dispositivo                                                    | ✅                          |
| 12  | **CSRF**                                | API stateless con bearer token (no cookie di sessione ambient); CORS ristretto                                           | ✅                          |
| 13  | **SSRF**                                | fetch server-side solo verso OpenRouter (host fisso); descriptor OpenSearch solo https, dimensione limitata              | ✅                          |
| 14  | **SQL injection**                       | query PostgreSQL sempre parametrizzate                                                                                   | ✅                          |
| 15  | **IDOR / abuso multi-tenant**           | guard verifica appartenenza server-side; org dai claims firmati                                                          | ✅ (test isolamento tenant) |
| 16  | **Supply chain**                        | lockfile frozen, dipendenze minime, `onlyBuiltDependencies` allowlist per gli script post-install                        | ✅ parziale                 |
| 17  | **Aggiornamenti desktop compromessi**   | canali alpha/beta/stable, verifica firma predisposta                                                                     | ⚠️ firma reale in fase 09   |
| 18  | **Log sensibili**                       | `sanitizeForLog`/`sanitizeUrlForLog`, telemetria AI senza contenuti                                                      | ✅                          |
| 19  | **Motori di ricerca custom malevoli**   | validazione template (https, `%s`, blocco schemi, no credenziali)                                                        | ✅ (test)                   |

## Confini di fiducia

- **Pagine remote**: non fidate. Nessun accesso a Node/IPC generico. Preload
  pagina osserva solo dirty-state/scroll/OpenSearch, senza leggere valori.
- **Renderer della shell**: semi-fidato. Può invocare solo i canali IPC
  dell'allowlist, validati. Non contiene segreti.
- **Main process**: fidato. Possiede i WebContentsView, applica i permessi,
  sanitizza il contesto AI prima dell'invio.
- **Backend**: fidato per identità/autorizzazione; unica sede della chiave
  OpenRouter e dei segreti JWT.

## Rischi residui reali (alpha)

1. **Code signing / notarization desktop assenti**: l'alpha usa firma ad-hoc;
   macOS richiede `xattr -cr` al primo avvio. Firma con certificato reale in
   fase 09.
2. **Auto-update non firmato**: la verifica firma degli update è predisposta ma
   non attiva senza certificati.
3. **Verifica live non completata in CI**: chiamate reali a OpenRouter e a un
   Postgres vivo avvengono con credenziali/infra (fase 08); qui la logica è
   coperta da test con mock/in-memory.
4. **Rate limiting auth**: predisposto a livello di reverse proxy (Coolify);
   non ancora applicato nel codice API.
5. **Supply chain**: audit periodico delle dipendenze e SBOM da formalizzare.
