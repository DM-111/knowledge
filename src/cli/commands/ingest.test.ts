import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { normalizeNoteOption, parseTagOption, runIngestCommand } from './ingest.js';
import { ingestSource } from '../../core/index.js';
import { IngestionError } from '../../errors/index.js';

const cleanupPaths: string[] = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    const target = cleanupPaths.pop();
    if (target) {
      rmSync(target, { recursive: true, force: true });
    }
  }
});

describe('ingest command helpers', () => {
  it('将 --tag 解析为去空白、去空项、去重且保持顺序的标签数组', () => {
    expect(parseTagOption('typescript, 学习笔记, ,typescript,  架构 ')).toEqual([
      'typescript',
      '学习笔记',
      '架构',
    ]);
  });

  it('缺少 --tag 时返回空数组', () => {
    expect(parseTagOption(undefined)).toEqual([]);
    expect(parseTagOption('')).toEqual([]);
  });

  it('将 --note 归一化为可选备注', () => {
    expect(normalizeNoteOption('  关于泛型的总结  ')).toBe('关于泛型的总结');
    expect(normalizeNoteOption('   ')).toBeUndefined();
    expect(normalizeNoteOption(undefined)).toBeUndefined();
  });

  it('TTY 场景会输出实时进度和最终摘要', async () => {
    const chunks: string[] = [];

    await runIngestCommand('sample.md', {}, {
      ensureConfig: async () => ({
        knowledgeBasePath: '/tmp/kb',
        dbPath: '/tmp/knowledge.db',
      }),
      ingest: async (options) => {
        options.onProgress?.({
          step: 'fetch',
          status: 'start',
          detail: '读取 sample.md',
        });
        options.onProgress?.({
          step: 'fetch',
          status: 'complete',
          detail: '已读取 sample.md',
        });

        return {
          title: '示例文章',
          sourcePath: '/tmp/sample.md',
          wordCount: 128,
          chunkCount: 3,
          knowledgeItemId: 1,
          tags: ['typescript'],
          note: '测试备注',
        };
      },
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
    expect(output).toContain('标题: 示例文章');
    expect(output).toContain('标签: typescript');
    expect(output).toContain('备注: 测试备注');
  });

  it('非 TTY 场景只输出最终摘要，不输出进度', async () => {
    const chunks: string[] = [];

    await runIngestCommand('sample.md', {}, {
      ensureConfig: async () => ({
        knowledgeBasePath: '/tmp/kb',
        dbPath: '/tmp/knowledge.db',
      }),
      ingest: async (options) => {
        options.onProgress?.({
          step: 'fetch',
          status: 'start',
          detail: '读取 sample.md',
        });

        return {
          title: '示例文章',
          sourcePath: '/tmp/sample.md',
          wordCount: 128,
          chunkCount: 3,
          knowledgeItemId: 1,
          tags: [],
          note: undefined,
        };
      },
      io: {
        stdinIsTTY: false,
        stdoutIsTTY: false,
        writer: {
          write(chunk: string) {
            chunks.push(chunk);
          },
        },
      },
    });

    const output = stripTerminalControl(chunks.join(''));
    expect(output).toContain('标题: 示例文章');
    expect(output).not.toContain('读取文件');
  });

  it('重复来源时可在 TTY 场景选择跳过，且不会再次执行入库', async () => {
    const chunks: string[] = [];
    const ingest = vi.fn();

    await runIngestCommand('sample.md', {}, {
      ensureConfig: async () => ({
        knowledgeBasePath: '/tmp/kb',
        dbPath: '/tmp/knowledge.db',
      }),
      inspectDuplicate: async () => ({
        id: 7,
        title: '已存在文章',
        sourceType: 'local-markdown',
        sourcePath: '/tmp/sample.md',
        createdAt: '2026-04-21T08:00:00.000Z',
        note: '旧备注',
      }),
      prompts: {
        selectDuplicateAction: async () => 'skip',
      },
      ingest,
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

    expect(ingest).not.toHaveBeenCalled();
    expect(stripTerminalControl(chunks.join(''))).toContain('已跳过重复入库');
  });

  it('重复来源时可在 TTY 场景选择覆盖，并以 replace 策略继续入库', async () => {
    const ingest = vi.fn(async () => ({
      title: '新文章',
      sourcePath: '/tmp/sample.md',
      wordCount: 32,
      chunkCount: 2,
      knowledgeItemId: 8,
      tags: [],
      note: undefined,
    }));

    await runIngestCommand('sample.md', {}, {
      ensureConfig: async () => ({
        knowledgeBasePath: '/tmp/kb',
        dbPath: '/tmp/knowledge.db',
      }),
      inspectDuplicate: async () => ({
        id: 7,
        title: '已存在文章',
        sourceType: 'local-markdown',
        sourcePath: '/tmp/sample.md',
        createdAt: '2026-04-21T08:00:00.000Z',
      }),
      prompts: {
        selectDuplicateAction: async () => 'replace',
      },
      ingest,
      io: {
        stdinIsTTY: true,
        stdoutIsTTY: true,
        writer: { write() {} },
      },
    });

    expect(ingest).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'sample.md',
        duplicateStrategy: 'replace',
      }),
    );
  });

  it('非 TTY 场景遇到重复来源时默认跳过且不会挂起', async () => {
    const chunks: string[] = [];
    const ingest = vi.fn();

    await runIngestCommand('sample.md', {}, {
      ensureConfig: async () => ({
        knowledgeBasePath: '/tmp/kb',
        dbPath: '/tmp/knowledge.db',
      }),
      inspectDuplicate: async () => ({
        id: 7,
        title: '已存在文章',
        sourceType: 'local-markdown',
        sourcePath: '/tmp/sample.md',
        createdAt: '2026-04-21T08:00:00.000Z',
      }),
      ingest,
      io: {
        stdinIsTTY: false,
        stdoutIsTTY: false,
        writer: {
          write(chunk: string) {
            chunks.push(chunk);
          },
        },
      },
    });

    expect(ingest).not.toHaveBeenCalled();
    expect(stripTerminalControl(chunks.join(''))).toContain('非交互环境默认跳过');
  });

  it('重复来源分支在已收到 SIGINT 时不会误报为成功跳过', async () => {
    const signalTarget = new EventEmitter();
    const chunks: string[] = [];

    await expect(
      runIngestCommand('sample.md', {}, {
        ensureConfig: async () => ({
          knowledgeBasePath: '/tmp/kb',
          dbPath: '/tmp/knowledge.db',
        }),
        signalTarget,
        inspectDuplicate: async () => {
          signalTarget.emit('SIGINT');
          return {
            id: 7,
            title: '已存在文章',
            sourceType: 'local-markdown',
            sourcePath: '/tmp/sample.md',
            createdAt: '2026-04-21T08:00:00.000Z',
          };
        },
        io: {
          stdinIsTTY: false,
          stdoutIsTTY: false,
          writer: {
            write(chunk: string) {
              chunks.push(chunk);
            },
          },
        },
      }),
    ).rejects.toThrow('入库已取消');

    expect(stripTerminalControl(chunks.join(''))).not.toContain('默认跳过');
  });

  it('非 TTY 场景在事务内竞态发现重复时仍按跳过策略收敛', async () => {
    const chunks: string[] = [];

    await runIngestCommand('sample.md', {}, {
      ensureConfig: async () => ({
        knowledgeBasePath: '/tmp/kb',
        dbPath: '/tmp/knowledge.db',
      }),
      inspectDuplicate: async () => undefined,
      ingest: async () => {
        throw new IngestionError('检测到重复来源，已按策略跳过入库', {
          step: 'store',
          source: '/tmp/sample.md',
        });
      },
      io: {
        stdinIsTTY: false,
        stdoutIsTTY: false,
        writer: {
          write(chunk: string) {
            chunks.push(chunk);
          },
        },
      },
    });

    expect(stripTerminalControl(chunks.join(''))).toContain('检测到并发重复来源，已跳过入库');
  });

  it('收到 SIGINT 时以受控方式中止，并且不留下半成品数据', async () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-ingest-sigint-'));
    cleanupPaths.push(root);

    const source = resolve('tests/fixtures/sample-article.md');
    const dbPath = join(root, 'knowledge.db');
    const signalTarget = new EventEmitter();

    await expect(
      runIngestCommand(source, {}, {
        ensureConfig: async () => ({
          knowledgeBasePath: join(root, 'kb'),
          dbPath,
        }),
        signalTarget,
        ingest: async (options) =>
          ingestSource({
            ...options,
            onProgress(event) {
              options.onProgress?.(event);
              if (event.step === 'parse' && event.status === 'complete') {
                signalTarget.emit('SIGINT');
              }
            },
          }),
        io: {
          stdinIsTTY: false,
          stdoutIsTTY: false,
          writer: { write() {} },
        },
      }),
    ).rejects.toThrow('入库已取消');

    const connection = new Database(dbPath, { readonly: true });
    const itemCount = connection.prepare('SELECT COUNT(*) AS count FROM knowledge_items').get() as { count: number };
    const chunkCount = connection.prepare('SELECT COUNT(*) AS count FROM chunks').get() as { count: number };
    const tagCount = connection.prepare('SELECT COUNT(*) AS count FROM item_tags').get() as { count: number };

    expect(itemCount.count).toBe(0);
    expect(chunkCount.count).toBe(0);
    expect(tagCount.count).toBe(0);

    connection.close();
  });
});

function stripTerminalControl(value: string): string {
  return value.replace(/\u001B\[[0-9;]*[A-Za-z]/g, '');
}
