import { existsSync, renameSync, rmSync } from "node:fs";
import { NodeSqliteDriver, type SqlDriver } from "./driver.js";
import { getSchemaVersion, runMigrations } from "./migrations.js";

export interface OpenResult {
  db: LocalDatabase;
  /** true se il file precedente era corrotto ed è stato messo da parte. */
  recoveredFromCorruption: boolean;
  appliedMigrations: number[];
}

/**
 * Database locale con migrazioni all'apertura, verifica di integrità,
 * recupero da file corrotto (rinomina in .corrupt-<ts> e ricrea) e backup
 * via VACUUM INTO. Vedi docs/DATABASE.md.
 */
export class LocalDatabase {
  private constructor(
    public readonly driver: SqlDriver,
    public readonly path: string,
  ) {}

  static open(path: string): OpenResult {
    let recovered = false;
    let driver: SqlDriver;
    try {
      driver = new NodeSqliteDriver(path);
      const check = driver.prepare("PRAGMA integrity_check").get();
      if (String(check?.["integrity_check"] ?? "") !== "ok") {
        throw new Error("integrity_check fallito");
      }
    } catch {
      // File corrotto o illeggibile: mai perdere dati silenziosamente.
      recovered = quarantineCorruptFile(path);
      driver = new NodeSqliteDriver(path);
    }
    const appliedMigrations = runMigrations(driver);
    return {
      db: new LocalDatabase(driver, path),
      recoveredFromCorruption: recovered,
      appliedMigrations,
    };
  }

  getSchemaVersion(): number {
    return getSchemaVersion(this.driver);
  }

  /** Backup consistente su file (VACUUM INTO). */
  backupTo(targetPath: string): void {
    if (existsSync(targetPath)) {
      rmSync(targetPath);
    }
    this.driver.exec(`VACUUM INTO '${targetPath.replaceAll("'", "''")}'`);
  }

  transaction<T>(fn: () => T): T {
    this.driver.exec("BEGIN");
    try {
      const result = fn();
      this.driver.exec("COMMIT");
      return result;
    } catch (error) {
      this.driver.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.driver.close();
  }
}

function quarantineCorruptFile(path: string): boolean {
  if (path === ":memory:" || !existsSync(path)) {
    return false;
  }
  const quarantined = `${path}.corrupt-${Date.now()}`;
  renameSync(path, quarantined);
  for (const suffix of ["-wal", "-shm"]) {
    if (existsSync(path + suffix)) {
      rmSync(path + suffix);
    }
  }
  return true;
}
