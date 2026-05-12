import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { searchByKeyword } from '../../src/core/search/index.js';
import { ingestSource } from '../../src/core/ingestion/pipeline.js';
import { runReindexCommand } from '../../src/cli/commands/reindex.js';

const cleanup: string[] = [];

afterEach(() => {
  for (const dir of cleanup) {
    rmSync(dir, { recursive: true, force: true });
  }
  cleanup.length = 0;
});

describe('Chinese search integration', () => {
  function setupTestDb() {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-chinese-search-'));
    cleanup.push(root);
    const dbPath = join(root, 'k.db');
    const docPath = join(root, 'test.md');
    return { root, dbPath, docPath };
  }

  it('对已分词入库的中文内容可精确匹配', async () => {
    const { dbPath, docPath } = setupTestDb();

    // 写入中文文档
    writeFileSync(docPath, '# 知识管理\n\n人工智能在知识管理领域的应用越来越广泛。');

    // 入库（pipeline 会自动分词）
    await ingestSource({
      source: docPath,
      dbPath,
    });

    // 搜索：应能匹配到「知识管理」
    const result = searchByKeyword({ query: '知识管理', limit: 10, dbPath });
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.items[0].title).toBe('知识管理');
  });

  it('对长查询自动 OR fallback', async () => {
    const { dbPath, docPath } = setupTestDb();

    writeFileSync(docPath, '# TypeScript\n\nTypeScript 泛型支持约束。');

    await ingestSource({
      source: docPath,
      dbPath,
    });

    // 用很多词的查询（AND 不可能全命中）
    const result = searchByKeyword({
      query: 'TypeScript 泛型 约束 默认 参数 高级 模式',
      limit: 10,
      dbPath,
    });

    // OR fallback 应该能找到结果
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.isFallback).toBe(true);
  });

  it('kb reindex --phase fts 为已有数据补充分词', async () => {
    const { root, dbPath, docPath } = setupTestDb();

    writeFileSync(docPath, '# 深度学习\n\n深度学习是机器学习的子领域。');

    await ingestSource({
      source: docPath,
      dbPath,
    });

    // reindex
    const output: string[] = [];
    await runReindexCommand(
      { phase: 'fts', knowledgeBasePath: root, dbPath },
      { writeOut: (c) => output.push(c) },
    );

    expect(output.join('')).toContain('完成');

    // 搜索应该仍然有效
    const result = searchByKeyword({ query: '深度学习', limit: 10, dbPath });
    expect(result.total).toBeGreaterThanOrEqual(1);
  });
});
