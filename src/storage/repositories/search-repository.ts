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

const SNIPPET_OPEN = '【';
const SNIPPET_CLOSE = '】';
const SNIPPET_ELLIPSIS = '…';
const SNIPPET_TOKEN = 20;

const SELECT_SQL_BM25 = `
  SELECT
    c.id AS chunkId,
    k.title AS title,
    k.source_path AS sourcePath,
    k.created_at AS createdAt,
    snippet(chunks_fts, 0, @snippetOpen, @snippetClose, @snippetEllipsis, @snippetToken) AS hitSnippet
  FROM chunks_fts
  INNER JOIN chunks c ON c.id = chunks_fts.rowid
  INNER JOIN knowledge_items k ON k.id = c.knowledge_item_id
  WHERE chunks_fts MATCH @ftsMatch
  ORDER BY bm25(chunks_fts) ASC
  LIMIT @limit
`.trim();

const SELECT_SQL_RANK = `
  SELECT
    c.id AS chunkId,
    k.title AS title,
    k.source_path AS sourcePath,
    k.created_at AS createdAt,
    snippet(chunks_fts, 0, @snippetOpen, @snippetClose, @snippetEllipsis, @snippetToken) AS hitSnippet
  FROM chunks_fts
  INNER JOIN chunks c ON c.id = chunks_fts.rowid
  INNER JOIN knowledge_items k ON k.id = c.knowledge_item_id
  WHERE chunks_fts MATCH @ftsMatch
  ORDER BY rank ASC
  LIMIT @limit
`.trim();

type SearchStatement = Database.Statement<unknown[] | Record<string, unknown>>;

export class SearchRepository {
  private searchStatement: SearchStatement | undefined;

  constructor(private readonly provider: DatabaseProvider) {}

  searchByFtsQuery(ftsMatchQuery: string, limit: number, db: Database.Database = this.provider.getConnection()): SearchRow[] {
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
    };

    const statement = (this.searchStatement ??= this.prepareSearchStatement(db));
    return statement.all(params) as SearchRow[];
  }

  private prepareSearchStatement(db: Database.Database): SearchStatement {
    for (const sql of [SELECT_SQL_BM25, SELECT_SQL_RANK]) {
      try {
        return db.prepare(sql);
      } catch {
        // 尝试下一种排序（bm25 不可用时回退为 rank；旧环境以 rank 为稳定相关度列）
        continue;
      }
    }
    throw new StorageError('无法编译全文检索 SQL（本环境可能不支持 FTS5 辅助函数）', {
      step: 'search',
      source: 'search-repository',
    });
  }
}
