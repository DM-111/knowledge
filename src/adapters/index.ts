import { IngestionError } from '../errors/index.js';
import type { IngestionAdapter } from '../core/ingestion/adapter.js';
import { MarkdownAdapter } from './markdown-adapter.js';

const INGESTION_ADAPTERS: readonly IngestionAdapter[] = [new MarkdownAdapter()];

export function getIngestionAdapters(): readonly IngestionAdapter[] {
  return INGESTION_ADAPTERS;
}

export function resolveIngestionAdapter(source: string): IngestionAdapter {
  const adapter = INGESTION_ADAPTERS.find((candidate) => candidate.canHandle(source));

  if (!adapter) {
    throw new IngestionError('未找到可处理该来源的入库 adapter', {
      step: 'resolve-adapter',
      source,
    });
  }

  return adapter;
}
