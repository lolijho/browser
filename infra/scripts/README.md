# infra/scripts

Script operativi (fase 08). Richiedono lo stack Compose in esecuzione.

| Script                | Scopo                                                      |
| --------------------- | ---------------------------------------------------------- |
| `migrate.sh`          | migrazioni idempotenti (advisory lock) via il servizio api |
| `backup-postgres.sh`  | dump compresso, retention, cifratura `age` opzionale       |
| `restore-postgres.sh` | ripristino con verifica (conteggio tabelle)                |

Configurabili via variabili d'ambiente (vedi intestazione di ciascuno script).
Dettagli operativi in `docs/COOLIFY_DEPLOY.md` (§7 migrazioni, §9 backup).
