import type Database from 'better-sqlite3';
import type { DatabaseProvider } from '../provider.js';

export interface CreateKnowledgeItemInput {
  title: string;
  sourceType: string;
  sourcePath: string;
  content: string;
  wordCount: number;
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
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `,
      )
      .run(input.title, input.sourceType, input.sourcePath, input.content, input.wordCount, input.createdAt);

    return Number(result.lastInsertRowid);
  }
}
