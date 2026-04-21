import { describe, expect, it } from 'vitest';
import { ensureStorageReady } from './index.js';

describe('ensureStorageReady', () => {
  it('通过核心层薄入口完成当前默认数据库初始化', () => {
    const provider = ensureStorageReady({ dbPath: ':memory:' });

    const tables = provider
      .getConnection()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;

    expect(provider.getUserVersion()).toBe(2);
    expect(tables.map((table) => table.name)).toContain('knowledge_items');
    expect(tables.map((table) => table.name)).toContain('chunks');

    provider.close();
  });
});
