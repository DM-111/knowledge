import { describe, expect, it } from 'vitest';
import { initializeStorage } from '../index.js';
import { KnowledgeItemRepository } from './knowledge-item-repository.js';
import { ChunkRepository } from './chunk-repository.js';

describe('storage repositories', () => {
  it('支持在 knowledge_item 上写入可选备注', () => {
    const provider = initializeStorage({ dbPath: ':memory:' });
    const knowledgeItemRepository = new KnowledgeItemRepository(provider);

    const knowledgeItemId = knowledgeItemRepository.create({
      title: '带备注的文章',
      sourceType: 'local-markdown',
      sourcePath: '/tmp/noted-article.md',
      content: '# 带备注的文章\n\n正文。',
      wordCount: 8,
      createdAt: '2026-04-21T00:00:00.000Z',
      note: '关于泛型的总结',
    });

    const itemRow = provider
      .getConnection()
      .prepare('SELECT title, note FROM knowledge_items WHERE id = ?')
      .get(knowledgeItemId) as
      | {
          title: string;
          note: string | null;
        }
      | undefined;

    expect(itemRow).toEqual({
      title: '带备注的文章',
      note: '关于泛型的总结',
    });

    provider.close();
  });

  it('在同一事务中写入 knowledge_item、chunks 与 chunks_fts', () => {
    const provider = initializeStorage({ dbPath: ':memory:' });
    const knowledgeItemRepository = new KnowledgeItemRepository(provider);
    const chunkRepository = new ChunkRepository(provider);

    const knowledgeItemId = provider.transaction((db) => {
      const itemId = knowledgeItemRepository.create(
        {
          title: '文章标题',
          sourceType: 'local-markdown',
          sourcePath: '/tmp/article.md',
          content: '# 文章标题\n\n第一段内容。',
          wordCount: 10,
          createdAt: '2026-04-21T00:00:00.000Z',
        },
        db,
      );

      chunkRepository.createMany(
        itemId,
        [
          {
            chunkIndex: 0,
            content: '第一段内容。',
            startOffset: 0,
            endOffset: 6,
            overlapStartOffset: 0,
            overlapEndOffset: 0,
          },
        ],
        db,
      );

      return itemId;
    });

    const itemRow = provider
      .getConnection()
      .prepare('SELECT title, source_type, source_path FROM knowledge_items WHERE id = ?')
      .get(knowledgeItemId) as
      | {
          title: string;
          source_type: string;
          source_path: string;
        }
      | undefined;
    const chunkRow = provider
      .getConnection()
      .prepare(
        'SELECT knowledge_item_id, chunk_index, content, start_offset, end_offset FROM chunks WHERE knowledge_item_id = ?',
      )
      .get(knowledgeItemId) as
      | {
          knowledge_item_id: number;
          chunk_index: number;
          content: string;
          start_offset: number;
          end_offset: number;
        }
      | undefined;
    const ftsRow = provider
      .getConnection()
      .prepare('SELECT rowid, content FROM chunks_fts WHERE chunks_fts MATCH ?')
      .get('第一段*') as
      | {
          rowid: number;
          content: string;
        }
      | undefined;

    expect(itemRow).toEqual({
      title: '文章标题',
      source_type: 'local-markdown',
      source_path: '/tmp/article.md',
    });
    expect(chunkRow).toEqual({
      knowledge_item_id: knowledgeItemId,
      chunk_index: 0,
      content: '第一段内容。',
      start_offset: 0,
      end_offset: 6,
    });
    expect(ftsRow).toEqual({
      rowid: expect.any(Number),
      content: '第一段内容。',
    });

    provider.close();
  });
});
