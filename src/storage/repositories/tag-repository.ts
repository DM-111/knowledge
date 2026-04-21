import type Database from 'better-sqlite3';
import { StorageError } from '../../errors/index.js';
import type { DatabaseProvider } from '../provider.js';

export class TagRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  ensureTagIds(tagNames: readonly string[], db: Database.Database = this.provider.getConnection()): number[] {
    const normalizedNames = normalizeTagNames(tagNames);
    if (normalizedNames.length === 0) {
      return [];
    }

    const insertStatement = db.prepare(
      `
        INSERT INTO tags (name)
        VALUES (?)
        ON CONFLICT(name) DO NOTHING
      `,
    );
    const selectStatement = db.prepare('SELECT id FROM tags WHERE name = ?');

    return normalizedNames.map((tagName) => {
      insertStatement.run(tagName);
      const row = selectStatement.get(tagName) as { id?: number } | undefined;

      if (!row?.id) {
        throw new StorageError('无法创建或读取标签记录', {
          step: 'ensure-tag',
          source: tagName,
        });
      }

      return row.id;
    });
  }

  linkTagsToItem(
    knowledgeItemId: number,
    tagIds: readonly number[],
    db: Database.Database = this.provider.getConnection(),
  ): void {
    if (tagIds.length === 0) {
      return;
    }

    const statement = db.prepare(
      `
        INSERT OR IGNORE INTO item_tags (knowledge_item_id, tag_id)
        VALUES (?, ?)
      `,
    );

    for (const tagId of tagIds) {
      statement.run(knowledgeItemId, tagId);
    }
  }
}

function normalizeTagNames(tagNames: readonly string[]): string[] {
  return [...new Set(tagNames.map((tagName) => tagName.trim()).filter((tagName) => tagName.length > 0))];
}
