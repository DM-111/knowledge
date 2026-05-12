import { SearchError } from '../../errors/index.js';
import type { JiebaTokenizer } from '../tokenizer/jieba-tokenizer.js';
import type { InMemorySynonymExpander } from '../tokenizer/synonym-expander.js';

/**
 * FTS5 查询构建选项
 */
export interface FtsMatchOptions {
  /** 用户原始查询 */
  raw: string;
  /** 分词器 */
  tokenizer: JiebaTokenizer;
  /** 同义词扩展器（可选） */
  synonymExpander?: InMemorySynonymExpander;
  /** 查询模式：and = 所有词必须出现，or = 任一词出现 */
  mode?: 'and' | 'or';
}

/**
 * FTS5 查询构建结果
 */
export interface FtsMatchResult {
  /** FTS5 MATCH 表达式 */
  matchExpr: string;
  /** 分词后的 tokens（用于下游判断） */
  tokens: string[];
}

/** FTS5 特殊字符 — 不允许出现在 token 中 */
const UNSUPPORTED_FTS_PATTERN = /["'():^+\-{}[\]]/u;

/**
 * 将用户查询构建为 FTS5 MATCH 表达式。
 *
 * 流程：
 * 1. jieba 分词 + 停用词过滤
 * 2. 同义词扩展（可选）
 * 3. 构建 `(term1* OR syn1*) AND (term2*)` 格式表达式
 */
export function buildFtsMatchQuery(options: FtsMatchOptions): FtsMatchResult {
  const { raw, tokenizer, synonymExpander, mode = 'and' } = options;

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new SearchError('请提供非空的检索关键词', {
      step: 'search',
      source: 'fts-match',
    });
  }

  // 分词（query-time 过滤停用词）
  const { tokens } = tokenizer.segmentQuery(trimmed);

  if (tokens.length === 0) {
    throw new SearchError('请提供非空的检索关键词', {
      step: 'search',
      source: 'fts-match',
    });
  }

  // 同义词扩展
  const expanded: string[][] = synonymExpander && !synonymExpander.empty
    ? synonymExpander.expand(tokens)
    : tokens.map((t) => [t]);

  // 构建 FTS5 MATCH 表达式
  const joiner = mode === 'and' ? ' AND ' : ' OR ';
  const groups = expanded.map((group) => buildGroupExpr(group));
  const matchExpr = groups.join(joiner);

  return { matchExpr, tokens };
}

/**
 * 兼容旧调用方式的简化版本（无分词/同义词，仅做空白拆分 + 前缀匹配）。
 * 用于不需要分词器的场景（如测试、notes FTS）。
 */
export function buildSimpleFtsMatchQuery(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new SearchError('请提供非空的检索关键词', {
      step: 'search',
      source: 'fts-match',
    });
  }

  const terms = tokenizeByWhitespace(trimmed);
  if (terms.length === 0) {
    throw new SearchError('请提供非空的检索关键词', {
      step: 'search',
      source: 'fts-match',
    });
  }

  return terms.map((term) => toPrefixToken(term)).join(' AND ');
}

/**
 * 为一组同义词生成 FTS5 表达式片段
 * 单词: `term*`
 * 多词: `(term1* OR term2* OR term3*)`
 */
function buildGroupExpr(group: string[]): string {
  const validTerms = group
    .map((t) => sanitizeToken(t))
    .filter((t) => t.length > 0);

  if (validTerms.length === 0) {
    return '';
  }

  if (validTerms.length === 1) {
    return toPrefixToken(validTerms[0]);
  }

  const orTerms = validTerms.map((t) => toPrefixToken(t)).join(' OR ');
  return `(${orTerms})`;
}

/**
 * 为 token 添加前缀通配符 `*`
 */
function toPrefixToken(term: string): string {
  return term.endsWith('*') ? term : `${term}*`;
}

/**
 * 清理 token 中的 FTS5 特殊字符
 */
function sanitizeToken(token: string): string {
  return token.replace(UNSUPPORTED_FTS_PATTERN, '').trim();
}

/**
 * 按空白分词（兼容旧行为）
 */
function tokenizeByWhitespace(input: string): string[] {
  return input
    .split(/\s+/u)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}
