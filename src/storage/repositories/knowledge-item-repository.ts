import type Database from 'better-sqlite3';
import { StorageError } from '../../errors/index.js';
import type { DatabaseProvider } from '../provider.js';

export interface CreateKnowledgeItemInput {
  title: string;
  sourceType: string;
  sourcePath: string;
  content: string;
  wordCount: number;
  createdAt: string;
  note?: string;
}

export interface KnowledgeItemSummary {
  id: number;
  title: string;
  sourceType: string;
  sourcePath: string;
  createdAt: string;
  note?: string;
}

export interface ListKnowledgeItemsQueryOptions {
  limit?: number;
  tag?: string;
  source?: string;
  createdAfter?: string;
  createdBefore?: string;
}

export interface KnowledgeItemListRow {
  id: number;
  title: string;
  sourceType: string;
  createdAt: string;
}

export class KnowledgeItemRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  create(input: CreateKnowledgeItemInput, db: Database.Database = this.provider.getConnection()): number {
    const result = db
      .prepare(
        `
          INSERT INTO knowledge_items (
            title,
            source_type,
            source_path,
            content,
            word_count,
            created_at,
            note
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        input.title,
        input.sourceType,
        input.sourcePath,
        input.content,
        input.wordCount,
        input.createdAt,
        input.note ?? null,
      );

    return Number(result.lastInsertRowid);
  }

  findBySource(
    sourceType: string,
    sourcePath: string,
    db: Database.Database = this.provider.getConnection(),
  ): KnowledgeItemSummary | undefined {
    const row = db
      .prepare(
        `
          SELECT
            id,
            title,
            source_type,
            source_path,
            created_at,
            note
          FROM knowledge_items
          WHERE source_type = ? AND source_path = ?
        `,
      )
      .get(sourceType, sourcePath) as
      | {
          id: number;
          title: string;
          source_type: string;
          source_path: string;
          created_at: string;
          note: string | null;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      title: row.title,
      sourceType: row.source_type,
      sourcePath: row.source_path,
      createdAt: row.created_at,
      note: row.note ?? undefined,
    };
  }

  deleteById(knowledgeItemId: number, db: Database.Database = this.provider.getConnection()): void {
    db.prepare('DELETE FROM knowledge_items WHERE id = ?').run(knowledgeItemId);
  }

  list(
    options: ListKnowledgeItemsQueryOptions,
    db: Database.Database = this.provider.getConnection(),
  ): KnowledgeItemListRow[] {
    if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1)) {
      throw new StorageError('list limit 必须为正整数', {
        step: 'list',
        source: 'knowledge-item-repository',
      });
    }

    const { whereSql, params } = buildListFilters(options);
    const limitSql = options.limit === undefined ? '' : '\nLIMIT @limit';

    return db
      .prepare(
        `
          SELECT
            k.id AS id,
            k.title AS title,
            k.source_type AS sourceType,
            k.created_at AS createdAt
          FROM knowledge_items k
          ${whereSql}
          ORDER BY k.created_at DESC, k.id DESC${limitSql}
        `,
      )
      .all(
        options.limit !== undefined ? { ...params, limit: options.limit } : params,
      ) as KnowledgeItemListRow[];
  }

  count(options: ListKnowledgeItemsQueryOptions, db: Database.Database = this.provider.getConnection()): number {
    const { whereSql, params } = buildListFilters(options);
    const row = db
      .prepare(
        `
          SELECT COUNT(*) AS count
          FROM knowledge_items k
          ${whereSql}
        `,
      )
      .get(params) as { count: number };

    return row.count;
  }
}

function buildListFilters(options: ListKnowledgeItemsQueryOptions): {
  whereSql: string;
  params: Record<string, string | undefined>;
} {
  const whereClauses: string[] = [];
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

  return {
    whereSql: whereClauses.length === 0 ? '' : `WHERE ${whereClauses.join('\n  AND ')}`,
    params: {
      source: options.source,
      tag: options.tag,
      createdAfter: options.createdAfter,
      createdBefore: options.createdBefore,
    },
  };
}
