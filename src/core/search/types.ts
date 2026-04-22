export interface SearchHit {
  /** 命中的 chunk 行 id，对应 `chunks.id` */
  chunkId: number;
  title: string;
  sourcePath: string;
  createdAt: string;
  /** 与关键词相关的短片段，来自 FTS5 snippet/高亮位点 */
  hitSnippet: string;
}

export interface SearchByKeywordOptions {
  query: string;
  limit: number;
  dbPath: string;
}
