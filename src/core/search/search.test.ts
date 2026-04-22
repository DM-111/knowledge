import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SearchError } from '../../errors/index.js';
import { ChunkRepository, initializeStorage, KnowledgeItemRepository, TagRepository } from '../../storage/index.js';
import { buildFtsMatchQuery, listKnowledgeItems, searchByKeyword } from './index.js';

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
    const tagRepository = new TagRepository(provider);
    provider.transaction((db) => {
      const genericsId = knowledgeItemRepository.create(
        {
          title: 'TypeScript 泛型',
          sourceType: 'local-markdown',
          sourcePath: '/docs/ts-generics.md',
          content: '# 示例\n\n过滤词Alpha 与泛型',
          wordCount: 20,
          createdAt: '2026-04-20T12:00:00.000Z',
        },
        db,
      );
      chunkRepository.createMany(
        genericsId,
        [
          {
            chunkIndex: 0,
            content: '过滤词Alpha 与泛型说明第一段',
            startOffset: 0,
            endOffset: 20,
            overlapStartOffset: 0,
            overlapEndOffset: 0,
          },
          {
            chunkIndex: 1,
            content: '第二段 过滤词Alpha 继续',
            startOffset: 20,
            endOffset: 40,
            overlapStartOffset: 0,
            overlapEndOffset: 0,
          },
        ],
        db,
      );
      tagRepository.linkTagsToItem(genericsId, tagRepository.ensureTagIds(['typescript', 'guide'], db), db);

      const webId = knowledgeItemRepository.create(
        {
          title: 'Web 版泛型教程',
          sourceType: 'web',
          sourcePath: 'https://example.com/typescript-generics',
          content: '# Web 示例\n\n过滤词Alpha 来自网页',
          wordCount: 24,
          createdAt: '2026-04-10T08:00:00.000Z',
        },
        db,
      );
      chunkRepository.createMany(
        webId,
        [
          {
            chunkIndex: 0,
            content: '过滤词Alpha 来自网页内容',
            startOffset: 0,
            endOffset: 16,
            overlapStartOffset: 0,
            overlapEndOffset: 0,
          },
        ],
        db,
      );
      tagRepository.linkTagsToItem(webId, tagRepository.ensureTagIds(['typescript', 'web'], db), db);

      const rustId = knowledgeItemRepository.create(
        {
          title: 'Rust 所有权',
          sourceType: 'local-markdown',
          sourcePath: '/docs/rust-ownership.md',
          content: '# Rust 示例\n\n过滤词Alpha 与所有权',
          wordCount: 18,
          createdAt: '2026-05-01T09:30:00.000Z',
        },
        db,
      );
      chunkRepository.createMany(
        rustId,
        [
          {
            chunkIndex: 0,
            content: '过滤词Alpha 与所有权规则',
            startOffset: 0,
            endOffset: 15,
            overlapStartOffset: 0,
            overlapEndOffset: 0,
          },
        ],
        db,
      );
      tagRepository.linkTagsToItem(rustId, tagRepository.ensureTagIds(['rust'], db), db);

      const noTagId = knowledgeItemRepository.create(
        {
          title: 'SQLite 速查',
          sourceType: 'local-markdown',
          sourcePath: '/docs/sqlite-cheatsheet.md',
          content: '# SQLite\n\n数据库命令速查',
          wordCount: 12,
          createdAt: '2026-04-05T10:00:00.000Z',
        },
        db,
      );
      chunkRepository.createMany(
        noTagId,
        [
          {
            chunkIndex: 0,
            content: '数据库命令速查',
            startOffset: 0,
            endOffset: 8,
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

    const result = searchByKeyword({ query: '过滤词Alpha', limit: 10, dbPath });
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.items.length).toBeGreaterThanOrEqual(1);
    const first = result.items[0];
    expect(first.title).toBe('TypeScript 泛型');
    expect(first.sourcePath).toBe('/docs/ts-generics.md');
    expect(first.createdAt).toBe('2026-04-20T12:00:00.000Z');
    expect(first.hitSnippet).toMatch(/过滤词Alpha/);
  });

  it('无命中时返回空 items 与 total 0', () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-search-empty-'));
    const dbPath = join(root, 'k.db');
    cleanup.push(root);
    seedSearchFixture(dbPath);

    const result = searchByKeyword({ query: '不存在于库中的词zzzz', limit: 10, dbPath });
    expect(result).toEqual({ items: [], total: 0 });
  });

  it('在 limit 下仅返回前 N 条（相关度序），但 total 保留完整命中数', () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-search-limit-'));
    const dbPath = join(root, 'k.db');
    cleanup.push(root);
    seedSearchFixture(dbPath);

    const result = searchByKeyword({ query: '过滤词Alpha', limit: 1, dbPath });
    expect(result.items).toHaveLength(1);
    expect(result.total).toBeGreaterThan(1);
  });

  it('在 limit 非法时抛出 SearchError', () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-search-badlim-'));
    const dbPath = join(root, 'k.db');
    cleanup.push(root);
    seedSearchFixture(dbPath);

    expect(() => searchByKeyword({ query: 'a', limit: 0, dbPath })).toThrow(SearchError);
  });

  it('支持按标签与来源过滤命中结果', () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-search-filter-'));
    const dbPath = join(root, 'k.db');
    cleanup.push(root);
    seedSearchFixture(dbPath);

    const result = searchByKeyword({
      query: '过滤词Alpha',
      limit: 10,
      dbPath,
      tag: 'typescript',
      source: 'local-markdown',
    });

    expect(result.items.length).toBeGreaterThanOrEqual(1);
    expect(result.total).toBe(result.items.length);
    expect(new Set(result.items.map((hit) => hit.title))).toEqual(new Set(['TypeScript 泛型']));
  });

  it('支持按日期范围过滤命中结果，并对 YYYY-MM-DD 采用包含边界', () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-search-date-'));
    const dbPath = join(root, 'k.db');
    cleanup.push(root);
    seedSearchFixture(dbPath);

    const result = searchByKeyword({
      query: '过滤词Alpha',
      limit: 10,
      dbPath,
      after: '2026-04-10',
      before: '2026-04-20',
    });

    expect(result.items.length).toBeGreaterThanOrEqual(1);
    expect(result.total).toBe(result.items.length);
    expect(new Set(result.items.map((hit) => hit.title))).toEqual(new Set(['TypeScript 泛型', 'Web 版泛型教程']));
  });

  it('日期参数非法时抛出稳定的 SearchError', () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-search-baddate-'));
    const dbPath = join(root, 'k.db');
    cleanup.push(root);
    seedSearchFixture(dbPath);

    expect(() =>
      searchByKeyword({
        query: '过滤词Alpha',
        limit: 10,
        dbPath,
        after: '2026-13-40',
      }),
    ).toThrow(SearchError);
  });
});

