import { describe, expect, it, vi } from 'vitest';
import { runSearchCommand, type RunSearchCommandDependencies } from './search.js';
import { searchByKeyword, type SearchHit, type SearchResult } from '../../core/index.js';
import { SearchError } from '../../errors/index.js';
import { formatSearchResult, resolveOutputMode } from '../formatters/index.js';

describe('formatSearchResult', () => {
  it('无结果时输出稳定提示', () => {
    expect(formatSearchResult({ items: [], total: 0 }, { mode: 'plain', query: '词' })).toBe('未找到匹配结果\n共 0 条，当前展示 0 条\n');
  });

  it('plain 模式保持稳定文本且不含 ANSI', () => {
    const text = formatSearchResult(
      {
        items: [
          {
            chunkId: 1,
            title: 'T',
            sourcePath: '/a.md',
            hitSnippet: '【命中】',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        total: 1,
      },
      { mode: 'plain', query: '命中' },
    );
    expect(text).toContain('1. T');
    expect(text).toContain('来源: /a.md');
    expect(text).toContain('摘要: 【命中】');
    expect(text).toContain('入库时间: 2026-01-01T00:00:00.000Z');
    expect(text).not.toMatch(/\u001B\[[0-9;]*m/);
  });

  it('tty 模式会高亮关键词、截断摘要并本地化时间', () => {
    const text = formatSearchResult(
      {
        items: [
          {
            chunkId: 1,
            title: 'TypeScript 泛型',
            sourcePath: '/a.md',
            hitSnippet:
              '这是一个非常长的摘要字段，用于验证在 TTY 模式下会被截断，同时对泛型关键词做高亮处理，避免输出过长影响可读性。为了确保长度足够，这里继续补充一些额外内容，让摘要超过默认阈值并稳定出现省略号。',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        total: 3,
      },
      { mode: 'tty', query: '泛型' },
    );

    expect(text).toMatch(/\u001B\[[0-9;]*m/);
    expect(text).toContain('...');
    expect(text).toContain('共 3 条，当前展示 1 条');
    expect(text).not.toContain('2026-01-01T00:00:00.000Z');
  });

  it('json 模式输出结构化结果', () => {
    const text = formatSearchResult(
      {
        items: [
          {
            chunkId: 9,
            title: 'JSON',
            sourcePath: '/j.md',
            hitSnippet: 'snippet',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        total: 4,
      },
      { mode: 'json', query: 'JSON' },
    );

    expect(JSON.parse(text)).toEqual({
      items: [
        {
          chunkId: 9,
          title: 'JSON',
          sourcePath: '/j.md',
          hitSnippet: 'snippet',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      total: 4,
    });
  });
});

describe('resolveOutputMode', () => {
  it('优先使用 --json，其次根据 stdout 是否 TTY 判断', () => {
    expect(resolveOutputMode({ json: true, stdoutIsTTY: true })).toBe('json');
    expect(resolveOutputMode({ json: false, stdoutIsTTY: true })).toBe('tty');
    expect(resolveOutputMode({ json: false, stdoutIsTTY: false })).toBe('plain');
  });
});

describe('runSearchCommand', () => {
  it('无关键词时先抛出 SearchError，不触发配置预检', async () => {
    const ensureConfig = vi.fn(async () => ({
      knowledgeBasePath: '/tmp/kb',
      dbPath: '/tmp/kb/db.sqlite',
    }));

    await expect(
      runSearchCommand(
        undefined,
        { limit: '20' },
        {
          ensureConfig,
        },
      ),
    ).rejects.toThrow(SearchError);
    expect(ensureConfig).not.toHaveBeenCalled();
  });

  it('有结果时写入 stdout', async () => {
    const out: string[] = [];
    const hit: SearchHit = {
      chunkId: 1,
      title: '标题',
      sourcePath: '/p.md',
      createdAt: '2026-01-01T00:00:00.000Z',
      hitSnippet: '摘要',
    };
    const search = vi.fn((): ReturnType<typeof searchByKeyword> => ({
      items: [hit],
      total: 1,
    }));

    await runSearchCommand(
      '词',
      {
        limit: '5',
        tag: 'typescript',
        source: 'local-markdown',
        after: '2026-04-01',
        before: '2026-04-30',
      } as {
        limit: string;
        tag: string;
        source: string;
        after: string;
        before: string;
      },
      {
        ensureConfig: async () => ({
          knowledgeBasePath: '/tmp/kb',
          dbPath: '/tmp/x.db',
        }),
        search,
        stdoutIsTTY: false,
        writeOut: (c) => {
          out.push(c);
        },
      },
    );

    expect(search).toHaveBeenCalledWith({
      query: '词',
      limit: 5,
      dbPath: '/tmp/x.db',
      tag: 'typescript',
      source: 'local-markdown',
      after: '2026-04-01',
      before: '2026-04-30',
    });
    const joined = out.join('');
    expect(joined).toContain('标题');
    expect(joined).not.toContain('未找到匹配结果');
  });

  it('无命中时仅输出未找到提示', async () => {
    const out: string[] = [];
    await runSearchCommand('x', { limit: '20' } as { limit: string }, {
      ensureConfig: async () => ({
        knowledgeBasePath: '/tmp/kb',
        dbPath: '/tmp/x.db',
      }),
      search: (): SearchResult => ({ items: [], total: 0 }),
      stdoutIsTTY: false,
      writeOut: (c) => {
        out.push(c);
      },
    });
    expect(out.join('')).toBe('未找到匹配结果\n共 0 条，当前展示 0 条\n');
  });

  it('在 --limit 为 0 时抛出 SearchError', async () => {
    await expect(
      runSearchCommand('词', { limit: '0' } as { limit: string }, {
        ensureConfig: async () => ({
          knowledgeBasePath: '/tmp/kb',
          dbPath: '/tmp/x.db',
        }),
      } as RunSearchCommandDependencies),
    ).rejects.toThrow(SearchError);
  });

  it('在 --limit 非可解析正整数时抛出 SearchError', async () => {
    await expect(
      runSearchCommand('词', { limit: 'nope' } as { limit: string }, {
        ensureConfig: async () => ({
          knowledgeBasePath: '/tmp/kb',
          dbPath: '/tmp/x.db',
        }),
      } as RunSearchCommandDependencies),
    ).rejects.toThrow(SearchError);
  });

  it('在 --limit 含非数字后缀时抛出 SearchError', async () => {
    await expect(
      runSearchCommand('词', { limit: '2abc' } as { limit: string }, {
        ensureConfig: async () => ({
          knowledgeBasePath: '/tmp/kb',
          dbPath: '/tmp/x.db',
        }),
      } as RunSearchCommandDependencies),
    ).rejects.toThrow(SearchError);
  });

  it('在 --json 模式输出 items/total 结构化结果', async () => {
    const out: string[] = [];
    await runSearchCommand(
      '词',
      { limit: '20', json: true },
      {
        ensureConfig: async () => ({
          knowledgeBasePath: '/tmp/kb',
          dbPath: '/tmp/x.db',
        }),
        search: (): SearchResult => ({
          items: [
            {
              chunkId: 2,
              title: '结构化结果',
              sourcePath: '/tmp/a.md',
              createdAt: '2026-01-01T00:00:00.000Z',
              hitSnippet: '词',
            },
          ],
          total: 5,
        }),
        stdoutIsTTY: true,
        writeOut: (chunk) => {
          out.push(chunk);
        },
      },
    );

    expect(JSON.parse(out.join(''))).toEqual({
      items: [
        {
          chunkId: 2,
          title: '结构化结果',
          sourcePath: '/tmp/a.md',
          createdAt: '2026-01-01T00:00:00.000Z',
          hitSnippet: '词',
        },
      ],
      total: 5,
    });
  });

  it('在 --json 模式无命中时返回稳定的空结果体且退出码为 0', async () => {
    const out: string[] = [];
    await runSearchCommand(
      '不存在的词',
      { limit: '20', json: true },
      {
        ensureConfig: async () => ({
          knowledgeBasePath: '/tmp/kb',
          dbPath: '/tmp/x.db',
        }),
        search: (): SearchResult => ({ items: [], total: 0 }),
        stdoutIsTTY: false,
        writeOut: (chunk) => {
          out.push(chunk);
        },
      },
    );

    expect(JSON.parse(out.join(''))).toEqual({ items: [], total: 0 });
  });
});
