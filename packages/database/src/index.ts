/**
 * Package database: conterrà lo schema SQLite locale, le migrazioni versionate
 * e l'accesso dati (fase 04) più lo schema PostgreSQL remoto (fase 06).
 *
 * In fase 00 espone solo le costanti stabili del database locale.
 */

/** Nome del file SQLite locale, relativo alla directory dati dell'app. */
export const LOCAL_DATABASE_FILENAME = "businessbox.db";

/**
 * Versione corrente dello schema locale.
 * 0 = nessuna migrazione applicata (schema introdotto nella fase 04).
 */
export const LOCAL_SCHEMA_VERSION = 0;