describe('listKnowledgeItems', () => {
  it('返回稳定排序的条目列表、标签列表与总数', () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-list-'));
    const dbPath = join(root, 'k.db');
    cleanup.push(root);
    seedSearchFixture(dbPath);

    const result = listKnowledgeItems({ dbPath });

    expect(result.total).toBe(4);
    expect(result.items.map((item) => item.title)).toEqual([
      'Rust 所有权',
      'TypeScript 泛型',
      'Web 版泛型教程',
      'SQLite 速查',
    ]);
    expect(result.items[1]).toEqual({
      id: expect.any(Number),
      title: 'TypeScript 泛型',
      sourceType: 'local-markdown',
      tags: ['guide', 'typescript'],
      createdAt: '2026-04-20T12:00:00.000Z',
    });
    expect(result.items[3]?.tags).toEqual([]);
  });

  it('支持按标签、来源过滤并尊重 limit，同时保留过滤后的总数', () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-list-filter-'));
    const dbPath = join(root, 'k.db');
    cleanup.push(root);
    seedSearchFixture(dbPath);

    const result = listKnowledgeItems({
      dbPath,
      tag: 'typescript',
      source: 'local-markdown',
      limit: 1,
    });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.title).toBe('TypeScript 泛型');
  });

  it('支持按日期范围过滤列表结果', () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-list-date-'));
    const dbPath = join(root, 'k.db');
    cleanup.push(root);
    seedSearchFixture(dbPath);

    const result = listKnowledgeItems({
      dbPath,
      after: '2026-04-01',
      before: '2026-04-30',
    });

    expect(result.total).toBe(3);
    expect(result.items.map((item) => item.title)).toEqual([
      'TypeScript 泛型',
      'Web 版泛型教程',
      'SQLite 速查',
    ]);
  });

  it('在非法日期输入时抛出 SearchError', () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-list-baddate-'));
    const dbPath = join(root, 'k.db');
    cleanup.push(root);
    seedSearchFixture(dbPath);

    expect(() => listKnowledgeItems({ dbPath, before: 'not-a-date' })).toThrow(SearchError);
  });
});

describe('searchByKeyword 与 buildFtsMatchQuery', () => {
  it('单英语词生成为前缀查询', () => {
    expect(buildFtsMatchQuery('ok')).toBe('ok*');
  });
});
