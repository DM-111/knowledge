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
import type { ChunkDraft, IngestResult } from '../types.js';
import { chunkMarkdownContent } from './chunker.js';
import type { IngestOptions } from './adapter.js';

export interface IngestSourceOptions extends IngestOptions {
  source: string;
  dbPath: string;
  tags?: string[];
  note?: string;
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

  emitProgress(options, {
    step: 'fetch',
    status: 'start',
    detail: `读取 ${options.source}`,
  });

  let rawContent: Awaited<ReturnType<typeof adapter.ingest>>;

  try {
    rawContent = await adapter.ingest(options.source, options);
  } catch (error) {
    const ingestionError = new IngestionError('读取来源内容失败', {
      step: 'fetch',
      source: options.source,
      cause: error,
    });
    emitStepError(options, 'fetch', '读取文件失败', ingestionError);
    throw ingestionError;
  }

  emitProgress(options, {
    step: 'fetch',
    status: 'complete',
    detail: `已读取 ${options.source}`,
  });

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
      const itemId = knowledgeItemRepository.create(
        {
          title: rawContent.title,
          sourceType: rawContent.sourceType,
          sourcePath: rawContent.sourcePath,
          content: normalizedMarkdown,
          wordCount,
          createdAt: rawContent.createdAt,
          note: normalizedNote,
        },
        db,
      );

      chunkRepository.createMany(itemId, toChunkInputs(chunkDrafts), db);
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

  return {
    title: rawContent.title,
    sourcePath: rawContent.sourcePath,
    wordCount,
    chunkCount: chunkDrafts.length,
    knowledgeItemId,
    tags: normalizedTags,
    note: normalizedNote,
  };
}

function toChunkInputs(chunkDrafts: readonly ChunkDraft[]) {
  return chunkDrafts.map((chunk, chunkIndex) => ({
    chunkIndex,
    content: chunk.overlap ? `${chunk.overlap}\n\n${chunk.content}` : chunk.content,
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
