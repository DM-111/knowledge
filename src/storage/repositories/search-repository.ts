import type Database from 'better-sqlite3';
import { StorageError } from '../../errors/index.js';
import type { DatabaseProvider } from '../provider.js';

export interface SearchRow {
  chunkId: number;
  title: string;
  sourcePath: string;
  createdAt: string;
  hitSnippet: string;
}

export interface SearchQueryOptions {
  limit: number;
  tag?: string;
  source?: string;
  createdAfter?: string;
  createdBefore?: string;
}

const SNIPPET_OPEN = '【';
const SNIPPET_CLOSE = '】';
const SNIPPET_ELLIPSIS = '…';
const SNIPPET_TOKEN = 20;

type SearchStatement = Database.Statement<unknown[] | Record<string, unknown>>;

export class SearchRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  searchByFtsQuery(
    ftsMatchQuery: string,
    options: SearchQueryOptions,
    db: Database.Database = this.provider.getConnection(),
  ): SearchRow[] {
    const { limit } = options;
    if (!Number.isInteger(limit) || limit < 1) {
      throw new StorageError('search limit 必须为正整数', {
        step: 'search',
        source: 'search-repository',
      });
    }

    const params = {
      ftsMatch: ftsMatchQuery,
      limit,
      snippetOpen: SNIPPET_OPEN,
      snippetClose: SNIPPET_CLOSE,
      snippetEllipsis: SNIPPET_ELLIPSIS,
      snippetToken: SNIPPET_TOKEN,
      source: options.source,
      tag: options.tag,
      createdAfter: options.createdAfter,
      createdBefore: options.createdBefore,
    };

    const statement = this.prepareSearchStatement(db, options);
    return statement.all(params) as SearchRow[];
  }

  countByFtsQuery(
    ftsMatchQuery: string,
    options: Omit<SearchQueryOptions, 'limit'>,
    db: Database.Database = this.provider.getConnection(),
  ): number {
    const params = {
      ftsMatch: ftsMatchQuery,
      source: options.source,
      tag: options.tag,
      createdAfter: options.createdAfter,
      createdBefore: options.createdBefore,
    };
    const statement = this.prepareCountStatement(db, options);
    const row = statement.get(params) as { total?: number } | undefined;
    return row?.total ?? 0;
  }

  private prepareSearchStatement(db: Database.Database, options: SearchQueryOptions): SearchStatement {
    const whereClauses = buildWhereClauses(options);

    const selectSqlByBm25 = buildSearchSql(whereClauses, 'bm25(chunks_fts) ASC');
    const selectSqlByRank = buildSearchSql(whereClauses, 'rank ASC');

    let firstError: unknown;
    for (const sql of [selectSqlByBm25, selectSqlByRank]) {
      try {
        return db.prepare(sql);
      } catch (err) {
        firstError ??= err;
      }
    }
    throw new StorageError('无法编译全文检索 SQL（本环境可能不支持 FTS5 辅助函数）', {
      step: 'search',
      source: 'search-repository',
      cause: firstError,
    });
  }

  private prepareCountStatement(
    db: Database.Database,
    options: Omit<SearchQueryOptions, 'limit'>,
  ): SearchStatement {
    return db.prepare(buildCountSql(buildWhereClauses(options)));
  }
}

function buildWhereClauses(options: Omit<SearchQueryOptions, 'limit'>): string[] {
  const whereClauses = ['chunks_fts MATCH @ftsMatch'];
  if (options.source) {
    whereClauses.push('k.source_type = @source');
  }
  if (options.createdAfter) {
    whereClauses.push('k.created_at >= @createdAfter');
  }
  if (options.createdBefore) {
    whereClauses.push('k.created_at <= @createdBefore');
  }
  if (options.tag) {
    whereClauses.push(`
      EXISTS (
        SELECT 1
        FROM item_tags it
        INNER JOIN tags t ON t.id = it.tag_id
        WHERE it.knowledge_item_id = k.id
          AND t.name = @tag
      )
    `.trim());
  }
  return whereClauses;
}

function buildSearchSql(whereClauses: string[], orderBy: string): string {
  return `
    SELECT
      c.id AS chunkId,
      k.title AS title,
      k.source_path AS sourcePath,
      k.created_at AS createdAt,
      snippet(chunks_fts, 0, @snippetOpen, @snippetClose, @snippetEllipsis, @snippetToken) AS hitSnippet
    FROM chunks_fts
    INNER JOIN chunks c ON c.id = chunks_fts.rowid
    INNER JOIN knowledge_items k ON k.id = c.knowledge_item_id
    WHERE ${whereClauses.join('\n      AND ')}
    ORDER BY ${orderBy}
    LIMIT @limit
  `.trim();
}

function buildCountSql(whereClauses: string[]): string {
  return `
    SELECT COUNT(*) AS total
    FROM chunks_fts
    INNER JOIN chunks c ON c.id = chunks_fts.rowid
    INNER JOIN knowledge_items k ON k.id = c.knowledge_item_id
    WHERE ${whereClauses.join('\n      AND ')}
  `.trim();
}
