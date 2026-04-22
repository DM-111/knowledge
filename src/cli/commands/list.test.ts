import { describe, expect, it, vi } from 'vitest';
import { SearchError } from '../../errors/index.js';
import { runListCommand, type RunListCommandDependencies } from './list.js';
import type { ListKnowledgeItemsResult } from '../../core/index.js';
import { formatKnowledgeList } from '../formatters/index.js';

describe('formatKnowledgeList', () => {
  it('无结果时输出稳定提示与总数', () => {
    expect(formatKnowledgeList({ items: [], total: 0 }, { mode: 'plain' })).toBe('未找到匹配条目\n共 0 条，当前展示 0 条\n');
  });

  it('plain 模式展示 ID、来源类型、标签与总数提示', () => {
    const text = formatKnowledgeList({
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
    }, { mode: 'plain' });

    expect(text).toContain('1. [7] TypeScript 泛型');
    expect(text).toContain('来源类型: local-markdown');
    expect(text).toContain('标签: guide, typescript');
    expect(text).toContain('入库时间: 2026-04-20T12:00:00.000Z');
    expect(text).toContain('共 2 条，当前展示 1 条');
    expect(text).not.toMatch(/\u001B\[[0-9;]*m/);
  });

  it('tty 模式本地化时间并带 ANSI 样式', () => {
    const text = formatKnowledgeList(
      {
        total: 1,
        items: [
          {
            id: 7,
            title: 'TypeScript 泛型',
            sourceType: 'local-markdown',
            tags: ['guide', 'typescript'],
            createdAt: '2026-04-20T12:00:00.000Z',
          },
        ],
      },
      { mode: 'tty' },
    );

    expect(text).toMatch(/\u001B\[[0-9;]*m/);
    expect(text).toContain('共 1 条，当前展示 1 条');
    expect(text).not.toContain('2026-04-20T12:00:00.000Z');
  });

  it('json 模式输出结构化结果', () => {
    const text = formatKnowledgeList(
      {
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
      },
      { mode: 'json' },
    );

    expect(JSON.parse(text)).toEqual({
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
        stdoutIsTTY: false,
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

  it('在 --json 模式输出 items/total 结构化结果', async () => {
    const out: string[] = [];
    await runListCommand(
      { json: true },
      {
        ensureConfig: async () => ({
          knowledgeBasePath: '/tmp/kb',
          dbPath: '/tmp/x.db',
        }),
        list: (): ListKnowledgeItemsResult => ({
          total: 2,
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
        stdoutIsTTY: true,
        writeOut: (chunk) => {
          out.push(chunk);
        },
      },
    );

    expect(JSON.parse(out.join(''))).toEqual({
      total: 2,
      items: [
        {
          id: 1,
          title: '标题',
          sourceType: 'local-markdown',
          tags: ['typescript'],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
  });
});
