# Architettura della privacy — BusinessBox Browser

Il browser è **local-first**: i dati di navigazione vivono sul dispositivo
(SQLite) e lasciano la macchina solo con consenso esplicito.

## Tre modalità privacy AI (prompt 07)

Impostazione `aiPrivacyMode` (`@businessbox/contracts`), applicata da
`resolveAiPolicy` sia in UI sia server-side:

| Modalità              | Comportamento                                                    |
| --------------------- | ---------------------------------------------------------------- |
| **cloud-ai**          | l'AI cloud (GLM 5.2 via OpenRouter) può essere usata liberamente |
| **confirm** (default) | ogni invio all'AI richiede conferma esplicita                    |
| **local-only**        | nessun invio all'AI cloud: solo ricerca e funzioni locali        |

Precedenza di `resolveAiPolicy`: `allowAI=false` sulla pagina → blocco;
`local-only` → blocco; modalità privata → blocco salvo consenso temporaneo;
`confirm` → conferma; `cloud-ai` → consentito.

## Modalità privata

Una finestra/workspace privato:

- usa una **sessione in memoria** (partizione senza prefisso `persist:`):
  cookie e storage svaniscono alla chiusura;
- **nessuna cronologia** salvata;
- **nessuno screenshot**;
- **nessuna sincronizzazione**;
- **suggerimenti remoti disabilitati**;
- **AI disabilitata per default**, salvo consenso esplicito temporaneo.

## Cosa non lascia mai il dispositivo senza consenso

- Contenuto completo delle pagine (solo estratto sanitizzato all'AI, se
  consentito).
- Cookie, token, `localStorage` dei siti: **mai** sincronizzati.
- Screenshot: locali, mai sincronizzati automaticamente.
- Password, carte, CVV, campi sensibili: mai letti in estrazione, mai inviati.

## Flag per PageCard

`allowSync`, `allowAI`, `allowScreenshot`, retention policy, `sensitivity`:
applicati **prima** dell'accodamento sync/AI. Ciò che non è consentito non entra
mai nella coda.

## Sanitizzazione

Prima di AI, sync e log vengono redatti: password, cookie, bearer token, session
ID, OAuth code/state, numeri di carta/CVV, query string sensibili, campi marcati
sensibili, header. Vedi `sanitizeContentForAI`, `sanitizeUrlForLog`,
`sanitizeForLog`.

## Suggerimenti di ricerca

Disabilitati fino al consenso (`remoteSuggestionsConsent`); sempre disabilitati
in modalità privata. In assenza di consenso, i suggerimenti sono solo locali
(pagine aperte del workspace).

## Consenso e revoca

- Permessi browser: decisi per dominio+workspace, revocabili in qualsiasi
  momento (`PermissionManager`).
- Sincronizzazione e AI: governate dai flag e dalla modalità privacy.
- Screenshot: revocabili per pagina; eliminazione esplicita del file salvato.

## Dati lato server (con account)

Con un account, i dati abilitati alla sync risiedono in PostgreSQL, isolati per
organizzazione. Gli **amministratori non vedono il contenuto privato delle
pagine**: le rotte admin espongono solo metadati (conteggi, email, audit),
mai il testo estratto o gli snapshot.
