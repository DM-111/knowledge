import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type { IngestionAdapter, IngestOptions } from '../core/ingestion/adapter.js';
import type { RawContent } from '../core/types.js';

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdx']);

export class MarkdownAdapter implements IngestionAdapter {
  readonly sourceType = 'local-markdown' as const;

  canHandle(source: string): boolean {
    return MARKDOWN_EXTENSIONS.has(extname(source).toLowerCase());
  }

  async ingest(source: string, _options?: IngestOptions): Promise<RawContent> {
    const content = await readFile(source, 'utf8');

    return {
      title: extractTitle(content, source),
      sourceType: this.sourceType,
      sourcePath: source,
      markdown: normalizeContent(content),
      createdAt: new Date().toISOString(),
    };
  }
}

function extractTitle(content: string, source: string): string {
  const headingLine = content
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^#{1,6}\s+/.test(line));

  if (headingLine) {
    return headingLine.replace(/^#{1,6}\s+/, '').trim();
  }

  return basename(source, extname(source));
}

function normalizeContent(content: string): string {
  return content.replace(/\r\n/g, '\n').trim();
}
