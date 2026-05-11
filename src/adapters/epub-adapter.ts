import { execa } from 'execa';
import { basename, extname } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IngestionAdapter, IngestOptions } from '../core/ingestion/adapter.js';
import type { ContentMetadata, RawContent } from '../core/types.js';

const EPUB_EXTENSIONS = new Set(['.epub']);
const EBOOK_EXTENSIONS = new Set(['.mobi', '.azw3', '.azw', '.kfx']);

export class EpubAdapter implements IngestionAdapter {
  readonly sourceType = 'epub' as const;

  canHandle(source: string): boolean {
    const ext = extname(source).toLowerCase();
    return EPUB_EXTENSIONS.has(ext) || EBOOK_EXTENSIONS.has(ext);
  }

  async ingest(source: string, options?: IngestOptions): Promise<RawContent> {
    const ext = extname(source).toLowerCase();
    let epubPath = source;

    // If it's a mobi/azw format, convert to epub first via calibre
    if (EBOOK_EXTENSIONS.has(ext)) {
      options?.onProgress?.({
        step: 'fetch',
        status: 'start',
        detail: `正在转换 ${ext} 为 EPUB 格式`,
      });

      const tmpDir = await mkdtemp(join(tmpdir(), 'kb-ebook-'));
      epubPath = join(tmpDir, `${basename(source, ext)}.epub`);

      try {
        await execa('ebook-convert', [source, epubPath], {
          cancelSignal: options?.signal,
          timeout: 120_000,
        });
      } catch (error) {
        await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('ENOENT') || message.includes('not found')) {
          throw new Error(
            'ebook-convert 未安装。请运行: brew install --cask calibre',
          );
        }
        throw new Error(`ebook-convert 转换失败: ${message}`);
      }

      options?.onProgress?.({
        step: 'fetch',
        status: 'progress',
        detail: `已转换为 EPUB: ${epubPath}`,
      });
    } else {
      options?.onProgress?.({
        step: 'fetch',
        status: 'start',
        detail: `正在解析 EPUB: ${source}`,
      });
    }

    // Convert epub to markdown via pandoc
    let markdown: string;

    try {
      const result = await execa('pandoc', [
        epubPath,
        '-t', 'markdown',
        '--wrap=none',
      ], {
        cancelSignal: options?.signal,
        timeout: 120_000,
      });
      markdown = result.stdout;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('ENOENT') || message.includes('not found')) {
        throw new Error('pandoc 未安装。请运行: brew install pandoc');
      }
      throw new Error(`pandoc 转换失败: ${message}`);
    }

    // Extract metadata via pandoc
    const metadata = await this.extractMetadata(epubPath, options);

    // Clean up converted epub if we created one
    if (epubPath !== source) {
      const tmpDir = join(epubPath, '..');
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }

    // Clean pandoc output
    markdown = cleanPandocMarkdown(markdown);

    // Prefer metadata title > first heading > filename
    const title = (metadata as { _title?: string })._title
      || extractTitleFromMarkdown(markdown)
      || basename(source, ext);

    // Remove internal _title field
    delete (metadata as { _title?: string })._title;

    options?.onProgress?.({
      step: 'fetch',
      status: 'complete',
      detail: `已解析: ${title}`,
    });

    return {
      title,
      sourceType: 'epub',
      sourcePath: source,
      markdown,
      createdAt: new Date().toISOString(),
      metadata,
    };
  }

  private async extractMetadata(
    epubPath: string,
    options?: IngestOptions,
  ): Promise<ContentMetadata & { _title?: string }> {
    const metadata: ContentMetadata & { _title?: string } = {};

    try {
      // pandoc can extract metadata as JSON
      const { stdout } = await execa('pandoc', [
        epubPath,
        '--metadata-json',
        '-t', 'plain',
        '-o', '/dev/null',
      ], {
        cancelSignal: options?.signal,
        timeout: 30_000,
        reject: false,
      });

      // Try alternative: read metadata from pandoc's standalone output
      const { stdout: standaloneOut } = await execa('pandoc', [
        epubPath,
        '-t', 'markdown',
        '--standalone',
        '--wrap=none',
      ], {
        cancelSignal: options?.signal,
        timeout: 60_000,
      });

      // Parse YAML frontmatter from standalone output
      const frontmatterMatch = standaloneOut.match(/^---\n([\s\S]*?)\n---/);
      if (frontmatterMatch) {
        const yaml = frontmatterMatch[1];
        const titleMatch = yaml.match(/^title:\s*['"]?(.+?)['"]?\s*$/m);
        const authorMatch = yaml.match(/^author:\s*['"]?(.+?)['"]?\s*$/m);
        const dateMatch = yaml.match(/^date:\s*['"]?(.+?)['"]?\s*$/m);
        const langMatch = yaml.match(/^lang:\s*['"]?(.+?)['"]?\s*$/m);

        if (titleMatch) metadata._title = titleMatch[1].trim();
        if (authorMatch) metadata.author = authorMatch[1].trim();
        if (dateMatch) metadata.publishedDate = dateMatch[1].trim();
        if (langMatch) metadata.language = langMatch[1].trim();
      }
    } catch {
      // Metadata extraction is best-effort
    }

    return metadata;
  }
}

function extractTitleFromMarkdown(content: string): string | undefined {
  const headingLine = content
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^#{1}\s+/.test(line));

  if (headingLine) {
    return headingLine.replace(/^#\s+/, '').trim();
  }

  return undefined;
}

function cleanPandocMarkdown(markdown: string): string {
  return markdown
    // Remove pandoc div markers
    .replace(/^:::\s*\{[^}]*\}\s*$/gm, '')
    .replace(/^:::\s*$/gm, '')
    // Collapse excessive blank lines (3+ → 2)
    .replace(/\n{4,}/g, '\n\n\n')
    // Remove leading/trailing whitespace
    .trim();
}
