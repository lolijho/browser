import { DatabaseSync } from "node:sqlite";

/**
 * Driver SQLite astratto e sincrono.
 *
 * Valutazione richiesta dal prompt 04: `better-sqlite3` è stato valutato ma
 * richiede ricompilazione nativa per l'ABI di Electron (electron-rebuild,
 * toolchain, download di header). `node:sqlite` (integrato in Node ≥22.5 e
 * nell'Electron corrente) offre la stessa API sincrona, include FTS5 e
 * azzera la superficie di build nativa. better-sqlite3 resta un'opzione
 * drop-in implementando questa interfaccia.
 */
export interface SqlStatement {
  run(...params: SqlValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...params: SqlValue[]): Record<string, SqlValue> | undefined;
  all(...params: SqlValue[]): Record<string, SqlValue>[];
}

export type SqlValue = string | number | bigint | null | Uint8Array;

export interface SqlDriver {
  exec(sql: string): void;
  prepare(sql: string): SqlStatement;
  close(): void;
}

/** Implementazione su node:sqlite (DatabaseSync). */
export class NodeSqliteDriver implements SqlDriver {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare(sql: string): SqlStatement {
    const stmt = this.db.prepare(sql);
    return {
      run: (...params: SqlValue[]) => stmt.run(...params),
      get: (...params: SqlValue[]) => stmt.get(...params) as Record<string, SqlValue> | undefined,
      all: (...params: SqlValue[]) => stmt.all(...params) as Record<string, SqlValue>[],
    };
  }

  close(): void {
    this.db.close();
  }
}
