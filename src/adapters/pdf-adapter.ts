import { execa } from 'execa';
import { basename, extname, join } from 'node:path';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { IngestionAdapter, IngestOptions } from '../core/ingestion/adapter.js';
import type { ContentMetadata, RawContent } from '../core/types.js';

export class PdfAdapter implements IngestionAdapter {
  readonly sourceType = 'pdf' as const;

  canHandle(source: string): boolean {
    return extname(source).toLowerCase() === '.pdf';
  }

  async ingest(source: string, options?: IngestOptions): Promise<RawContent> {
    options?.onProgress?.({
      step: 'fetch',
      status: 'start',
      detail: `正在转换 PDF: ${source}`,
    });

    const outputDir = await mkdtemp(join(tmpdir(), 'kb-pdf-'));

    try {
      await execa('marker_single', [
        source,
        '--output_dir', outputDir,
        '--output_format', 'markdown',
        '--disable_image_extraction',
      ], {
        cancelSignal: options?.signal,
        timeout: 600_000, // PDFs can take a while; first run downloads ~1.5GB models
      });
    } catch (error) {
      await rm(outputDir, { recursive: true, force: true }).catch(() => {});
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('ENOENT') || message.includes('not found')) {
        throw new Error(
          'marker_single 未安装。请运行: pipx install marker-pdf',
        );
      }
      throw new Error(`marker 转换 PDF 失败: ${message}`);
    }

    // Find the output markdown file
    const markdown = await this.findAndReadMarkdown(outputDir);

    // Clean up temp directory
    await rm(outputDir, { recursive: true, force: true }).catch(() => {});

    if (!markdown.trim()) {
      throw new Error(`marker 未能从 ${source} 提取到有效内容`);
    }

    const title = extractTitleFromMarkdown(markdown) || basename(source, '.pdf');

    const metadata: ContentMetadata = {};
    // marker doesn't reliably extract metadata, but we record the source
    // Future: could use pdfinfo or similar for page count, author, etc.

    options?.onProgress?.({
      step: 'fetch',
      status: 'complete',
      detail: `已转换: ${title}`,
    });

    return {
      title,
      sourceType: 'pdf',
      sourcePath: source,
      markdown,
      createdAt: new Date().toISOString(),
      metadata,
    };
  }

  private async findAndReadMarkdown(outputDir: string): Promise<string> {
    // marker_single outputs to a subdirectory named after the PDF
    // Structure: outputDir/<pdf-name>/<pdf-name>.md
    const entries = await readdir(outputDir, { withFileTypes: true });

    // First, look for .md files directly in output dir
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        return readFile(join(outputDir, entry.name), 'utf8');
      }
    }

    // Then, look in subdirectories
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subEntries = await readdir(join(outputDir, entry.name));
        for (const subEntry of subEntries) {
          if (subEntry.endsWith('.md')) {
            return readFile(join(outputDir, entry.name, subEntry), 'utf8');
          }
        }
      }
    }

    throw new Error(`marker 输出目录中未找到 .md 文件: ${outputDir}`);
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
