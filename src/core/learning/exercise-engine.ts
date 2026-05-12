import { initializeStorage } from '../../storage/index.js';
import { MasteryRepository } from '../../storage/repositories/mastery-repository.js';

export type ExerciseType = 'fill_blank' | 'code_challenge' | 'scenario_analysis';

export interface GenerateExerciseOptions {
  dbPath: string;
  itemId?: number;
  tag?: string;
  type: ExerciseType | 'mixed';
  count?: number;
}

export interface ExerciseBundle {
  itemId?: number;
  itemTitle?: string;
  tag?: string;
  exerciseType: ExerciseType | 'mixed';
  chunks: Array<{ chunkId: number; index: number; content: string; itemTitle: string }>;
  previousMastery?: number;
}

export interface UpdateMasteryOptions {
  dbPath: string;
  itemId?: number;
  tagName?: string;
  score: number;
}

export interface MasteryDashboard {
  items: Array<{
    itemId: number;
    title: string;
    score: number;
    totalAttempts: number;
    lastAssessedAt: string;
  }>;
  tags: Array<{
    tagId: number;
    tagName: string;
    score: number;
    totalAttempts: number;
    lastAssessedAt: string;
  }>;
  overallScore: number;
}

/**
 * Prepare exercise content from knowledge base.
 */
export function prepareExerciseContent(options: GenerateExerciseOptions): ExerciseBundle {
  const { dbPath, itemId, tag, type, count = 3 } = options;
  const provider = initializeStorage({ dbPath });

  try {
    const db = provider.getConnection();
    const masteryRepo = new MasteryRepository(provider);

    let chunks: Array<{ chunkId: number; index: number; content: string; itemTitle: string }> = [];
    let itemTitle: string | undefined;
    let previousMastery: number | undefined;

    if (itemId) {
      const item = db
        .prepare('SELECT title FROM knowledge_items WHERE id = ?')
        .get(itemId) as { title: string } | undefined;

      if (!item) throw new Error(`知识条目 #${itemId} 不存在`);
      itemTitle = item.title;

      const mastery = masteryRepo.getItemMastery(itemId, db);
      previousMastery = mastery?.score;

      const allChunks = db
        .prepare('SELECT id, chunk_index, content FROM chunks WHERE knowledge_item_id = ? ORDER BY chunk_index')
        .all(itemId) as Array<{ id: number; chunk_index: number; content: string }>;

      // Select chunks prioritizing those with lower mastery (random for now since we don't track per-chunk)
      const selected = shuffleAndTake(allChunks, count * 2);
      chunks = selected.map((c) => ({
        chunkId: c.id,
        index: c.chunk_index,
        content: c.content,
        itemTitle: itemTitle!,
      }));
    } else if (tag) {
      // Cross-item exercise by tag
      const tagChunks = db
        .prepare(
          `SELECT c.id, c.chunk_index, c.content, k.title as item_title
           FROM chunks c
           INNER JOIN knowledge_items k ON k.id = c.knowledge_item_id
           INNER JOIN item_tags it ON it.knowledge_item_id = k.id
           INNER JOIN tags t ON t.id = it.tag_id
           WHERE t.name = ?
           ORDER BY RANDOM() LIMIT ?`,
        )
        .all(tag, count * 2) as Array<{ id: number; chunk_index: number; content: string; item_title: string }>;

      chunks = tagChunks.map((c) => ({
        chunkId: c.id,
        index: c.chunk_index,
        content: c.content,
        itemTitle: c.item_title,
      }));
    }

    return {
      itemId,
      itemTitle,
      tag,
      exerciseType: type,
      chunks,
      previousMastery,
    };
  } finally {
    provider.close();
  }
}

/**
 * Update mastery score after exercise completion.
 */
export function updateMastery(options: UpdateMasteryOptions): { newScore: number } {
  const { dbPath, itemId, tagName, score } = options;
  const provider = initializeStorage({ dbPath });

  try {
    const db = provider.getConnection();
    const repo = new MasteryRepository(provider);

    let newScore: number;

    if (itemId) {
      newScore = repo.upsertItemMastery(itemId, score, 0.3, db);
    } else if (tagName) {
      const tagRow = db.prepare('SELECT id FROM tags WHERE name = ?').get(tagName) as { id: number } | undefined;
      if (!tagRow) throw new Error(`标签 "${tagName}" 不存在`);
      newScore = repo.upsertTagMastery(tagRow.id, score, 0.3, db);
    } else {
      throw new Error('需要 itemId 或 tagName');
    }

    return { newScore };
  } finally {
    provider.close();
  }
}

/**
 * Get mastery dashboard.
 */
export function getMasteryDashboard(dbPath: string): MasteryDashboard {
  const provider = initializeStorage({ dbPath });

  try {
    const db = provider.getConnection();
    const repo = new MasteryRepository(provider);
    const allScores = repo.getAllScores(db);

    const items: MasteryDashboard['items'] = [];
    const tags: MasteryDashboard['tags'] = [];

    for (const s of allScores) {
      if (s.knowledgeItemId) {
        const item = db.prepare('SELECT title FROM knowledge_items WHERE id = ?').get(s.knowledgeItemId) as { title: string } | undefined;
        items.push({
          itemId: s.knowledgeItemId,
          title: item?.title ?? '(unknown)',
          score: s.score,
          totalAttempts: s.totalAttempts,
          lastAssessedAt: s.lastAssessedAt,
        });
      } else if (s.tagId) {
        const tag = db.prepare('SELECT name FROM tags WHERE id = ?').get(s.tagId) as { name: string } | undefined;
        tags.push({
          tagId: s.tagId,
          tagName: tag?.name ?? '(unknown)',
          score: s.score,
          totalAttempts: s.totalAttempts,
          lastAssessedAt: s.lastAssessedAt,
        });
      }
    }

    const allNonZero = allScores.filter((s) => s.totalAttempts > 0);
    const overallScore = allNonZero.length > 0
      ? Math.round((allNonZero.reduce((sum, s) => sum + s.score, 0) / allNonZero.length) * 100) / 100
      : 0;

    return { items, tags, overallScore };
  } finally {
    provider.close();
  }
}

function shuffleAndTake<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}
