import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ingestSource, ingestSourceWithProvider } from './pipeline.js';
import type { ProgressEvent } from '../types.js';
import Database from 'better-sqlite3';
import type { DatabaseProvider } from '../../storage/index.js';
import { StorageError } from '../../errors/index.js';
import * as chunkerModule from './chunker.js';

const cleanupPaths: string[] = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    const target = cleanupPaths.pop();
    if (target) {
      rmSync(target, { recursive: true, force: true });
    }
  }
});

describe('ingest pipeline', () => {
  it('按 resolve -> fetch -> parse -> chunk -> store -> index 顺序发送进度事件', async () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-pipeline-'));
    cleanupPaths.push(root);

    const source = join(root, 'article.md');
    const dbPath = join(root, 'knowledge.db');
    writeFileSync(source, '# 标题\n\n第一段内容。\n\n第二段内容。');

    const events: ProgressEvent[] = [];
    const result = await ingestSource({
      source,
      dbPath,
      onProgress: (event) => {
        events.push(event);
      },
    });

    expect(result.title).toBe('标题');
    expect(result.chunkCount).toBeGreaterThan(0);
    expect(events.map((event) => `${event.step}:${event.status}`)).toEqual([
      'resolve-adapter:start',
      'resolve-adapter:complete',
      'fetch:start',
      'fetch:complete',
      'parse:start',
      'parse:complete',
      'chunk:start',
      'chunk:complete',
      'store:start',
      'store:complete',
      'index:start',
      'index:complete',
    ]);
  });

  it('在同一事务中写入备注、标签与 chunks', async () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-pipeline-tags-'));
    cleanupPaths.push(root);

    const source = join(root, 'article.md');
    const dbPath = join(root, 'knowledge.db');
    writeFileSync(source, '# 标题\n\n第一段内容。\n\n第二段内容。');

    const result = await ingestSource({
      source,
      dbPath,
      tags: ['typescript', '学习笔记', 'typescript'],
      note: '关于泛型的总结',
    });

    const connection = new Database(dbPath, { readonly: true });
    const itemRow = connection
      .prepare('SELECT id, note FROM knowledge_items WHERE id = ?')
      .get(result.knowledgeItemId) as { id: number; note: string | null } | undefined;
    const tagRows = connection
      .prepare(
        `
          SELECT t.name
          FROM item_tags it
          JOIN tags t ON t.id = it.tag_id
          WHERE it.knowledge_item_id = ?
          ORDER BY t.id
        `,
      )
      .all(result.knowledgeItemId) as Array<{ name: string }>;

    expect(result.tags).toEqual(['typescript', '学习笔记']);
    expect(result.note).toBe('关于泛型的总结');
    expect(itemRow).toEqual({
      id: result.knowledgeItemId,
      note: '关于泛型的总结',
    });
    expect(tagRows).toEqual([{ name: 'typescript' }, { name: '学习笔记' }]);

    connection.close();
  });

  it('内容清洗失败时会先发送 parse:error 事件再抛错', async () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-pipeline-parse-error-'));
    cleanupPaths.push(root);

    const source = join(root, 'empty.md');
    const dbPath = join(root, 'knowledge.db');
    writeFileSync(source, '   ');

    const events: ProgressEvent[] = [];

    await expect(
      ingestSource({
        source,
        dbPath,
        onProgress: (event) => {
          events.push(event);
        },
      }),
    ).rejects.toThrow('Markdown 内容为空');

    expect(events.map((event) => `${event.step}:${event.status}`)).toEqual([
      'resolve-adapter:start',
      'resolve-adapter:complete',
      'fetch:start',
      'fetch:complete',
      'parse:start',
      'parse:error',
    ]);
  });

  it('未找到可处理 adapter 时会先发送 resolve-adapter:error 事件再抛错', async () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-pipeline-adapter-error-'));
    cleanupPaths.push(root);

    const source = join(root, 'article.txt');
    const dbPath = join(root, 'knowledge.db');
    writeFileSync(source, 'plain text');

    const events: ProgressEvent[] = [];

    await expect(
      ingestSource({
        source,
        dbPath,
        onProgress: (event) => {
          events.push(event);
        },
      }),
    ).rejects.toThrow('未找到可处理该来源的入库 adapter');

    expect(events.map((event) => `${event.step}:${event.status}`)).toEqual([
      'resolve-adapter:start',
      'resolve-adapter:error',
    ]);
  });

  it('读取来源失败时会先发送 fetch:error 事件再抛错', async () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-pipeline-fetch-error-'));
    cleanupPaths.push(root);

    const source = join(root, 'missing.md');
    const dbPath = join(root, 'knowledge.db');
    const events: ProgressEvent[] = [];

    await expect(
      ingestSource({
        source,
        dbPath,
        onProgress: (event) => {
          events.push(event);
        },
      }),
    ).rejects.toThrow('读取来源内容失败');

    expect(events.map((event) => `${event.step}:${event.status}`)).toEqual([
      'resolve-adapter:start',
      'resolve-adapter:complete',
      'fetch:start',
      'fetch:error',
    ]);
  });

  it('chunker 直接抛错时会先发送 chunk:error 事件再抛错', async () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-pipeline-chunk-error-'));
    cleanupPaths.push(root);

    const source = join(root, 'article.md');
    const dbPath = join(root, 'knowledge.db');
    writeFileSync(source, '# 标题\n\n第一段内容。');

    const events: ProgressEvent[] = [];
    const chunkerSpy = vi.spyOn(chunkerModule, 'chunkMarkdownContent').mockImplementation(() => {
      throw new Error('chunker crashed');
    });

    await expect(
      ingestSource({
        source,
        dbPath,
        onProgress: (event) => {
          events.push(event);
        },
      }),
    ).rejects.toThrow('切分 Markdown 内容失败');

    expect(events.map((event) => `${event.step}:${event.status}`)).toEqual([
      'resolve-adapter:start',
      'resolve-adapter:complete',
      'fetch:start',
      'fetch:complete',
      'parse:start',
      'parse:complete',
      'chunk:start',
      'chunk:error',
    ]);

    chunkerSpy.mockRestore();
  });

  it('持久化失败时会先发送 store:error 事件再抛错', async () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-pipeline-store-error-'));
    cleanupPaths.push(root);

    const source = join(root, 'article.md');
    writeFileSync(source, '# 标题\n\n第一段内容。');

    const events: ProgressEvent[] = [];

    await expect(
      ingestSourceWithProvider(createFailingProvider(), {
        source,
        dbPath: ':memory:',
        onProgress: (event) => {
          events.push(event);
        },
      }),
    ).rejects.toThrow('写入数据库失败');

    expect(events.map((event) => `${event.step}:${event.status}`)).toContain('store:error');
  });

  it('未注入 onProgress 时保持静默并成功入库', async () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-pipeline-silent-'));
    cleanupPaths.push(root);

    const source = join(root, 'article.md');
    const dbPath = join(root, 'knowledge.db');
    writeFileSync(source, '# 标题\n\n第一段内容。');

    const result = await ingestSource({
      source,
      dbPath,
    });

    expect(result.title).toBe('标题');
    expect(result.chunkCount).toBeGreaterThan(0);
  });
});

function createFailingProvider(): DatabaseProvider {
  return {
    dbPath: ':memory:',
    getConnection() {
      throw new Error('not used');
    },
    transaction() {
      throw new StorageError('写入数据库失败', {
        step: 'store',
        source: ':memory:',
      });
    },
    getUserVersion() {
      return 0;
    },
    setUserVersion() {},
    close() {},
  };
}
