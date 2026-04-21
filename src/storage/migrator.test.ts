import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { StorageError } from '../errors/index.js';
import { createDatabaseProvider } from './provider.js';
import { discoverMigrations, runMigrations } from './migrator.js';
import { initializeStorage } from './index.js';

const cleanupPaths: string[] = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    const target = cleanupPaths.pop();
    if (target) {
      rmSync(target, { recursive: true, force: true });
    }
  }
});

describe('migrator', () => {
  it('按迁移编号顺序发现 SQL 文件', () => {
    const migrationsDir = mkdtempSync(join(tmpdir(), 'knowledge-migrations-'));
    cleanupPaths.push(migrationsDir);

    writeFileSync(join(migrationsDir, '002-second.sql'), 'CREATE TABLE second_table (id INTEGER PRIMARY KEY);');
    writeFileSync(join(migrationsDir, '001-first.sql'), 'CREATE TABLE first_table (id INTEGER PRIMARY KEY);');

    const migrations = discoverMigrations(migrationsDir);

    expect(migrations.map((migration) => migration.version)).toEqual([1, 2]);
    expect(migrations.map((migration) => migration.name)).toEqual(['001-first.sql', '002-second.sql']);
  });

  it('发现非法命名的 SQL 文件时直接报错', () => {
    const migrationsDir = mkdtempSync(join(tmpdir(), 'knowledge-migrations-invalid-'));
    cleanupPaths.push(migrationsDir);

    writeFileSync(join(migrationsDir, 'bootstrap.sql'), 'SELECT 1;');

    expect(() => discoverMigrations(migrationsDir)).toThrowError(StorageError);
  });

  it('首次运行时顺序执行迁移并递增 user_version', () => {
    const provider = createDatabaseProvider(':memory:');

    const appliedVersions = runMigrations(provider, {
      migrations: [
        {
          version: 1,
          name: '001-bootstrap.sql',
          sql: 'CREATE TABLE first_table (id INTEGER PRIMARY KEY);',
        },
        {
          version: 2,
          name: '002-second.sql',
          sql: 'CREATE TABLE second_table (id INTEGER PRIMARY KEY);',
        },
      ],
    });

    expect(appliedVersions).toEqual([1, 2]);
    expect(provider.getUserVersion()).toBe(2);

    provider.close();
  });

  it('重复运行时不会再次执行已应用迁移', () => {
    const provider = createDatabaseProvider(':memory:');
    const migrations = [
      {
        version: 1,
        name: '001-bootstrap.sql',
        sql: `
          CREATE TABLE migration_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            label TEXT NOT NULL
          );
          INSERT INTO migration_runs (label) VALUES ('applied-once');
        `,
      },
    ];

    const firstRun = runMigrations(provider, { migrations });
    const secondRun = runMigrations(provider, { migrations });
    const countRow = provider
      .getConnection()
      .prepare('SELECT COUNT(*) AS count FROM migration_runs')
      .get() as { count: number };

    expect(firstRun).toEqual([1]);
    expect(secondRun).toEqual([]);
    expect(countRow.count).toBe(1);
    expect(provider.getUserVersion()).toBe(1);

    provider.close();
  });

  it('发现重复迁移版本时直接失败', () => {
    const provider = createDatabaseProvider(':memory:');

    expect(() =>
      runMigrations(provider, {
        migrations: [
          {
            version: 1,
            name: '001-bootstrap.sql',
            sql: 'SELECT 1;',
          },
          {
            version: 1,
            name: '001-bootstrap-copy.sql',
            sql: 'SELECT 1;',
          },
        ],
      }),
    ).toThrowError(StorageError);

    provider.close();
  });

  it('发现缺号迁移时直接失败', () => {
    const provider = createDatabaseProvider(':memory:');

    expect(() =>
      runMigrations(provider, {
        migrations: [
          {
            version: 2,
            name: '002-second.sql',
            sql: 'SELECT 1;',
          },
        ],
      }),
    ).toThrowError(StorageError);

    provider.close();
  });

  it('迁移失败时回滚事务并保留上一个已知好版本', () => {
    const provider = createDatabaseProvider(':memory:');

    runMigrations(provider, {
      migrations: [
        {
          version: 1,
          name: '001-bootstrap.sql',
          sql: 'CREATE TABLE stable_table (id INTEGER PRIMARY KEY);',
        },
      ],
    });

    expect(() =>
      runMigrations(provider, {
        migrations: [
          {
            version: 2,
            name: '002-broken.sql',
            sql: `
              CREATE TABLE should_rollback (id INTEGER PRIMARY KEY);
              INSERT INTO missing_table (id) VALUES (1);
            `,
          },
        ],
      }),
    ).toThrowError(StorageError);

    try {
      runMigrations(provider, {
        migrations: [
          {
            version: 2,
            name: '002-broken.sql',
            sql: `
              CREATE TABLE should_rollback (id INTEGER PRIMARY KEY);
              INSERT INTO missing_table (id) VALUES (1);
            `,
          },
        ],
      });
    } catch (error) {
      expect(error).toBeInstanceOf(StorageError);
      expect((error as StorageError).message).toContain('002');
    }

    const rolledBackRow = provider
      .getConnection()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'should_rollback'")
      .get() as { name: string } | undefined;

    expect(provider.getUserVersion()).toBe(1);
    expect(rolledBackRow).toBeUndefined();

    provider.close();
  });

  it('数据库版本高于当前代码已知迁移时直接失败', () => {
    const provider = createDatabaseProvider(':memory:');
    provider.setUserVersion(2);

    expect(() =>
      runMigrations(provider, {
        migrations: [
          {
            version: 1,
            name: '001-bootstrap.sql',
            sql: 'SELECT 1;',
          },
        ],
      }),
    ).toThrowError(StorageError);

    provider.close();
  });

  it('fresh database 在空迁移集场景下直接失败', () => {
    const migrationsDir = mkdtempSync(join(tmpdir(), 'knowledge-migrations-empty-'));
    cleanupPaths.push(migrationsDir);
    const provider = createDatabaseProvider(':memory:');

    expect(() => runMigrations(provider, { migrationsDir })).toThrowError(StorageError);

    provider.close();
  });

  it('默认迁移链为本地 markdown 入库创建 knowledge_items、chunks 与 chunks_fts', () => {
    const provider = initializeStorage({ dbPath: ':memory:' });

    const objects = provider
      .getConnection()
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = objects.map((row) => row.name);

    expect(names).toContain('knowledge_items');
    expect(names).toContain('chunks');
    expect(names).toContain('chunks_fts');

    provider.close();
  });
});
