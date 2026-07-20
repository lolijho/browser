/**
 * Package database: schema SQLite locale, migrazioni versionate, accesso dati
 * e ricerca full-text (fase 04). Lo schema PostgreSQL remoto arriva in fase 06.
 */

/** Nome del file SQLite locale, relativo alla directory dati dell'app. */
export const LOCAL_DATABASE_FILENAME = "businessbox.db";

export { NodeSqliteDriver, type SqlDriver, type SqlStatement, type SqlValue } from "./driver.js";
export {
  MIGRATIONS,
  CURRENT_SCHEMA_VERSION,
  getSchemaVersion,
  runMigrations,
  type Migration,
} from "./migrations.js";
export { LocalDatabase, type OpenResult } from "./local-database.js";
export {
  Repositories,
  normalizeUrlForHash,
  type SessionState,
  type SnapshotUpsertResult,
} from "./repositories.js";
