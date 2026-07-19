# Incident response — BusinessBox Browser

Procedura di risposta agli incidenti di sicurezza per l'alpha. Da estendere con
runbook operativi quando il servizio sarà in produzione.

## Contatti e ruoli

- **Owner sicurezza**: da assegnare prima del rilascio pubblico.
- **On-call backend / desktop**: da assegnare.
- Canale di segnalazione responsabile: da pubblicare (es. `security@…`).

## Classificazione severità

| Livello  | Esempi                                                                          |
| -------- | ------------------------------------------------------------------------------- |
| **SEV1** | Furto di segreti server (JWT, OpenRouter), accesso cross-tenant confermato, RCE |
| **SEV2** | Bypass auth, leak di dati utente limitato, aggiornamento desktop compromesso    |
| **SEV3** | Vulnerabilità sfruttabile senza impatto dati immediato                          |
| **SEV4** | Hardening mancante, rischio teorico                                             |

## Playbook per tipo di incidente

### Compromissione di un token / sessione

1. Revocare i refresh token dell'utente (`revokeAllForUser`) e i dispositivi
   coinvolti (`revokeDevice`).
2. Il rilevamento del riuso del refresh token revoca automaticamente la catena.
3. Forzare il reset password se necessario (invalida tutti i refresh).

### Sospetta esposizione della chiave OpenRouter

1. Ruotare `OPENROUTER_API_KEY` sul provider e in Coolify (secret).
2. Riavviare `api`/`worker`. La chiave non è mai nel bundle desktop né nei log.
3. Verificare l'assenza della chiave nei log (`sanitizeForLog`) e negli artifact.

### Segreti JWT compromessi

1. Ruotare `JWT_ACCESS_SECRET`: invalida tutti gli access token (durata breve).
2. Considerare la revoca dei refresh token attivi.

### Accesso cross-tenant sospetto (IDOR)

1. Verificare i log del guard (`isMember` server-side).
2. Congelare l'organizzazione coinvolta se necessario; raccogliere l'audit log.

### Aggiornamento desktop compromesso

1. Sospendere il canale di update interessato.
2. Pubblicare una nota nei `KNOWN_ISSUES`; invitare al download dal canale
   ufficiale verificato.
3. (Fase 09) verificare la firma degli update prima della ridistribuzione.

## Contenimento generale

1. Identificare e isolare il servizio/host coinvolto (Coolify: fermare la
   replica).
2. Preservare i log (con dati sanitizzati) per l'analisi.
3. Applicare la mitigazione minima efficace, poi la correzione.

## Post-mortem

- Cronologia dell'evento, causa radice, impatto, dati coinvolti.
- Azioni correttive con owner e scadenze.
- Aggiornamento di `THREAT_MODEL.md` se emerge un rischio non previsto.

## Note per l'alpha

L'alpha non è destinata a dati di produzione sensibili. Prima di un rilascio
pubblico vanno completati: code signing/notarization, rate limiting auth,
verifica firma update, audit dipendenze, e l'assegnazione dei ruoli on-call.
