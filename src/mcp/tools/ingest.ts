import { z } from 'zod';
import { ingestSource } from '../../core/ingestion/pipeline.js';
import { resolveDbPath } from '../resolve-db.js';

export const ingestToolSchema = {
  source: z.string().describe('要入库的来源：URL（如 https://example.com/article）或本地文件路径（如 /path/to/book.epub）'),
  tags: z.array(z.string()).optional().describe('标签列表，用于分类和过滤'),
  note: z.string().optional().describe('备注信息（可选）'),
};

export const ingestToolName = 'kb_ingest';
export const ingestToolDescription = '将新内容入库到知识库。支持 URL（网页文章）、epub/mobi（电子书）、pdf（论文/文档）和本地 Markdown 文件。入库后可通过 kb_search 检索。';

export async function ingestToolHandler(args: { source: string; tags?: string[]; note?: string }) {
  const { source, tags = [], note } = args;
  const dbPath = resolveDbPath();

  const result = await ingestSource({
    source,
    dbPath,
    tags,
    note,
    duplicateStrategy: 'skip',
  });

  const text = [
    `入库成功！`,
    ``,
    `- 标题: ${result.title}`,
    `- 来源: ${result.sourcePath}`,
    `- 字数: ${result.wordCount.toLocaleString()}`,
    `- 分块: ${result.chunkCount} chunks`,
    `- 标签: ${result.tags.length > 0 ? result.tags.join(', ') : '无'}`,
    result.metadata?.author ? `- 作者: ${result.metadata.author}` : '',
    result.note ? `- 备注: ${result.note}` : '',
  ].filter(Boolean).join('\n');

  return { content: [{ type: 'text' as const, text }] };
}
