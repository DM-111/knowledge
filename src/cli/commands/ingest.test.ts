import { describe, expect, it } from 'vitest';
import { normalizeNoteOption, parseTagOption, runIngestCommand } from './ingest.js';

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
});

function stripTerminalControl(value: string): string {
  return value.replace(/\u001B\[[0-9;]*[A-Za-z]/g, '');
}
