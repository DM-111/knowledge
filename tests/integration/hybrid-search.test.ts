import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hybridSearch } from '../../src/core/search/hybrid-search.js';
import { ingestSource } from '../../src/core/ingestion/pipeline.js';

const cleanup: string[] = [];

afterEach(() => {
  for (const dir of cleanup) {
    rmSync(dir, { recursive: true, force: true });
  }
  cleanup.length = 0;
});

describe('hybrid search integration', () => {
  function setupTestDb() {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-hybrid-'));
    cleanup.push(root);
    const dbPath = join(root, 'k.db');
    const docPath = join(root, 'test.md');
    return { root, dbPath, docPath };
  }

  it('mode=fts 仅走全文路径（不需要 embedding 模型）', async () => {
    const { dbPath, docPath } = setupTestDb();

    writeFileSync(docPath, '# SQLite\n\nSQLite 是一个轻量级数据库引擎。');
    await ingestSource({ source: docPath, dbPath });

    const result = await hybridSearch({
      query: 'SQLite 数据库',
      limit: 10,
      dbPath,
      mode: 'fts',
    });

    expect(result.items.length).toBeGreaterThanOrEqual(1);
    expect(result.actualMode).toBe('fts');
    expect(result.items[0].title).toBe('SQLite');
  });

  it('mode=hybrid 在无 embedding 时自动降级为 fts', async () => {
    const { dbPath, docPath } = setupTestDb();

    writeFileSync(docPath, '# React\n\nReact 是一个用于构建用户界面的 JavaScript 库。');
    await ingestSource({ source: docPath, dbPath });

    const result = await hybridSearch({
      query: 'React 前端',
      limit: 10,
      dbPath,
      mode: 'hybrid',
    });

    // 由于没有 embedding 模型，应降级为 fts
    expect(result.actualMode).toBe('fts');
    expect(result.items.length).toBeGreaterThanOrEqual(1);
  });

  it('mode=vector 在无 embedding 时降级为 fts', async () => {
    const { dbPath, docPath } = setupTestDb();

    writeFileSync(docPath, '# Rust\n\nRust 是一门系统编程语言。');
    await ingestSource({ source: docPath, dbPath });

    const result = await hybridSearch({
      query: 'Rust 编程',
      limit: 10,
      dbPath,
      mode: 'vector',
    });

    // 无 embedding → 降级到 fts
    expect(result.actualMode).toBe('fts');
    expect(result.items.length).toBeGreaterThanOrEqual(1);
  });

  it('返回的 total 反映融合后的候选总数', async () => {
    const { dbPath, docPath } = setupTestDb();

    writeFileSync(docPath, '# 笔记\n\n第一段内容。\n\n第二段内容。\n\n第三段不同内容。');
    await ingestSource({ source: docPath, dbPath });

    const result = await hybridSearch({
      query: '内容',
      limit: 2,
      dbPath,
      mode: 'fts',
    });

    // 应该有多个匹配但只返回 limit 条
    expect(result.items.length).toBeLessThanOrEqual(2);
    expect(result.total).toBeGreaterThanOrEqual(result.items.length);
  });
});
