import { execa } from 'execa';
import type { IngestionAdapter, IngestOptions } from '../core/ingestion/adapter.js';
import type { ContentMetadata, RawContent } from '../core/types.js';

const URL_PATTERN = /^https?:\/\/.+/i;

interface DefuddleJsonOutput {
  title?: string;
  content?: string;
  author?: string;
  published?: string;
  domain?: string;
  siteName?: string;
  description?: string;
  wordCount?: number;
}

export class UrlAdapter implements IngestionAdapter {
  readonly sourceType = 'web' as const;

  canHandle(source: string): boolean {
    return URL_PATTERN.test(source.trim());
  }

  async ingest(source: string, options?: IngestOptions): Promise<RawContent> {
    const url = source.trim();

    options?.onProgress?.({
      step: 'fetch',
      status: 'start',
      detail: `正在抓取 ${url}`,
    });

    let stdout: string;

    try {
      const result = await execa('defuddle', ['parse', url, '--json', '--markdown'], {
        cancelSignal: options?.signal,
        timeout: 30_000,
      });
      stdout = result.stdout;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`defuddle 抓取失败: ${message}`);
    }

    let parsed: DefuddleJsonOutput;

    try {
      parsed = JSON.parse(stdout);
    } catch {
      throw new Error('defuddle 返回的 JSON 格式无效');
    }

    const markdown = parsed.content?.trim();

    if (!markdown) {
      throw new Error(`defuddle 未能从 ${url} 提取到有效内容`);
    }

    const title = parsed.title || new URL(url).hostname;

    const metadata: ContentMetadata = {};
    if (parsed.author) metadata.author = parsed.author;
    if (parsed.published) metadata.publishedDate = parsed.published;
    if (parsed.domain) metadata.domain = parsed.domain;
    if (parsed.siteName) metadata.siteName = parsed.siteName;
    if (parsed.description) metadata.description = parsed.description;
    metadata.url = url;

    options?.onProgress?.({
      step: 'fetch',
      status: 'complete',
      detail: `已抓取: ${title}`,
    });

    return {
      title,
      sourceType: 'web',
      sourcePath: url,
      markdown,
      createdAt: new Date().toISOString(),
      metadata,
    };
  }
}
