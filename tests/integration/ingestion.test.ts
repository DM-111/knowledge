import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execa } from 'execa';
import { runIngestCommand } from '../../src/cli/commands/ingest.js';

const cleanupPaths: string[] = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    const target = cleanupPaths.pop();
    if (target) {
      rmSync(target, { recursive: true, force: true });
    }
  }
});

describe('kb ingest integration', () => {
  it('将 markdown 文件入库并输出最小摘要', async () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-ingest-'));
    const dbPath = join(root, 'data', 'knowledge.db');
    const knowledgeBasePath = join(root, 'kb');
    cleanupPaths.push(root);

    const fixturePath = resolve('tests/fixtures/sample-article.md');
    const result = await execa(
      'node',
      [
        '--import',
        'tsx',
        'src/cli/main.ts',
        'ingest',
        fixturePath,
        '--knowledge-base-path',
        knowledgeBasePath,
        '--db-path',
        dbPath,
      ],
      {
        cwd: process.cwd(),
        reject: false,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('标题: TypeScript 泛型入门');
    expect(result.stdout).toContain(`来源: ${fixturePath}`);
    expect(result.stdout).toContain('切分块数:');
    expect(result.stdout).not.toContain('读取文件');

    const connection = new Database(dbPath, { readonly: true });
    const knowledgeItemRow = connection
      .prepare('SELECT title, source_type, source_path FROM knowledge_items')
      .get() as
      | {
          title: string;
          source_type: string;
          source_path: string;
        }
      | undefined;
    const chunkCountRow = connection.prepare('SELECT COUNT(*) AS count FROM chunks').get() as { count: number };
    const ftsCountRow = connection.prepare('SELECT COUNT(*) AS count FROM chunks_fts').get() as { count: number };

    expect(knowledgeItemRow).toEqual({
      title: 'TypeScript 泛型入门',
      source_type: 'local-markdown',
      source_path: fixturePath,
    });
    expect(chunkCountRow.count).toBeGreaterThan(0);
    expect(ftsCountRow.count).toBe(chunkCountRow.count);

    connection.close();
  });

  it('TTY 场景下输出过程进度并保留最终摘要', async () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-ingest-tty-'));
    const dbPath = join(root, 'data', 'knowledge.db');
    cleanupPaths.push(root);

    const fixturePath = resolve('tests/fixtures/sample-article.md');
    const chunks: string[] = [];

    await runIngestCommand(fixturePath, {}, {
      ensureConfig: async () => ({
        knowledgeBasePath: join(root, 'kb'),
        dbPath,
      }),
      io: {
        stdinIsTTY: true,
        stdoutIsTTY: true,
        writer: {
          write(chunk: string) {
            chunks.push(chunk);
          },
        },
      },
    });

    const output = stripTerminalControl(chunks.join(''));
    expect(output).toContain('读取文件');
    expect(output).toContain('内容清洗');
    expect(output).toContain('切分 chunks');
    expect(output).toContain('存储入库');
    expect(output).toContain('更新索引');
    expect(output).toContain('标题: TypeScript 泛型入门');
  });

  it('支持在入库时附加标签与备注', async () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-ingest-tags-'));
    const dbPath = join(root, 'data', 'knowledge.db');
    const knowledgeBasePath = join(root, 'kb');
    cleanupPaths.push(root);

    const fixturePath = resolve('tests/fixtures/sample-article.md');
    const result = await execa(
      'node',
      [
        '--import',
        'tsx',
        'src/cli/main.ts',
        'ingest',
        fixturePath,
        '--tag',
        'typescript, 学习笔记, typescript',
        '--note',
        '关于泛型的总结',
        '--knowledge-base-path',
        knowledgeBasePath,
        '--db-path',
        dbPath,
      ],
      {
        cwd: process.cwd(),
        reject: false,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('标签: typescript, 学习笔记');
    expect(result.stdout).toContain('备注: 关于泛型的总结');

    const connection = new Database(dbPath, { readonly: true });
    const knowledgeItemRow = connection
      .prepare('SELECT note FROM knowledge_items')
      .get() as
      | {
          note: string | null;
        }
      | undefined;
    const tagRows = connection
      .prepare(
        `
          SELECT t.name
          FROM item_tags it
          JOIN tags t ON t.id = it.tag_id
          ORDER BY t.id
        `,
      )
      .all() as Array<{ name: string }>;

    expect(knowledgeItemRow).toEqual({ note: '关于泛型的总结' });
    expect(tagRows).toEqual([{ name: 'typescript' }, { name: '学习笔记' }]);

    connection.close();
  });
});

function stripTerminalControl(value: string): string {
  return value.replace(/\u001B\[[0-9;]*[A-Za-z]/g, '');
}
