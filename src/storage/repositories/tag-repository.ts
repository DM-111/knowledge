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

  listTagsByKnowledgeItemIds(
    knowledgeItemIds: readonly number[],
    db: Database.Database = this.provider.getConnection(),
  ): Map<number, string[]> {
    const tagsByItemId = new Map<number, string[]>();
    if (knowledgeItemIds.length === 0) {
      return tagsByItemId;
    }
    if (knowledgeItemIds.length > 999) {
      throw new StorageError('知识条目 ID 列表超过 SQLite 参数上限（最多 999 条）', {
        step: 'list-tags',
        source: 'tag-repository',
      });
    }

    const placeholders = knowledgeItemIds.map(() => '?').join(', ');
    const rows = db
      .prepare(
        `
          SELECT
            it.knowledge_item_id,
            t.name
          FROM item_tags it
          INNER JOIN tags t ON t.id = it.tag_id
          WHERE it.knowledge_item_id IN (${placeholders})
          ORDER BY t.name ASC, t.id ASC
        `,
      )
      .all(...knowledgeItemIds) as Array<{
      knowledge_item_id: number;
      name: string;
    }>;

    for (const row of rows) {
      const itemTags = tagsByItemId.get(row.knowledge_item_id) ?? [];
      itemTags.push(row.name);
      tagsByItemId.set(row.knowledge_item_id, itemTags);
    }

    return tagsByItemId;
  }
}

function normalizeTagNames(tagNames: readonly string[]): string[] {
  return [...new Set(tagNames.map((tagName) => tagName.trim()).filter((tagName) => tagName.length > 0))];
}
