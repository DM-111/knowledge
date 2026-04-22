import type { ListKnowledgeItemsResult, SearchResult } from '../../core/index.js';

export interface SearchTtyFormatterOptions {
  query: string;
}

const ANSI = {
  reset: '\u001B[0m',
  bold: '\u001B[1m',
  dim: '\u001B[2m',
  cyan: '\u001B[36m',
  green: '\u001B[32m',
  yellow: '\u001B[33m',
  magenta: '\u001B[35m',
};

const SEARCH_SNIPPET_MAX_LENGTH = 72;

export function formatSearchResultTty(result: SearchResult, options: SearchTtyFormatterOptions): string {
  if (result.items.length === 0) {
    return `${style('未找到匹配结果', ANSI.yellow)}\n`;
  }

  const parts: string[] = [];
  result.items.forEach((item, index) => {
    parts.push(style(`${index + 1}. ${highlightKeywords(item.title, options.query)}`, ANSI.bold, ANSI.cyan));
    parts.push(`   来源: ${style(item.sourcePath, ANSI.dim)}`);
    parts.push(`   摘要: ${highlightKeywords(truncate(item.hitSnippet, SEARCH_SNIPPET_MAX_LENGTH), options.query)}`);
    parts.push(`   入库时间: ${style(formatLocalDate(item.createdAt), ANSI.magenta)}`);
  });
  parts.push(style(`共 ${result.total} 条，当前展示 ${result.items.length} 条`, ANSI.dim));
  parts.push('');
  return parts.join('\n');
}

export function formatKnowledgeListTty(result: ListKnowledgeItemsResult): string {
  if (result.items.length === 0) {
    return `${style('未找到匹配条目', ANSI.yellow)}\n${style('共 0 条，当前展示 0 条', ANSI.dim)}\n`;
  }

  const parts: string[] = [];
  result.items.forEach((item, index) => {
    parts.push(style(`${index + 1}. [${item.id}] ${item.title}`, ANSI.bold, ANSI.cyan));
    parts.push(`   来源类型: ${style(item.sourceType, ANSI.green)}`);
    parts.push(`   标签: ${style(item.tags.length > 0 ? item.tags.join(', ') : '-', ANSI.yellow)}`);
    parts.push(`   入库时间: ${style(formatLocalDate(item.createdAt), ANSI.magenta)}`);
  });
  parts.push(style(`共 ${result.total} 条，当前展示 ${result.items.length} 条`, ANSI.dim));
  parts.push('');
  return parts.join('\n');
}

function style(text: string, ...codes: string[]): string {
  return `${codes.join('')}${text}${ANSI.reset}`;
}

function formatLocalDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function highlightKeywords(text: string, query: string): string {
  if (!query || !query.trim()) {
    return text;
  }

  const tokens = Array.from(
    new Set(
      query
        .trim()
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean),
    ),
  );

  if (tokens.length === 0) {
    return text;
  }

  const pattern = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'gi');
  return text.replace(pattern, (_, token: string) => style(token, ANSI.bold, ANSI.yellow));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
