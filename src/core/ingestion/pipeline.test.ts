import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ingestSource } from './pipeline.js';
import type { ProgressEvent } from '../types.js';
import Database from 'better-sqlite3';

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
});
