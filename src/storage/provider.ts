import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { StorageError } from '../errors/index.js';

export interface DatabaseProvider {
  readonly dbPath: string;
  getConnection(): Database.Database;
  transaction<T>(handler: (db: Database.Database) => T): T;
  getUserVersion(): number;
  setUserVersion(version: number): void;
  close(): void;
  /** sqlite-vec 扩展是否已加载 */
  readonly vectorSearchEnabled: boolean;
}

class BetterSqliteDatabaseProvider implements DatabaseProvider {
  readonly dbPath: string;
  private readonly connection: Database.Database;
  private _vectorSearchEnabled = false;

  get vectorSearchEnabled(): boolean {
    return this._vectorSearchEnabled;
  }

  constructor(dbPath: string) {
    this.dbPath = dbPath;

    try {
      if (dbPath !== ':memory:') {
        mkdirSync(dirname(dbPath), { recursive: true });
      }

      this.connection = new Database(dbPath);
      this.connection.pragma('foreign_keys = ON');
    } catch (error) {
      throw new StorageError('无法创建或打开 SQLite 数据库', {
        step: 'open-database',
        source: dbPath,
        cause: error,
      });
    }

    this.tryLoadVecExtension();
  }

  private tryLoadVecExtension(): void {
    try {
      const require = createRequire(import.meta.url);
      const { load } = require('sqlite-vec');
      load(this.connection);
      this._vectorSearchEnabled = true;
    } catch {
      // sqlite-vec 不可用 — 向量搜索功能将被禁用，FTS5 搜索不受影响
      this._vectorSearchEnabled = false;
    }
  }

  getConnection(): Database.Database {
    return this.connection;
  }

  transaction<T>(handler: (db: Database.Database) => T): T {
    const wrapped = this.connection.transaction(() => handler(this.connection));
    return wrapped();
  }

  getUserVersion(): number {
    const row = this.connection.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined;
    return row?.user_version ?? 0;
  }

  setUserVersion(version: number): void {
    if (!Number.isInteger(version) || version < 0) {
      throw new StorageError('user_version 必须是非负整数', {
        step: 'set-user-version',
        source: this.dbPath,
      });
    }

    this.connection.exec(`PRAGMA user_version = ${version}`);
  }

  close(): void {
    this.connection.close();
  }
}

export function createDatabaseProvider(dbPath: string): DatabaseProvider {
  return new BetterSqliteDatabaseProvider(dbPath);
}
