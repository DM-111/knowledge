import type Database from 'better-sqlite3';
import type { DatabaseProvider } from '../provider.js';

export interface ReadingProgressRow {
  id: number;
  knowledgeItemId: number;
  currentChunkIndex: number;
  totalChunks: number;
  percentage: number;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  lastReadAt: string | null;
}

export interface BookmarkRow {
  id: number;
  knowledgeItemId: number;
  chunkIndex: number;
  label: string | null;
  note: string | null;
  createdAt: string;
}

export interface UpsertProgressInput {
  knowledgeItemId: number;
  currentChunkIndex: number;
  totalChunks: number;
  status?: string;
}

export interface CreateBookmarkInput {
  knowledgeItemId: number;
  chunkIndex: number;
  label?: string;
  note?: string;
}

export class ProgressRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  getProgress(
    itemId: number,
    db: Database.Database = this.provider.getConnection(),
  ): ReadingProgressRow | undefined {
    const row = db
      .prepare(
        `SELECT id, knowledge_item_id, current_chunk_index, total_chunks,
                percentage, status, started_at, completed_at, last_read_at
         FROM reading_progress WHERE knowledge_item_id = ?`,
      )
      .get(itemId) as
      | {
          id: number;
          knowledge_item_id: number;
          current_chunk_index: number;
          total_chunks: number;
          percentage: number;
          status: string;
          started_at: string | null;
          completed_at: string | null;
          last_read_at: string | null;
        }
      | undefined;

    if (!row) return undefined;

    return {
      id: row.id,
      knowledgeItemId: row.knowledge_item_id,
      currentChunkIndex: row.current_chunk_index,
      totalChunks: row.total_chunks,
      percentage: row.percentage,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      lastReadAt: row.last_read_at,
    };
  }

  upsertProgress(
    input: UpsertProgressInput,
    db: Database.Database = this.provider.getConnection(),
  ): void {
    const now = new Date().toISOString();
    const percentage = input.totalChunks > 0
      ? Math.round((input.currentChunkIndex / input.totalChunks) * 100 * 100) / 100
      : 0;
    const status = input.status ?? (input.currentChunkIndex >= input.totalChunks ? 'completed' : 'reading');

    const existing = this.getProgress(input.knowledgeItemId, db);

    if (existing) {
      db.prepare(
        `UPDATE reading_progress
         SET current_chunk_index = ?,
             total_chunks = ?,
             percentage = ?,
             status = ?,
             last_read_at = ?,
             completed_at = CASE WHEN ? = 'completed' THEN ? ELSE completed_at END
         WHERE knowledge_item_id = ?`,
      ).run(
        input.currentChunkIndex,
        input.totalChunks,
        percentage,
        status,
        now,
        status,
        now,
        input.knowledgeItemId,
      );
    } else {
      db.prepare(
        `INSERT INTO reading_progress
           (knowledge_item_id, current_chunk_index, total_chunks, percentage, status, started_at, last_read_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        input.knowledgeItemId,
        input.currentChunkIndex,
        input.totalChunks,
        percentage,
        status,
        now,
        now,
        status === 'completed' ? now : null,
      );
    }
  }

  addBookmark(
    input: CreateBookmarkInput,
    db: Database.Database = this.provider.getConnection(),
  ): number {
    const result = db
      .prepare(
        `INSERT INTO bookmarks (knowledge_item_id, chunk_index, label, note)
         VALUES (?, ?, ?, ?)`,
      )
      .run(input.knowledgeItemId, input.chunkIndex, input.label ?? null, input.note ?? null);

    return Number(result.lastInsertRowid);
  }

  getBookmarks(
    itemId: number,
    db: Database.Database = this.provider.getConnection(),
  ): BookmarkRow[] {
    const rows = db
      .prepare(
        `SELECT id, knowledge_item_id, chunk_index, label, note, created_at
         FROM bookmarks WHERE knowledge_item_id = ? ORDER BY chunk_index ASC`,
      )
      .all(itemId) as Array<{
      id: number;
      knowledge_item_id: number;
      chunk_index: number;
      label: string | null;
      note: string | null;
      created_at: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      knowledgeItemId: r.knowledge_item_id,
      chunkIndex: r.chunk_index,
      label: r.label,
      note: r.note,
      createdAt: r.created_at,
    }));
  }

  removeBookmark(
    bookmarkId: number,
    db: Database.Database = this.provider.getConnection(),
  ): void {
    db.prepare('DELETE FROM bookmarks WHERE id = ?').run(bookmarkId);
  }

  getInProgressItems(
    db: Database.Database = this.provider.getConnection(),
  ): ReadingProgressRow[] {
    const rows = db
      .prepare(
        `SELECT id, knowledge_item_id, current_chunk_index, total_chunks,
                percentage, status, started_at, completed_at, last_read_at
         FROM reading_progress WHERE status = 'reading' ORDER BY last_read_at DESC`,
      )
      .all() as Array<{
      id: number;
      knowledge_item_id: number;
      current_chunk_index: number;
      total_chunks: number;
      percentage: number;
      status: string;
      started_at: string | null;
      completed_at: string | null;
      last_read_at: string | null;
    }>;

    return rows.map((r) => ({
      id: r.id,
      knowledgeItemId: r.knowledge_item_id,
      currentChunkIndex: r.current_chunk_index,
      totalChunks: r.total_chunks,
      percentage: r.percentage,
      status: r.status,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      lastReadAt: r.last_read_at,
    }));
  }

  getCompletedItems(
    limit = 10,
    db: Database.Database = this.provider.getConnection(),
  ): ReadingProgressRow[] {
    const rows = db
      .prepare(
        `SELECT id, knowledge_item_id, current_chunk_index, total_chunks,
                percentage, status, started_at, completed_at, last_read_at
         FROM reading_progress WHERE status = 'completed'
         ORDER BY completed_at DESC LIMIT ?`,
      )
      .all(limit) as Array<{
      id: number;
      knowledge_item_id: number;
      current_chunk_index: number;
      total_chunks: number;
      percentage: number;
      status: string;
      started_at: string | null;
      completed_at: string | null;
      last_read_at: string | null;
    }>;

    return rows.map((r) => ({
      id: r.id,
      knowledgeItemId: r.knowledge_item_id,
      currentChunkIndex: r.current_chunk_index,
      totalChunks: r.total_chunks,
      percentage: r.percentage,
      status: r.status,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      lastReadAt: r.last_read_at,
    }));
  }
}
