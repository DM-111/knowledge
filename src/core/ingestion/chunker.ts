import type { ChunkDraft } from '../types.js';

export interface ChunkMarkdownContentOptions {
  overlapParagraphs?: number;
}

export function chunkMarkdownContent(
  content: string,
  options: ChunkMarkdownContentOptions = {},
): ChunkDraft[] {
  const overlapParagraphs = options.overlapParagraphs ?? 0;
  const lines = content.split('\n');
  const chunks: ChunkDraft[] = [];

  let offset = 0;
  let currentHeading: string | undefined;
  let paragraphLines: string[] = [];
  let paragraphStartOffset = -1;

  const flushParagraph = (): void => {
    const paragraph = paragraphLines.join('\n').trim();

    if (!paragraph) {
      paragraphLines = [];
      paragraphStartOffset = -1;
      return;
    }

    const previousChunks = chunks.slice(Math.max(0, chunks.length - overlapParagraphs));
    const overlapStartOffset = previousChunks[0]?.startOffset ?? 0;
    const overlapEndOffset = previousChunks.at(-1)?.endOffset ?? 0;
    chunks.push({
      heading: currentHeading,
      content: paragraph,
      overlap: previousChunks.map((chunk) => chunk.content).join('\n\n') || undefined,
      startOffset: paragraphStartOffset,
      endOffset: paragraphStartOffset + paragraph.length,
      overlapStartOffset,
      overlapEndOffset,
    });

    paragraphLines = [];
    paragraphStartOffset = -1;
  };

  for (const line of lines) {
    const lineStartOffset = offset;
    offset += line.length + 1;

    if (/^\s*#{1,6}\s+/.test(line)) {
      flushParagraph();
      currentHeading = line.trim();
      continue;
    }

    if (line.trim().length === 0) {
      flushParagraph();
      continue;
    }

    if (paragraphStartOffset === -1) {
      paragraphStartOffset = lineStartOffset;
    }

    paragraphLines.push(line);
  }

  flushParagraph();

  return chunks;
}
