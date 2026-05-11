import { initializeStorage, KnowledgeItemRepository, TagRepository } from '../storage/index.js';
import type { ContentMetadata, SourceType } from '../core/types.js';

export interface IndexGeneratorOptions {
  dbPath: string;
}

interface IndexItem {
  id: number;
  title: string;
  sourceType: SourceType;
  sourcePath: string;
  wordCount: number;
  createdAt: string;
  note?: string;
  metadata?: ContentMetadata;
  tags: string[];
}

const SOURCE_TYPE_SECTIONS: Record<SourceType, { heading: string; label: string }> = {
  web: { heading: 'Articles', label: 'web' },
  epub: { heading: 'Books', label: 'epub' },
  pdf: { heading: 'Papers', label: 'pdf' },
  'local-markdown': { heading: 'Notes', label: 'markdown' },
};

/**
 * 生成 llms.txt 格式的知识库索引。
 * 按 sourceType 分组，包含标题、来源、作者、字数、标签。
 */
export function generateIndex(options: IndexGeneratorOptions): string {
  const items = loadAllItems(options.dbPath);

  if (items.length === 0) {
    return '# Knowledge Base\n\n> 知识库为空，还没有入库任何内容。\n';
  }

  // 按 sourceType 分组
  const groups = groupBySourceType(items);

  // 统计标签
  const tagCounts = countTags(items);

  // 组装 Markdown
  const lines: string[] = [];

  lines.push('# Knowledge Base');
  lines.push('');
  lines.push(`> 个人阅读知识库，共 ${items.length} 篇内容。`);
  lines.push('');

  // 按固定顺序输出各 section
  const sectionOrder: SourceType[] = ['web', 'epub', 'pdf', 'local-markdown'];
  for (const sourceType of sectionOrder) {
    const group = groups.get(sourceType);
    if (!group || group.length === 0) continue;

    const section = SOURCE_TYPE_SECTIONS[sourceType];
    lines.push(`## ${section.heading}`);
    lines.push('');

    for (const item of group) {
      lines.push(formatItem(item));
    }

    lines.push('');
  }

  // Tags section
  if (tagCounts.size > 0) {
    lines.push('## Tags');
    lines.push('');
    const tagEntries = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => `${tag}(${count})`);
    lines.push(tagEntries.join(', '));
    lines.push('');
  }

  return lines.join('\n');
}

function formatItem(item: IndexItem): string {
  const parts: string[] = [];

  // Title and link
  parts.push(`- [${item.title}](${item.sourcePath})`);

  // Description pieces
  const desc: string[] = [];
  if (item.metadata?.author) {
    desc.push(item.metadata.author);
  }
  if (item.metadata?.description) {
    // Truncate long descriptions
    const maxLen = 80;
    const d = item.metadata.description;
    desc.push(d.length > maxLen ? `${d.slice(0, maxLen)}...` : d);
  }
  desc.push(`${item.wordCount.toLocaleString()}字`);
  if (item.tags.length > 0) {
    desc.push(`标签: ${item.tags.join(', ')}`);
  }

  return `${parts[0]}: ${desc.join('。')}`;
}

function loadAllItems(dbPath: string): IndexItem[] {
  const provider = initializeStorage({ dbPath });
  try {
    const db = provider.getConnection();
    const rows = db
      .prepare(
        `
        SELECT
          id,
          title,
          source_type AS sourceType,
          source_path AS sourcePath,
          word_count AS wordCount,
          created_at AS createdAt,
          note,
          metadata_json AS metadataJson
        FROM knowledge_items
        ORDER BY created_at DESC, id DESC
        `,
      )
      .all() as Array<{
      id: number;
      title: string;
      sourceType: SourceType;
      sourcePath: string;
      wordCount: number;
      createdAt: string;
      note: string | null;
      metadataJson: string | null;
    }>;

    const tagRepo = new TagRepository(provider);
    const tagsByItemId = tagRepo.listTagsByKnowledgeItemIds(rows.map((r) => r.id));

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      sourceType: row.sourceType,
      sourcePath: row.sourcePath,
      wordCount: row.wordCount,
      createdAt: row.createdAt,
      note: row.note ?? undefined,
      metadata: row.metadataJson ? (JSON.parse(row.metadataJson) as ContentMetadata) : undefined,
      tags: tagsByItemId.get(row.id) ?? [],
    }));
  } finally {
    provider.close();
  }
}

function groupBySourceType(items: IndexItem[]): Map<SourceType, IndexItem[]> {
  const groups = new Map<SourceType, IndexItem[]>();
  for (const item of items) {
    const group = groups.get(item.sourceType) ?? [];
    group.push(item);
    groups.set(item.sourceType, group);
  }
  return groups;
}

function countTags(items: IndexItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const tag of item.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return counts;
}
