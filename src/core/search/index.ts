import { SearchError } from '../../errors/index.js';
import {
  KnowledgeItemRepository,
  SearchRepository,
  TagRepository,
  type SearchRow,
  initializeStorage,
} from '../../storage/index.js';
import { getTokenizerSync, getSynonymExpander } from '../tokenizer/index.js';
import { normalizeSearchFilters } from './filters.js';
import { buildFtsMatchQuery, buildSimpleFtsMatchQuery } from './fts-match.js';
import type {
  KnowledgeListItem,
  ListKnowledgeItemsOptions,
  ListKnowledgeItemsResult,
  SearchByKeywordOptions,
  SearchHit,
  SearchResult,
} from './types.js';

function mapRowToHit(row: SearchRow): SearchHit {
  return {
    chunkId: row.chunkId,
    title: row.title,
    sourcePath: row.sourcePath,
    createdAt: row.createdAt,
    hitSnippet: row.hitSnippet,
  };
}

function isSqliteMatchFailure(error: unknown): boolean {
  if (error == null || typeof error !== 'object') {
    return false;
  }
  const e = error as { code?: string; message?: string };
  if (e.code !== 'SQLITE_ERROR' && e.code !== 'SQLITE_MISMATCH') {
    return false;
  }
  return typeof e.message === 'string' && /fts5|FTS5|malformed|syntax|query|not supported|MATCH|tokenize|fts/i.test(e.message);
}

/**
 * 对知识库做 FTS5 关键词检索。
 *
 * 策略：
 * 1. 使用 jieba 分词 + 同义词扩展构建 AND 查询
 * 2. 若 AND 查询零结果且 token 数 > 1，自动 fallback 到 OR 查询
 */
export function searchByKeyword(options: SearchByKeywordOptions): SearchResult {
  const { query, limit, dbPath } = options;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new SearchError('limit 必须为正整数', { step: 'search', source: 'searchByKeyword' });
  }

  const tokenizer = getTokenizerSync();
  const synonymExpander = getSynonymExpander();
  const filters = normalizeSearchFilters(options, 'searchByKeyword');

  const queryOptions = {
    limit,
    tag: filters.tag,
    source: filters.source,
    createdAfter: filters.createdAfter,
    createdBefore: filters.createdBefore,
  };

  // 构建 AND 查询
  const andResult = buildFtsMatchQuery({
    raw: query,
    tokenizer,
    synonymExpander,
    mode: 'and',
  });

  const provider = initializeStorage({ dbPath });
  try {
    const repo = new SearchRepository(provider);

    // 尝试 AND 查询
    const rows = executeSearch(repo, andResult.matchExpr, queryOptions);
    const total = executeCount(repo, andResult.matchExpr, queryOptions);

    if (total > 0) {
      return {
        items: rows.map(mapRowToHit),
        total,
      };
    }

    // AND 零结果 + 多 token → OR fallback
    if (andResult.tokens.length > 1) {
      const orResult = buildFtsMatchQuery({
        raw: query,
        tokenizer,
        synonymExpander,
        mode: 'or',
      });

      const orRows = executeSearch(repo, orResult.matchExpr, queryOptions);
      const orTotal = executeCount(repo, orResult.matchExpr, queryOptions);

      if (orTotal > 0) {
        return {
          items: orRows.map(mapRowToHit),
          total: orTotal,
          isFallback: true,
        };
      }
    }

    return { items: [], total: 0 };
  } finally {
    provider.close();
  }
}

function executeSearch(
  repo: SearchRepository,
  matchExpr: string,
  queryOptions: { limit: number; tag?: string; source?: string; createdAfter?: string; createdBefore?: string },
): SearchRow[] {
  try {
    return repo.searchByFtsQuery(matchExpr, queryOptions);
  } catch (error) {
    if (error instanceof SearchError) {
      throw error;
    }
    if (isSqliteMatchFailure(error) || isSqliteMatchFailure((error as { cause?: unknown })?.cause)) {
      throw new SearchError('检索式无法被全文索引解析，请换用更简单的关键词', {
        step: 'search',
        source: 'searchByKeyword',
        cause: error,
      });
    }
    throw error;
  }
}

function executeCount(
  repo: SearchRepository,
  matchExpr: string,
  queryOptions: { tag?: string; source?: string; createdAfter?: string; createdBefore?: string },
): number {
  try {
    return repo.countByFtsQuery(matchExpr, queryOptions);
  } catch (error) {
    if (isSqliteMatchFailure(error) || isSqliteMatchFailure((error as { cause?: unknown })?.cause)) {
      return 0;
    }
    throw error;
  }
}

export function listKnowledgeItems(options: ListKnowledgeItemsOptions): ListKnowledgeItemsResult {
  const { dbPath, limit } = options;
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new SearchError('limit 必须为正整数', {
      step: 'list',
      source: 'listKnowledgeItems',
    });
  }

  const filters = normalizeSearchFilters(options, 'listKnowledgeItems');
  const provider = initializeStorage({ dbPath });
  try {
    const knowledgeItemRepository = new KnowledgeItemRepository(provider);
    const tagRepository = new TagRepository(provider);
    const rows = knowledgeItemRepository.list({
      limit,
      tag: filters.tag,
      source: filters.source,
      createdAfter: filters.createdAfter,
      createdBefore: filters.createdBefore,
    });
    const total = knowledgeItemRepository.count({
      tag: filters.tag,
      source: filters.source,
      createdAfter: filters.createdAfter,
      createdBefore: filters.createdBefore,
    });
    const tagsByItemId = tagRepository.listTagsByKnowledgeItemIds(rows.map((row) => row.id));

    return {
      items: rows.map((row): KnowledgeListItem => ({
        id: row.id,
        title: row.title,
        sourceType: row.sourceType,
        tags: tagsByItemId.get(row.id) ?? [],
        createdAt: row.createdAt,
      })),
      total,
    };
  } finally {
    provider.close();
  }
}

export { buildFtsMatchQuery, buildSimpleFtsMatchQuery } from './fts-match.js';
export type { FtsMatchOptions, FtsMatchResult } from './fts-match.js';
export type {
  SearchByKeywordOptions,
  SearchHit,
  SearchResult,
  SearchFilterOptions,
  ListKnowledgeItemsOptions,
  KnowledgeListItem,
  ListKnowledgeItemsResult,
} from './types.js';
export { hybridSearch, type HybridSearchOptions, type HybridSearchResult, type HybridSearchMode } from './hybrid-search.js';
