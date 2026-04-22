import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SearchError } from '../../errors/index.js';
import { ChunkRepository, initializeStorage, KnowledgeItemRepository } from '../../storage/index.js';
import { buildFtsMatchQuery, searchByKeyword } from './index.js';

const cleanup: string[] = [];

afterEach(() => {
  while (cleanup.length > 0) {
    const p = cleanup.pop();
    if (p) {
      rmSync(p, { recursive: true, force: true });
    }
  }
});

function seedSearchFixture(dbPath: string): void {
  const provider = initializeStorage({ dbPath });
  try {
    const knowledgeItemRepository = new KnowledgeItemRepository(provider);
    const chunkRepository = new ChunkRepository(provider);
    provider.transaction((db) => {
      const itemId = knowledgeItemRepository.create(
        {
          title: 'TypeScript 泛型',
          sourceType: 'local-markdown',
          sourcePath: '/docs/ts-generics.md',
          content: '# 示例\n\n独测试词XyZ 与泛型',
          wordCount: 20,
          createdAt: '2026-04-20T12:00:00.000Z',
        },
        db,
      );
      chunkRepository.createMany(
        itemId,
        [
          {
            chunkIndex: 0,
            content: '独测试词XyZ 与泛型说明第一段',
            startOffset: 0,
            endOffset: 20,
            overlapStartOffset: 0,
            overlapEndOffset: 0,
          },
          {
            chunkIndex: 1,
            content: '第二段 独测试词XyZ 继续',
            startOffset: 20,
            endOffset: 40,
            overlapStartOffset: 0,
            overlapEndOffset: 0,
          },
        ],
        db,
      );
    });
  } finally {
    provider.close();
  }
}

describe('searchByKeyword', () => {
  it('对 FTS 做全文匹配并返回标题、来源、摘要与时间', () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-search-'));
    const dbPath = join(root, 'k.db');
    cleanup.push(root);
    seedSearchFixture(dbPath);

    const hits = searchByKeyword({ query: '独测试词XyZ', limit: 10, dbPath });
    expect(hits.length).toBeGreaterThanOrEqual(1);
    const first = hits[0];
    expect(first.title).toBe('TypeScript 泛型');
    expect(first.sourcePath).toBe('/docs/ts-generics.md');
    expect(first.createdAt).toBe('2026-04-20T12:00:00.000Z');
    expect(first.hitSnippet).toMatch(/独测试词XyZ/);
  });

  it('无命中时返回空数组', () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-search-empty-'));
    const dbPath = join(root, 'k.db');
    cleanup.push(root);
    seedSearchFixture(dbPath);

    const hits = searchByKeyword({ query: '不存在于库中的词zzzz', limit: 10, dbPath });
    expect(hits).toEqual([]);
  });

  it('在 limit 下仅返回前 N 条（相关度序）', () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-search-limit-'));
    const dbPath = join(root, 'k.db');
    cleanup.push(root);
    seedSearchFixture(dbPath);

    const hits = searchByKeyword({ query: '独测试词XyZ', limit: 1, dbPath });
    expect(hits).toHaveLength(1);
  });

  it('在 limit 非法时抛出 SearchError', () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-search-badlim-'));
    const dbPath = join(root, 'k.db');
    cleanup.push(root);
    seedSearchFixture(dbPath);

    expect(() => searchByKeyword({ query: 'a', limit: 0, dbPath })).toThrow(SearchError);
  });
});

describe('searchByKeyword 与 buildFtsMatchQuery', () => {
  it('单英语词生成为前缀查询', () => {
    expect(buildFtsMatchQuery('ok')).toBe('ok*');
  });
});
