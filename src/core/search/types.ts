export interface SearchHit {
  /** 命中的 chunk 行 id，对应 `chunks.id` */
  chunkId: number;
  title: string;
  sourcePath: string;
  createdAt: string;
  /** 与关键词相关的短片段，来自 FTS5 snippet/高亮位点 */
  hitSnippet: string;
}

export interface SearchResult {
  items: SearchHit[];
  total: number;
  /** 是否为 OR fallback 结果（AND 查询零结果后降级为 OR） */
  isFallback?: boolean;
}

export interface SearchFilterOptions {
  tag?: string;
  source?: string;
  after?: string;
  before?: string;
}

export interface SearchByKeywordOptions extends SearchFilterOptions {
  query: string;
  limit: number;
  dbPath: string;
}

export interface ListKnowledgeItemsOptions extends SearchFilterOptions {
  dbPath: string;
  limit?: number;
}

export interface KnowledgeListItem {
  id: number;
  title: string;
  sourceType: string;
  tags: string[];
  createdAt: string;
}

export interface ListKnowledgeItemsResult {
  items: KnowledgeListItem[];
  total: number;
}
