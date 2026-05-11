import { IngestionError } from '../errors/index.js';
import { extname } from 'node:path';
import type { IngestionAdapter } from '../core/ingestion/adapter.js';
import { UrlAdapter } from './url-adapter.js';
import { EpubAdapter } from './epub-adapter.js';
import { PdfAdapter } from './pdf-adapter.js';
import { MarkdownAdapter, SUPPORTED_MARKDOWN_EXTENSIONS } from './markdown-adapter.js';

const INGESTION_ADAPTERS: readonly IngestionAdapter[] = [
  new UrlAdapter(),
  new EpubAdapter(),
  new PdfAdapter(),
  new MarkdownAdapter(),
];

const SUPPORTED_FORMATS = [
  'URL (http/https)',
  '.epub / .mobi / .azw3',
  '.pdf',
  ...SUPPORTED_MARKDOWN_EXTENSIONS,
].join('、');

export function getIngestionAdapters(): readonly IngestionAdapter[] {
  return INGESTION_ADAPTERS;
}

export function resolveIngestionAdapter(source: string): IngestionAdapter {
  const adapter = INGESTION_ADAPTERS.find((candidate) => candidate.canHandle(source));

  if (!adapter) {
    const extension = extname(source).toLowerCase() || '<无扩展名>';
    throw new IngestionError(
      `不支持的来源类型 ${extension}，当前支持的格式：${SUPPORTED_FORMATS}`,
      {
      step: 'resolve-adapter',
      source,
      exitCode: 2,
    },
    );
  }

  return adapter;
}
