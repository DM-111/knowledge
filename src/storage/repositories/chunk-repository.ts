import type Database from 'better-sqlite3';
import type { DatabaseProvider } from '../provider.js';

export interface CreateChunkInput {
  chunkIndex: number;
  content: string;
  contentSegmented?: string;
  startOffset: number;
  endOffset: number;
  overlapStartOffset: number;
  overlapEndOffset: number;
}

export class ChunkRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  createMany(
    knowledgeItemId: number,
    chunks: readonly CreateChunkInput[],
    db: Database.Database = this.provider.getConnection(),
  ): void {
    const statement = db.prepare(
      `
        INSERT INTO chunks (
          knowledge_item_id,
          chunk_index,
          content,
          content_segmented,
          start_offset,
          end_offset,
          overlap_start_offset,
          overlap_end_offset
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    );

    for (const chunk of chunks) {
      statement.run(
        knowledgeItemId,
        chunk.chunkIndex,
        chunk.content,
        chunk.contentSegmented ?? null,
        chunk.startOffset,
        chunk.endOffset,
        chunk.overlapStartOffset,
        chunk.overlapEndOffset,
      );
    }
  }
}
