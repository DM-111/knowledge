import type Database from 'better-sqlite3';
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
}
