import type { Database } from 'better-sqlite3';
import { resolveIngestionAdapter } from '../../adapters/index.js';
import { IngestionError } from '../../errors/index.js';
import {
  ChunkRepository,
  KnowledgeItemRepository,
  TagRepository,
  initializeStorage,
  type DatabaseProvider,
} from '../../storage/index.js';
import type { ChunkDraft, ContentMetadata, IngestResult } from '../types.js';
import { getTokenizerSync } from '../tokenizer/index.js';
import { chunkMarkdownContent } from './chunker.js';
import type { IngestOptions } from './adapter.js';

export interface IngestSourceOptions extends IngestOptions {
  source: string;
  dbPath: string;
  tags?: string[];
  note?: string;
  duplicateStrategy?: 'error' | 'replace' | 'skip';
  /** 跳过 embedding 生成（默认跳过；设为 false 以在入库时同步生成 embedding） */
  skipEmbeddings?: boolean;
}

export async function ingestSource(options: IngestSourceOptions): Promise<IngestResult> {
  const provider = initializeStorage({ dbPath: options.dbPath });

  try {
    return await ingestSourceWithProvider(provider, options);
  } finally {
    provider.close();
  }
}

export async function ingestSourceWithProvider(
  provider: DatabaseProvider,
  options: IngestSourceOptions,
): Promise<IngestResult> {
  throwIfAborted(options);

  emitProgress(options, {
    step: 'resolve-adapter',
    status: 'start',
    detail: `为 ${options.source} 选择 adapter`,
  });

  let adapter: ReturnType<typeof resolveIngestionAdapter>;

  try {
    adapter = resolveIngestionAdapter(options.source);
  } catch (error) {
    emitStepError(options, 'resolve-adapter', '选择适配器失败', error);
    throw error;
  }

  emitProgress(options, {
    step: 'resolve-adapter',
    status: 'complete',
    detail: `已选择 ${adapter.sourceType} adapter`,
  });
  throwIfAborted(options);

  emitProgress(options, {
    step: 'fetch',
    status: 'start',
    detail: `读取 ${options.source}`,
  });

  let rawContent: Awaited<ReturnType<typeof adapter.ingest>>;

  try {
    rawContent = await adapter.ingest(options.source, options);
  } catch (error) {
    const ingestionError = mapFetchError(options.source, error);
    emitStepError(options, 'fetch', '读取文件失败', ingestionError);
    throw ingestionError;
  }

  emitProgress(options, {
    step: 'fetch',
    status: 'complete',
    detail: `已读取 ${options.source}`,
  });
  throwIfAborted(options);

  emitProgress(options, {
    step: 'parse',
    status: 'start',
    detail: '解析与标准化 Markdown 内容',
  });

  const normalizedMarkdown = rawContent.markdown.trim();
  if (!normalizedMarkdown) {
    const ingestionError = new IngestionError('Markdown 内容为空，无法入库', {
      step: 'parse',
      source: options.source,
    });
    emitStepError(options, 'parse', '内容清洗失败', ingestionError);
    throw ingestionError;
  }

  const wordCount = countWords(normalizedMarkdown);

  emitProgress(options, {
    step: 'parse',
    status: 'complete',
    detail: `已提取标题 ${rawContent.title}`,
  });
  throwIfAborted(options);

  emitProgress(options, {
    step: 'chunk',
    status: 'start',
    detail: '按标题与段落切分内容',
  });

  let chunkDrafts: ChunkDraft[];

  try {
    chunkDrafts = chunkMarkdownContent(normalizedMarkdown, {
      overlapParagraphs: 1,
    });
  } catch (error) {
    const ingestionError = new IngestionError('切分 Markdown 内容失败', {
      step: 'chunk',
      source: options.source,
      cause: error,
    });
    emitStepError(options, 'chunk', '切分 chunks 失败', ingestionError);
    throw ingestionError;
  }

  if (chunkDrafts.length === 0) {
    const ingestionError = new IngestionError('未生成任何 chunk，无法完成入库', {
      step: 'chunk',
      source: options.source,
    });
    emitStepError(options, 'chunk', '切分 chunks 失败', ingestionError);
    throw ingestionError;
  }

  emitProgress(options, {
    step: 'chunk',
    status: 'complete',
    detail: `已生成 ${chunkDrafts.length} 个 chunk`,
  });
  throwIfAborted(options);

  // 分词步骤：为每个 chunk 生成 content_segmented
  const tokenizer = getTokenizerSync();
  const segmentedChunkDrafts = chunkDrafts.map((chunk) => ({
    ...chunk,
    contentSegmented: tokenizer.segment(chunk.content).segmented,
  }));

  const knowledgeItemRepository = new KnowledgeItemRepository(provider);
  const chunkRepository = new ChunkRepository(provider);
  const tagRepository = new TagRepository(provider);
  const normalizedTags = normalizeTags(options.tags ?? []);
  const normalizedNote = normalizeNote(options.note);

  emitProgress(options, {
    step: 'store',
    status: 'start',
    detail: '写入 knowledge_items 与 chunks',
  });

  let knowledgeItemId: number;

  try {
    knowledgeItemId = provider.transaction((db) => {
      throwIfAborted(options);
      const existingItem = knowledgeItemRepository.findBySource(rawContent.sourceType, rawContent.sourcePath, db);

      if (existingItem) {
        if (options.duplicateStrategy === 'replace') {
          knowledgeItemRepository.deleteById(existingItem.id, db);
        } else if (options.duplicateStrategy === 'skip') {
          throw new IngestionError('检测到重复来源，已按策略跳过入库', {
            step: 'store',
            source: rawContent.sourcePath,
          });
        } else {
          throw new IngestionError('该来源已入库，请选择覆盖更新或跳过', {
            step: 'store',
            source: rawContent.sourcePath,
          });
        }
      }

      const itemId = knowledgeItemRepository.create(
        {
          title: rawContent.title,
          sourceType: rawContent.sourceType,
          sourcePath: rawContent.sourcePath,
          content: normalizedMarkdown,
          wordCount,
          createdAt: rawContent.createdAt,
          note: normalizedNote,
          metadataJson: rawContent.metadata ? JSON.stringify(rawContent.metadata) : undefined,
        },
        db,
      );

      chunkRepository.createMany(itemId, toChunkInputs(segmentedChunkDrafts), db);
      const tagIds = tagRepository.ensureTagIds(normalizedTags, db);
      tagRepository.linkTagsToItem(itemId, tagIds, db);
      return itemId;
    });
  } catch (error) {
    emitStepError(options, 'store', '存储入库失败', error);
    throw error;
  }

  emitProgress(options, {
    step: 'store',
    status: 'complete',
    detail: `已写入 knowledge item ${knowledgeItemId}`,
  });
  throwIfAborted(options);

  emitProgress(options, {
    step: 'index',
    status: 'start',
    detail: `准备同步 ${chunkDrafts.length} 个 chunk 到 FTS`,
  });

  emitProgress(options, {
    step: 'index',
    status: 'complete',
    detail: `FTS 触发器已同步 ${chunkDrafts.length} 个 chunk`,
  });

  // 向量嵌入步骤（默认跳过，用户需通过 --embed 或 kb reindex --phase vectors 显式触发）
  if (options.skipEmbeddings === false) {
    await tryGenerateEmbeddings(provider, knowledgeItemId, options);
  }

  return {
    title: rawContent.title,
    sourcePath: rawContent.sourcePath,
    wordCount,
    chunkCount: chunkDrafts.length,
    knowledgeItemId,
    tags: normalizedTags,
    note: normalizedNote,
    metadata: rawContent.metadata,
  };
}

