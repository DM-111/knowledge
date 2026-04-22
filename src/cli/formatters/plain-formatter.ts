import type { ListKnowledgeItemsResult, SearchResult } from '../../core/index.js';

export function formatSearchResultPlain(result: SearchResult): string {
  if (result.items.length === 0) {
    return '未找到匹配结果\n共 0 条，当前展示 0 条\n';
  }

  const parts: string[] = [];
  result.items.forEach((row, index) => {
    parts.push(`${index + 1}. ${row.title}`);
    parts.push(`   来源: ${row.sourcePath}`);
    parts.push(`   摘要: ${row.hitSnippet}`);
    parts.push(`   入库时间: ${row.createdAt}`);
  });
  parts.push(`共 ${result.total} 条，当前展示 ${result.items.length} 条`);
  parts.push('');
  return parts.join('\n');
}

export function formatKnowledgeListPlain(result: ListKnowledgeItemsResult): string {
  if (result.items.length === 0) {
    return '未找到匹配条目\n共 0 条，当前展示 0 条\n';
  }

  const parts: string[] = [];
  result.items.forEach((item, index) => {
    parts.push(`${index + 1}. [${item.id}] ${item.title}`);
    parts.push(`   来源类型: ${item.sourceType}`);
    parts.push(`   标签: ${item.tags.length > 0 ? item.tags.join(', ') : '-'}`);
    parts.push(`   入库时间: ${item.createdAt}`);
  });
  parts.push(`共 ${result.total} 条，当前展示 ${result.items.length} 条`);
  parts.push('');
  return parts.join('\n');
}
