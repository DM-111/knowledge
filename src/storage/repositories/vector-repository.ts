import type Database from 'better-sqlite3';
import { StorageError } from '../../errors/index.js';
import type { DatabaseProvider } from '../provider.js';

export interface VectorSearchResult {
  chunkId: number;
  distance: number;
}

export interface VectorInsertInput {
  chunkId: number;
  embedding: Float32Array;
}

export class VectorRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  /**
   * 批量插入 chunk embeddings。
   * sqlite-vec 接受 Float32Array 的底层 Buffer 作为 embedding 参数。
   */
  insertMany(
    inputs: readonly VectorInsertInput[],
    db: Database.Database = this.provider.getConnection(),
  ): void {
    if (inputs.length === 0) return;

    const stmt = db.prepare(
      'INSERT INTO chunks_vec (rowid, embedding) VALUES (?, ?)',
    );

    for (const input of inputs) {
      const buffer = Buffer.from(
        input.embedding.buffer,
        input.embedding.byteOffset,
        input.embedding.byteLength,
      );
      stmt.run(input.chunkId, buffer);
    }
  }

  /**
   * KNN 向量搜索：返回与 query embedding 最近的 k 个 chunks。
   */
  search(
    queryEmbedding: Float32Array,
    limit: number,
    db: Database.Database = this.provider.getConnection(),
  ): VectorSearchResult[] {
    const buffer = Buffer.from(
      queryEmbedding.buffer,
      queryEmbedding.byteOffset,
      queryEmbedding.byteLength,
    );

    try {
      const rows = db
        .prepare(
          `SELECT rowid, distance
           FROM chunks_vec
           WHERE embedding MATCH ?
           ORDER BY distance
           LIMIT ?`,
        )
        .all(buffer, limit) as Array<{ rowid: number; distance: number }>;

      return rows.map((row) => ({
        chunkId: row.rowid,
        distance: row.distance,
      }));
    } catch (error) {
      throw new StorageError('向量检索失败', {
        step: 'vector-search',
        source: 'vector-repository',
        cause: error,
      });
    }
  }

  /**
   * 删除指定 chunk 的 embeddings。
   */
  deleteByChunkIds(
    chunkIds: readonly number[],
    db: Database.Database = this.provider.getConnection(),
  ): void {
    if (chunkIds.length === 0) return;

    const stmt = db.prepare('DELETE FROM chunks_vec WHERE rowid = ?');
    for (const id of chunkIds) {
      stmt.run(id);
    }
  }

  /**
   * 获取尚未生成 embedding 的 chunk IDs。
   */
  getUnembeddedChunkIds(
    limit: number = 1000,
    db: Database.Database = this.provider.getConnection(),
  ): number[] {
    const rows = db
      .prepare(
        `SELECT id FROM chunks
         WHERE embedding_version = 0
         ORDER BY id ASC
         LIMIT ?`,
      )
      .all(limit) as Array<{ id: number }>;

    return rows.map((r) => r.id);
  }

  /**
   * 标记 chunks 为已生成 embedding。
   */
  markAsEmbedded(
    chunkIds: readonly number[],
    version: number = 1,
    db: Database.Database = this.provider.getConnection(),
  ): void {
    if (chunkIds.length === 0) return;

    const stmt = db.prepare('UPDATE chunks SET embedding_version = ? WHERE id = ?');
    for (const id of chunkIds) {
      stmt.run(version, id);
    }
  }

  /**
   * 获取向量表中的记录数。
   */
  count(db: Database.Database = this.provider.getConnection()): number {
    const row = db
      .prepare('SELECT COUNT(*) AS cnt FROM chunks_vec')
      .get() as { cnt: number };
    return row.cnt;
  }
}