function toChunkInputs(chunkDrafts: readonly (ChunkDraft & { contentSegmented?: string })[]) {
  return chunkDrafts.map((chunk, chunkIndex) => ({
    chunkIndex,
    content: chunk.overlap ? `${chunk.overlap}\n\n${chunk.content}` : chunk.content,
    contentSegmented: chunk.contentSegmented,
    startOffset: chunk.startOffset,
    endOffset: chunk.endOffset,
    overlapStartOffset: chunk.overlapStartOffset,
    overlapEndOffset: chunk.overlapEndOffset,
  }));
}

function countWords(content: string): number {
  const compact = content.replace(/\s+/g, '');
  return compact.length;
}

function normalizeTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0))];
}

function normalizeNote(note?: string): string | undefined {
  const trimmedNote = note?.trim();
  return trimmedNote ? trimmedNote : undefined;
}

function throwIfAborted(options: IngestSourceOptions): void {
  if (!options.signal?.aborted) {
    return;
  }

  throw new IngestionError('入库已取消', {
    step: 'interrupt',
    source: options.source,
    cause: toAbortCause(options.signal.reason),
  });
}

function mapFetchError(source: string, error: unknown): IngestionError {
  if (isAbortError(error)) {
    return new IngestionError('入库已取消', {
      step: 'interrupt',
      source,
      cause: error,
    });
  }

  if (isFileNotFoundError(error)) {
    return new IngestionError('文件不存在，无法读取来源内容', {
      step: 'fetch',
      source,
      cause: error,
    });
  }

  return new IngestionError('读取来源内容失败', {
    step: 'fetch',
    source,
    cause: error,
  });
}

function isFileNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isAbortError(error: unknown): error is Error {
  return error instanceof Error && error.name === 'AbortError';
}

function toAbortCause(reason: unknown): Error | undefined {
  if (reason instanceof Error) {
    return reason;
  }

  if (typeof reason === 'string' && reason.length > 0) {
    return new Error(reason);
  }

  return undefined;
}

function emitProgress(options: IngestSourceOptions, event: Parameters<NonNullable<IngestSourceOptions['onProgress']>>[0]): void {
  options.onProgress?.(event);
}

function emitStepError(
  options: IngestSourceOptions,
  step: Parameters<NonNullable<IngestSourceOptions['onProgress']>>[0]['step'],
  detail: string,
  error: unknown,
): void {
  emitProgress(options, {
    step,
    status: 'error',
    detail,
    metadata: error instanceof Error ? { errorName: error.name, message: error.message } : undefined,
  });
}

/**
 * 尝试为刚入库的 chunks 生成 embeddings。
 * 失败时不抛异常（embedding 是增强功能，不应阻塞入库）。
 * 使用 5 秒超时避免模型下载阻塞入库流程。
 */
async function tryGenerateEmbeddings(
  provider: DatabaseProvider,
  knowledgeItemId: number,
  options: IngestSourceOptions,
): Promise<void> {
  try {
    const { tryGetEmbeddingProvider } = await import('../embedding/index.js');

    // 使用 AbortSignal 设置 5 秒超时
    const timeout = AbortSignal.timeout(5000);
    const embeddingProvider = await Promise.race([
      tryGetEmbeddingProvider(),
      new Promise<null>((_, reject) => {
        timeout.addEventListener('abort', () => reject(new Error('timeout')));
      }),
    ]);

    if (!embeddingProvider) return;

    const { VectorRepository } = await import('../../storage/repositories/vector-repository.js');

    const db = provider.getConnection();
    const vecRepo = new VectorRepository(provider);

    // 获取刚入库的 chunks
    const chunks = db
      .prepare('SELECT id, content FROM chunks WHERE knowledge_item_id = ?')
      .all(knowledgeItemId) as Array<{ id: number; content: string }>;

    if (chunks.length === 0) return;

    emitProgress(options, {
      step: 'embed',
      status: 'start',
      detail: `为 ${chunks.length} 个 chunk 生成 embedding`,
    });

    // 批量生成 embedding
    const BATCH_SIZE = 32;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const texts = batch.map((c) => c.content);
      const embeddings = await embeddingProvider.embed(texts);

      provider.transaction((txDb) => {
        vecRepo.insertMany(
          batch.map((chunk, idx) => ({
            chunkId: chunk.id,
            embedding: embeddings[idx],
          })),
          txDb,
        );
        vecRepo.markAsEmbedded(
          batch.map((c) => c.id),
          1,
          txDb,
        );
      });
    }

    emitProgress(options, {
      step: 'embed',
      status: 'complete',
      detail: `已为 ${chunks.length} 个 chunk 生成 embedding`,
    });
  } catch {
    // Embedding 失败不阻塞入库
    emitProgress(options, {
      step: 'embed',
      status: 'error',
      detail: 'embedding 生成失败（不影响入库结果）',
    });
  }
}
