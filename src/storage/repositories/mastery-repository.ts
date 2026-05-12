import type Database from 'better-sqlite3';
import type { DatabaseProvider } from '../provider.js';

export interface MasteryScoreRow {
  id: number;
  knowledgeItemId: number | null;
  tagId: number | null;
  score: number;
  totalAttempts: number;
  correctAttempts: number;
  lastAssessedAt: string;
}

export class MasteryRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  getItemMastery(
    itemId: number,
    db: Database.Database = this.provider.getConnection(),
  ): MasteryScoreRow | undefined {
    const row = db
      .prepare(
        `SELECT id, knowledge_item_id, tag_id, score, total_attempts, correct_attempts, last_assessed_at
         FROM mastery_scores WHERE knowledge_item_id = ? AND tag_id IS NULL`,
      )
      .get(itemId) as {
      id: number;
      knowledge_item_id: number | null;
      tag_id: number | null;
      score: number;
      total_attempts: number;
      correct_attempts: number;
      last_assessed_at: string;
    } | undefined;

    if (!row) return undefined;
    return {
      id: row.id,
      knowledgeItemId: row.knowledge_item_id,
      tagId: row.tag_id,
      score: row.score,
      totalAttempts: row.total_attempts,
      correctAttempts: row.correct_attempts,
      lastAssessedAt: row.last_assessed_at,
    };
  }

  getTagMastery(
    tagId: number,
    db: Database.Database = this.provider.getConnection(),
  ): MasteryScoreRow | undefined {
    const row = db
      .prepare(
        `SELECT id, knowledge_item_id, tag_id, score, total_attempts, correct_attempts, last_assessed_at
         FROM mastery_scores WHERE tag_id = ? AND knowledge_item_id IS NULL`,
      )
      .get(tagId) as {
      id: number;
      knowledge_item_id: number | null;
      tag_id: number | null;
      score: number;
      total_attempts: number;
      correct_attempts: number;
      last_assessed_at: string;
    } | undefined;

    if (!row) return undefined;
    return {
      id: row.id,
      knowledgeItemId: row.knowledge_item_id,
      tagId: row.tag_id,
      score: row.score,
      totalAttempts: row.total_attempts,
      correctAttempts: row.correct_attempts,
      lastAssessedAt: row.last_assessed_at,
    };
  }

  /**
   * Update mastery using EMA: new_score = α * latest + (1-α) * previous
   */
  upsertItemMastery(
    itemId: number,
    latestScore: number,
    alpha = 0.3,
    db: Database.Database = this.provider.getConnection(),
  ): number {
    const existing = this.getItemMastery(itemId, db);
    const now = new Date().toISOString();

    if (existing) {
      const newScore = alpha * latestScore + (1 - alpha) * existing.score;
      const newTotal = existing.totalAttempts + 1;
      const newCorrect = existing.correctAttempts + (latestScore >= 0.5 ? 1 : 0);

      db.prepare(
        `UPDATE mastery_scores
         SET score = ?, total_attempts = ?, correct_attempts = ?, last_assessed_at = ?
         WHERE id = ?`,
      ).run(Math.round(newScore * 1000) / 1000, newTotal, newCorrect, now, existing.id);

      return newScore;
    } else {
      db.prepare(
        `INSERT INTO mastery_scores (knowledge_item_id, tag_id, score, total_attempts, correct_attempts, last_assessed_at)
         VALUES (?, NULL, ?, 1, ?, ?)`,
      ).run(itemId, latestScore, latestScore >= 0.5 ? 1 : 0, now);

      return latestScore;
    }
  }

  upsertTagMastery(
    tagId: number,
    latestScore: number,
    alpha = 0.3,
    db: Database.Database = this.provider.getConnection(),
  ): number {
    const existing = this.getTagMastery(tagId, db);
    const now = new Date().toISOString();

    if (existing) {
      const newScore = alpha * latestScore + (1 - alpha) * existing.score;
      const newTotal = existing.totalAttempts + 1;
      const newCorrect = existing.correctAttempts + (latestScore >= 0.5 ? 1 : 0);

      db.prepare(
        `UPDATE mastery_scores
         SET score = ?, total_attempts = ?, correct_attempts = ?, last_assessed_at = ?
         WHERE id = ?`,
      ).run(Math.round(newScore * 1000) / 1000, newTotal, newCorrect, now, existing.id);

      return newScore;
    } else {
      db.prepare(
        `INSERT INTO mastery_scores (knowledge_item_id, tag_id, score, total_attempts, correct_attempts, last_assessed_at)
         VALUES (NULL, ?, ?, 1, ?, ?)`,
      ).run(tagId, latestScore, latestScore >= 0.5 ? 1 : 0, now);

      return latestScore;
    }
  }

  getAllScores(
    db: Database.Database = this.provider.getConnection(),
  ): MasteryScoreRow[] {
    const rows = db
      .prepare(
        `SELECT id, knowledge_item_id, tag_id, score, total_attempts, correct_attempts, last_assessed_at
         FROM mastery_scores ORDER BY score ASC`,
      )
      .all() as Array<{
      id: number;
      knowledge_item_id: number | null;
      tag_id: number | null;
      score: number;
      total_attempts: number;
      correct_attempts: number;
      last_assessed_at: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      knowledgeItemId: r.knowledge_item_id,
      tagId: r.tag_id,
      score: r.score,
      totalAttempts: r.total_attempts,
      correctAttempts: r.correct_attempts,
      lastAssessedAt: r.last_assessed_at,
    }));
  }
}
