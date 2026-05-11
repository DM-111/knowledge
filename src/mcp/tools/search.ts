import { z } from 'zod';
import { searchByKeyword } from '../../core/search/index.js';
import { resolveDbPath } from '../resolve-db.js';

export const searchToolSchema = {
  query: z.string().describe('搜索关键词（支持多词，空格分隔）'),
  limit: z.number().optional().default(10).describe('最多返回条数，默认 10'),
  tag: z.string().optional().describe('按标签过滤（精确匹配）'),
  source: z.string().optional().describe('按来源类型过滤: web, epub, pdf, local-markdown'),
};

export const searchToolName = 'kb_search';
export const searchToolDescription = '在知识库中全文检索。返回匹配的文本片段（含高亮）、来源标题和路径。适合回答"我之前读过什么关于 X 的内容"类问题。';

export async function searchToolHandler(args: { query: string; limit?: number; tag?: string; source?: string }) {
  const { query, limit = 10, tag, source } = args;
  const dbPath = resolveDbPath();

  const result = searchByKeyword({
    query,
    limit,
    dbPath,
    tag,
    source,
  });

  const text = result.items.length === 0
    ? `未找到与"${query}"相关的内容。`
    : [
        `找到 ${result.total} 条结果（展示前 ${result.items.length} 条）：\n`,
        ...result.items.map((hit, i) =>
          `${i + 1}. **${hit.title}**\n   来源: ${hit.sourcePath}\n   摘要: ${hit.hitSnippet}\n`
        ),
      ].join('\n');

  return { content: [{ type: 'text' as const, text }] };
}
