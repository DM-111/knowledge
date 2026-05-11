import { z } from 'zod';
import { listKnowledgeItems } from '../../core/search/index.js';
import { resolveDbPath } from '../resolve-db.js';

export const listToolSchema = {
  limit: z.number().optional().default(50).describe('最多返回条数，默认 50'),
  tag: z.string().optional().describe('按标签过滤（精确匹配）'),
  source: z.string().optional().describe('按来源类型过滤: web, epub, pdf, local-markdown'),
};

export const listToolName = 'kb_list';
export const listToolDescription = '列出知识库中已入库的所有条目。返回标题、来源类型、标签和入库时间。适合了解知识库里有什么内容。';

export async function listToolHandler(args: { limit?: number; tag?: string; source?: string }) {
  const { limit = 50, tag, source } = args;
  const dbPath = resolveDbPath();

  const result = listKnowledgeItems({
    dbPath,
    limit,
    tag,
    source,
  });

  const text = result.items.length === 0
    ? '知识库为空，还没有入库任何内容。'
    : [
        `知识库共 ${result.total} 条（展示 ${result.items.length} 条）：\n`,
        ...result.items.map((item, i) =>
          `${i + 1}. [${item.id}] **${item.title}**\n   类型: ${item.sourceType} | 标签: ${item.tags.length > 0 ? item.tags.join(', ') : '无'} | 入库: ${item.createdAt}`
        ),
      ].join('\n');

  return { content: [{ type: 'text' as const, text }] };
}
