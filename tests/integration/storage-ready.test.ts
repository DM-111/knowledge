import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureStorageReady } from '../../src/core/index.js';

const cleanupPaths: string[] = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    const target = cleanupPaths.pop();
    if (target) {
      rmSync(target, { recursive: true, force: true });
    }
  }
});

describe('storage ready integration', () => {
  it('自动创建数据库并应用到当前最新迁移版本', () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-storage-ready-'));
    const dbPath = join(root, 'data', 'knowledge.db');
    cleanupPaths.push(root);

    const provider = ensureStorageReady({ dbPath });
    const tables = provider
      .getConnection()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;

    expect(provider.getUserVersion()).toBe(3);
    expect(tables.map((table) => table.name)).toContain('knowledge_items');
    expect(tables.map((table) => table.name)).toContain('chunks');
    expect(tables.map((table) => table.name)).toContain('chunks_fts');
    expect(tables.map((table) => table.name)).toContain('tags');
    expect(tables.map((table) => table.name)).toContain('item_tags');

    provider.close();
  });
});
