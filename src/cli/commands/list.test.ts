import { describe, expect, it, vi } from 'vitest';
import { SearchError } from '../../errors/index.js';
import { formatKnowledgeListText, runListCommand, type RunListCommandDependencies } from './list.js';
import type { ListKnowledgeItemsResult } from '../../core/index.js';

describe('formatKnowledgeListText', () => {
  it('无结果时输出稳定提示与总数', () => {
    expect(formatKnowledgeListText({ items: [], total: 0 })).toBe('未找到匹配条目\n共 0 条，当前展示 0 条\n');
  });

  it('有结果时展示 ID、来源类型、标签与总数提示', () => {
    const text = formatKnowledgeListText({
      total: 2,
      items: [
        {
          id: 7,
          title: 'TypeScript 泛型',
          sourceType: 'local-markdown',
          tags: ['guide', 'typescript'],
          createdAt: '2026-04-20T12:00:00.000Z',
        },
      ],
    });

    expect(text).toContain('1. [7] TypeScript 泛型');
    expect(text).toContain('来源类型: local-markdown');
    expect(text).toContain('标签: guide, typescript');
    expect(text).toContain('入库时间: 2026-04-20T12:00:00.000Z');
    expect(text).toContain('共 2 条，当前展示 1 条');
  });
});

describe('runListCommand', () => {
  it('将过滤参数与 limit 传给核心层', async () => {
    const out: string[] = [];
    const list = vi.fn(
      (): ListKnowledgeItemsResult => ({
        total: 1,
        items: [
          {
            id: 1,
            title: '标题',
            sourceType: 'local-markdown',
            tags: ['typescript'],
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    );

    await runListCommand(
      {
        limit: '5',
        tag: 'typescript',
        source: 'local-markdown',
      } as {
        limit: string;
        tag: string;
        source: string;
      },
      {
        ensureConfig: async () => ({
          knowledgeBasePath: '/tmp/kb',
          dbPath: '/tmp/x.db',
        }),
        list,
        writeOut: (chunk) => {
          out.push(chunk);
        },
      },
    );

    expect(list).toHaveBeenCalledWith({
      dbPath: '/tmp/x.db',
      limit: 5,
      tag: 'typescript',
      source: 'local-markdown',
      after: undefined,
      before: undefined,
    });
    expect(out.join('')).toContain('标题');
  });

  it('在 --limit 非法时抛出 SearchError', async () => {
    await expect(
      runListCommand(
        { limit: '0' } as { limit: string },
        {
          ensureConfig: async () => ({
            knowledgeBasePath: '/tmp/kb',
            dbPath: '/tmp/x.db',
          }),
        } as RunListCommandDependencies,
      ),
    ).rejects.toThrow(SearchError);
  });
});
