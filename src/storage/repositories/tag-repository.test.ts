import { describe, expect, it } from 'vitest';
import { initializeStorage } from '../index.js';
import { TagRepository } from './tag-repository.js';
import { KnowledgeItemRepository } from './knowledge-item-repository.js';

describe('tag repository', () => {
  it('为不存在的标签自动创建记录并去重返回 id', () => {
    const provider = initializeStorage({ dbPath: ':memory:' });
    const repository = new TagRepository(provider);

    const tagIds = provider.transaction((db) =>
      repository.ensureTagIds(['typescript', '学习笔记', 'typescript'], db),
    );

    const tagRows = provider
      .getConnection()
      .prepare('SELECT id, name FROM tags ORDER BY id')
      .all() as Array<{ id: number; name: string }>;

    expect(tagIds).toHaveLength(2);
    expect(tagRows).toEqual([
      { id: tagIds[0]!, name: 'typescript' },
      { id: tagIds[1]!, name: '学习笔记' },
    ]);

    provider.close();
  });

  it('复用已有标签并忽略重复关联', () => {
    const provider = initializeStorage({ dbPath: ':memory:' });
    const repository = new TagRepository(provider);
    const knowledgeItemRepository = new KnowledgeItemRepository(provider);

    provider.transaction((db) => {
      const knowledgeItemId = knowledgeItemRepository.create(
        {
          title: '已存在的条目',
          sourceType: 'local-markdown',
          sourcePath: '/tmp/existing.md',
          content: '# 已存在的条目\n\n正文。',
          wordCount: 8,
          createdAt: '2026-04-21T00:00:00.000Z',
        },
        db,
      );
      const firstPass = repository.ensureTagIds(['typescript'], db);
      const secondPass = repository.ensureTagIds(['typescript'], db);
      repository.linkTagsToItem(knowledgeItemId, firstPass, db);
      repository.linkTagsToItem(knowledgeItemId, secondPass, db);
    });

    const tagCount = provider.getConnection().prepare('SELECT COUNT(*) AS count FROM tags').get() as {
      count: number;
    };
    const relationCount = provider
      .getConnection()
      .prepare('SELECT COUNT(*) AS count FROM item_tags')
      .get() as { count: number };

    expect(tagCount.count).toBe(1);
    expect(relationCount.count).toBe(1);

    provider.close();
  });
});
