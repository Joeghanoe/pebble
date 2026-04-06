/**
 * Drop-in replacement for `bun:sqlite`'s Database class, backed by
 * better-sqlite3-multiple-ciphers (SQLCipher).
 *
 * When bundled for Electron, esbuild aliases `bun:sqlite` to this file so
 * that src/db/runner.ts and all query files continue to work unchanged.
 *
 * The encryption key is read from DB_ENCRYPTION_KEY env var and applied
 * immediately after the database is opened.
 */

import BetterSqlite3 from "better-sqlite3-multiple-ciphers";

type AnyParams = unknown[];

interface StatementCompat<T, P extends AnyParams> {
  all(...params: P): T[];
  get(...params: P): T | null;
  run(...params: P): void;
}

export class Database {
  private _db: BetterSqlite3.Database;

  constructor(path: string, _options?: { create?: boolean; readonly?: boolean }) {
    this._db = new BetterSqlite3(path);

    const encKey = process.env["DB_ENCRYPTION_KEY"];
    if (encKey) {
      // SQLCipher-compatible key pragma — must be called right after open
      this._db.pragma(`key='${encKey}'`);
    }
  }

  /** Mirrors db.run(sql) and db.run(sql, paramsArray) from bun:sqlite */
  run(sql: string, params?: AnyParams): void {
    this._db.prepare(sql).run(...(params ?? []));
  }

  /**
   * Mirrors db.query<T, P>(sql) from bun:sqlite.
   * Returns an object with .all(), .get(), and .run() that accept positional params.
   */
  query<T = unknown, P extends AnyParams = AnyParams>(sql: string): StatementCompat<T, P> {
    const stmt = this._db.prepare(sql);
    return {
      all: (...params: P): T[] => stmt.all(...params) as T[],
      get: (...params: P): T | null => (stmt.get(...params) as T | undefined) ?? null,
      run: (...params: P): void => { stmt.run(...params); },
    };
  }

  /** Mirrors db.transaction(fn) from bun:sqlite */
  transaction<T>(fn: (...args: AnyParams) => T): (...args: AnyParams) => T {
    return this._db.transaction(fn) as (...args: AnyParams) => T;
  }

  close(): void {
    this._db.close();
  }
}
