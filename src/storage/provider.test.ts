import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseProvider } from './provider.js';

const cleanupPaths: string[] = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    const target = cleanupPaths.pop();
    if (target) {
      rmSync(target, { recursive: true, force: true });
    }
  }
});

describe('DatabaseProvider', () => {
  it('允许注入 :memory: 数据库实例', () => {
    const provider = createDatabaseProvider(':memory:');

    provider.getConnection().exec('CREATE TABLE test_table (id INTEGER PRIMARY KEY);');

    const row = provider
      .getConnection()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'test_table'")
      .get() as { name: string } | undefined;

    expect(row?.name).toBe('test_table');

    provider.close();
  });

  it('在文件型路径不存在时自动创建父目录和数据库文件', () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-provider-'));
    const dbPath = join(root, 'nested', 'knowledge.db');
    cleanupPaths.push(root);

    const provider = createDatabaseProvider(dbPath);

    expect(existsSync(dbPath)).toBe(true);

    provider.close();
  });
});
