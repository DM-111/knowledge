import type Database from 'better-sqlite3';
import { SearchRepository, VectorRepository, type SearchRow, initializeStorage } from '../../storage/index.js';
import { getTokenizerSync, getSynonymExpander } from '../tokenizer/index.js';
import { tryGetEmbeddingProvider } from '../embedding/index.js';
import { normalizeSearchFilters } from './filters.js';
import { buildFtsMatchQuery } from './fts-match.js';
import type { SearchByKeywordOptions, SearchHit, SearchResult } from './types.js';

export type HybridSearchMode = 'hybrid' | 'fts' | 'vector';

export interface HybridSearchOptions extends SearchByKeywordOptions {
  /** 搜索模式 */
  mode?: HybridSearchMode;
  /** FTS 权重（0-1） */
  ftsWeight?: number;
  /** 向量权重（0-1） */
  vecWeight?: number;
  /** RRF 常数 k */
  rrfK?: number;
}

export interface HybridSearchResult extends SearchResult {
  /** 实际使用的搜索模式 */
  actualMode: HybridSearchMode;
}

/**
 * 混合搜索：FTS5 + 向量检索 → RRF 融合排序。
 *
 * 降级策略：
 * - 无 embedding 模型 → 自动降级为 fts 模式
 * - 无 sqlite-vec → 自动降级为 fts 模式
 * - mode='fts' → 仅走 FTS 路径
 * - mode='vector' → 仅走向量路径
 */
export async function hybridSearch(options: HybridSearchOptions): Promise<HybridSearchResult> {
  const {
    query,
    limit,
    dbPath,
    mode = 'hybrid',
    ftsWeight = 0.3,
    vecWeight = 0.7,
    rrfK = 60,
  } = options;

  const provider = initializeStorage({ dbPath });

  try {
    const db = provider.getConnection();
    const filters = normalizeSearchFilters(options, 'hybridSearch');
    const queryOptions = {
      limit: limit * 3, // 过取以供融合
      tag: filters.tag,
      source: filters.source,
      createdAfter: filters.createdAfter,
      createdBefore: filters.createdBefore,
    };

    // --- FTS 检索 ---
    let ftsRanks = new Map<number, number>(); // chunkId → rank (1-indexed)

    if (mode !== 'vector') {
      ftsRanks = executeFtsSearch(provider, query, queryOptions);
    }

    // --- 向量检索 ---
    let vecRanks = new Map<number, number>();

    if (mode !== 'fts' && provider.vectorSearchEnabled) {
      vecRanks = await executeVectorSearch(provider, query, limit * 3);
    }

    // 确定实际模式
    let actualMode: HybridSearchMode = mode;
    if (mode === 'hybrid' && vecRanks.size === 0) {
      actualMode = 'fts';
    } else if (mode === 'vector' && vecRanks.size === 0) {
      // vector 模式但无向量结果，降级到 fts
      ftsRanks = executeFtsSearch(provider, query, queryOptions);
      actualMode = 'fts';
    }

    // --- RRF 融合 ---
    const allChunkIds = new Set([...ftsRanks.keys(), ...vecRanks.keys()]);
    const scored: Array<{ chunkId: number; score: number }> = [];

    for (const chunkId of allChunkIds) {
      let score = 0;

      const ftsRank = ftsRanks.get(chunkId);
      if (ftsRank !== undefined) {
        score += ftsWeight / (rrfK + ftsRank);
      }

      const vecRank = vecRanks.get(chunkId);
      if (vecRank !== undefined) {
        score += vecWeight / (rrfK + vecRank);
      }

      scored.push({ chunkId, score });
    }

    // 按 RRF 分数降序排列
    scored.sort((a, b) => b.score - a.score);

    // 取 top-limit 并 hydrate
    const topChunks = scored.slice(0, limit);
    const items = hydrateChunks(topChunks, db);

    return {
      items,
      total: scored.length,
      actualMode,
    };
  } finally {
    provider.close();
  }
}

function executeFtsSearch(
  provider: ReturnType<typeof initializeStorage>,
  query: string,
  queryOptions: { limit: number; tag?: string; source?: string; createdAfter?: string; createdBefore?: string },
): Map<number, number> {
  const tokenizer = getTokenizerSync();
  const synonymExpander = getSynonymExpander();
  const repo = new SearchRepository(provider);
  const ranks = new Map<number, number>();

  try {
    // AND 查询
    const andResult = buildFtsMatchQuery({ raw: query, tokenizer, synonymExpander, mode: 'and' });
    const rows = repo.searchByFtsQuery(andResult.matchExpr, queryOptions);

    if (rows.length > 0) {
      rows.forEach((row, idx) => ranks.set(row.chunkId, idx + 1));
      return ranks;
    }

    // OR fallback
    if (andResult.tokens.length > 1) {
      const orResult = buildFtsMatchQuery({ raw: query, tokenizer, synonymExpander, mode: 'or' });
      const orRows = repo.searchByFtsQuery(orResult.matchExpr, queryOptions);
      orRows.forEach((row, idx) => ranks.set(row.chunkId, idx + 1));
    }
  } catch {
    // FTS 失败不阻塞混合搜索
  }

  return ranks;
}

async function executeVectorSearch(
  provider: ReturnType<typeof initializeStorage>,
  query: string,
  limit: number,
): Promise<Map<number, number>> {
  const ranks = new Map<number, number>();

  try {
    const embeddingProvider = await tryGetEmbeddingProvider();
    if (!embeddingProvider) return ranks;

    const queryEmbedding = await embeddingProvider.embedOne(query);
    const vecRepo = new VectorRepository(provider);
    const results = vecRepo.search(queryEmbedding, limit);

    results.forEach((r, idx) => ranks.set(r.chunkId, idx + 1));
  } catch {
    // 向量搜索失败不阻塞
  }

  return ranks;
}

function hydrateChunks(
  scored: Array<{ chunkId: number; score: number }>,
  db: Database.Database,
): SearchHit[] {
  if (scored.length === 0) return [];

  const ids = scored.map((s) => s.chunkId);
  const placeholders = ids.map(() => '?').join(',');

  const rows = db
    .prepare(
      `SELECT c.id AS chunkId, k.title, k.source_path AS sourcePath, k.created_at AS createdAt,
              substr(c.content, 1, 200) AS hitSnippet
       FROM chunks c
       INNER JOIN knowledge_items k ON k.id = c.knowledge_item_id
       WHERE c.id IN (${placeholders})`,
    )
    .all(...ids) as Array<{
      chunkId: number;
      title: string;
      sourcePath: string;
      createdAt: string;
      hitSnippet: string;
    }>;

  const rowMap = new Map(rows.map((r) => [r.chunkId, r]));

  return scored
    .map(({ chunkId }) => rowMap.get(chunkId))
    .filter((item): item is NonNullable<typeof item> => item != null);
}
