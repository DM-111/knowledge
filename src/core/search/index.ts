import { SearchError } from '../../errors/index.js';
import { SearchRepository, type SearchRow, initializeStorage } from '../../storage/index.js';
import { buildFtsMatchQuery } from './fts-match.js';
import type { SearchByKeywordOptions, SearchHit } from './types.js';

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
 * 单一入口：对知识库做 FTS5 关键词检索，返回带父级元数据的命中列表；相关度与 limit 在仓储层单条 SQL 中完成
 */
export function searchByKeyword(options: SearchByKeywordOptions): SearchHit[] {
  const { query, limit, dbPath } = options;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new SearchError('limit 必须为正整数', { step: 'search', source: 'searchByKeyword' });
  }

  const matchString = buildFtsMatchQuery(query);
  const provider = initializeStorage({ dbPath });
  try {
    const repo = new SearchRepository(provider);
    const rows = repo.searchByFtsQuery(matchString, limit);
    return rows.map(mapRowToHit);
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
  } finally {
    provider.close();
  }
}

export { buildFtsMatchQuery } from './fts-match.js';
export type { SearchByKeywordOptions, SearchHit } from './types.js';
