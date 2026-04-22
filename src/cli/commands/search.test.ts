import { describe, expect, it, vi } from 'vitest';
import { runSearchCommand, formatSearchHitsText, type RunSearchCommandDependencies } from './search.js';
import { searchByKeyword, type SearchHit } from '../../core/index.js';
import { SearchError } from '../../errors/index.js';

describe('formatSearchHitsText', () => {
  it('无结果时输出稳定提示', () => {
    expect(formatSearchHitsText([])).toBe('未找到匹配结果\n');
  });

  it('有结果时多行展示字段', () => {
    const text = formatSearchHitsText([
      {
        title: 'T',
        sourcePath: '/a.md',
        hitSnippet: '【命中】',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    expect(text).toContain('1. T');
    expect(text).toContain('来源: /a.md');
    expect(text).toContain('摘要: 【命中】');
    expect(text).toContain('入库时间: 2026-01-01T00:00:00.000Z');
  });
});

describe('runSearchCommand', () => {
  it('无关键词时抛出 SearchError', async () => {
    await expect(
      runSearchCommand(
        undefined,
        { limit: '20' },
        {
          ensureConfig: async () => ({
            knowledgeBasePath: '/tmp/kb',
            dbPath: '/tmp/kb/db.sqlite',
          }),
        } as RunSearchCommandDependencies,
      ),
    ).rejects.toThrow(SearchError);
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
    const search = vi.fn((): ReturnType<typeof searchByKeyword> => [hit]);

    await runSearchCommand('词', { limit: '5' } as { limit: string }, {
      ensureConfig: async () => ({
        knowledgeBasePath: '/tmp/kb',
        dbPath: '/tmp/x.db',
      }),
      search,
      writeOut: (c) => {
        out.push(c);
      },
    });

    expect(search).toHaveBeenCalledWith({ query: '词', limit: 5, dbPath: '/tmp/x.db' });
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
      search: () => [],
      writeOut: (c) => {
        out.push(c);
      },
    });
    expect(out.join('')).toBe('未找到匹配结果\n');
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
});
