import { IngestionError } from '../errors/index.js';
import { extname } from 'node:path';
import type { IngestionAdapter } from '../core/ingestion/adapter.js';
import { MarkdownAdapter, SUPPORTED_MARKDOWN_EXTENSIONS } from './markdown-adapter.js';

const INGESTION_ADAPTERS: readonly IngestionAdapter[] = [new MarkdownAdapter()];

export function getIngestionAdapters(): readonly IngestionAdapter[] {
  return INGESTION_ADAPTERS;
}

export function resolveIngestionAdapter(source: string): IngestionAdapter {
  const adapter = INGESTION_ADAPTERS.find((candidate) => candidate.canHandle(source));

  if (!adapter) {
    const extension = extname(source).toLowerCase() || '<无扩展名>';
    throw new IngestionError(
      `不支持的文件类型 ${extension}，当前支持的 Markdown 扩展名：${SUPPORTED_MARKDOWN_EXTENSIONS.join('、')}`,
      {
      step: 'resolve-adapter',
      source,
      exitCode: 2,
    },
    );
  }

  return adapter;
}
