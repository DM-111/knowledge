import { describe, expect, it } from 'vitest';
import {
  ChunkRepository,
  KnowledgeItemRepository,
  createDatabaseProvider,
  initializeStorage,
} from './index.js';

describe('storage ingestion', () => {
  it('在同一事务中写入 knowledge_item、chunks 与 chunks_fts', () => {
    const provider = initializeStorage({ dbPath: ':memory:' });
    const knowledgeItemRepository = new KnowledgeItemRepository(provider);
    const chunkRepository = new ChunkRepository(provider);

    const knowledgeItemId = provider.transaction((db) => {
      const itemId = knowledgeItemRepository.create(
        {
          title: 'TypeScript 泛型',
          sourceType: 'local-markdown',
          sourcePath: '/tmp/article.md',
          content: '# TypeScript 泛型\n\n第一段内容。\n\n第二段内容。',
          wordCount: 20,
          createdAt: '2026-04-20T12:00:00.000Z',
        },
        db,
      );

      chunkRepository.createMany(
        itemId,
        [
          {
            chunkIndex: 0,
            content: '第一段内容。',
            startOffset: 10,
            endOffset: 16,
            overlapStartOffset: 0,
            overlapEndOffset: 0,
          },
          {
            chunkIndex: 1,
            content: '第一段内容。\n\n第二段内容。',
            startOffset: 20,
            endOffset: 26,
            overlapStartOffset: 10,
            overlapEndOffset: 16,
          },
        ],
        db,
      );

      return itemId;
    });

    expect(knowledgeItemId).toBe(1);

    const knowledgeItemRow = provider
      .getConnection()
      .prepare('SELECT title, source_type, source_path FROM knowledge_items WHERE id = ?')
      .get(knowledgeItemId) as
      | { title: string; source_type: string; source_path: string }
      | undefined;
    const chunkCountRow = provider
      .getConnection()
      .prepare('SELECT COUNT(*) AS count FROM chunks WHERE knowledge_item_id = ?')
      .get(knowledgeItemId) as { count: number };
    const ftsCountRow = provider
      .getConnection()
      .prepare('SELECT COUNT(*) AS count FROM chunks_fts')
      .get() as { count: number };

    expect(knowledgeItemRow).toEqual({
      title: 'TypeScript 泛型',
      source_type: 'local-markdown',
      source_path: '/tmp/article.md',
    });
    expect(chunkCountRow.count).toBe(2);
    expect(ftsCountRow.count).toBe(2);

    provider.close();
  });

  it('在索引步骤失败时回滚整个写入事务', () => {
    const provider = createDatabaseProvider(':memory:');
    const knowledgeItemRepository = new KnowledgeItemRepository(provider);
    const chunkRepository = new ChunkRepository(provider);
    provider.getConnection().exec(`
      CREATE TABLE knowledge_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_path TEXT NOT NULL UNIQUE,
        content TEXT NOT NULL,
        word_count INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        note TEXT
      );

      CREATE TABLE chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        knowledge_item_id INTEGER NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        start_offset INTEGER NOT NULL,
        end_offset INTEGER NOT NULL,
        overlap_start_offset INTEGER NOT NULL,
        overlap_end_offset INTEGER NOT NULL,
        FOREIGN KEY (knowledge_item_id) REFERENCES knowledge_items(id) ON DELETE CASCADE
      );
    `);

    expect(() =>
      provider.transaction((db) => {
        const itemId = knowledgeItemRepository.create(
          {
            title: 'Should Rollback',
            sourceType: 'local-markdown',
            sourcePath: '/tmp/rollback.md',
            content: '# Rollback\n\n正文内容。',
            wordCount: 10,
            createdAt: '2026-04-20T12:00:00.000Z',
          },
          db,
        );

        chunkRepository.createMany(
          itemId,
          [
            {
              chunkIndex: 0,
              content: '正文内容。',
              startOffset: 0,
              endOffset: 5,
              overlapStartOffset: 0,
              overlapEndOffset: 0,
            },
          ],
          db,
        );

        db.exec('INSERT INTO chunks_fts(rowid, content) VALUES (1, "broken")');
      }),
    ).toThrowError();

    const knowledgeItemCount = provider
      .getConnection()
      .prepare('SELECT COUNT(*) AS count FROM knowledge_items')
      .get() as { count: number };
    const chunkCount = provider
      .getConnection()
      .prepare('SELECT COUNT(*) AS count FROM chunks')
      .get() as { count: number };

    expect(knowledgeItemCount.count).toBe(0);
    expect(chunkCount.count).toBe(0);

    provider.close();
  });
});
