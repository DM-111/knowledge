import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MarkdownAdapter } from './markdown-adapter.js';

const cleanupPaths: string[] = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    const target = cleanupPaths.pop();
    if (target) {
      rmSync(target, { recursive: true, force: true });
    }
  }
});

describe('MarkdownAdapter', () => {
  it('处理 markdown 文件并提取首个 heading 作为标题', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'knowledge-markdown-adapter-'));
    cleanupPaths.push(workspace);
    const filePath = join(workspace, 'article.md');
    writeFileSync(filePath, '# 文章标题\n\n第一段内容。\n\n第二段内容。');

    const adapter = new MarkdownAdapter();
    const result = await adapter.ingest(filePath);

    expect(adapter.canHandle(filePath)).toBe(true);
    expect(adapter.canHandle(join(workspace, 'article.txt'))).toBe(false);
    expect(result.title).toBe('文章标题');
    expect(result.sourceType).toBe('local-markdown');
    expect(result.sourcePath).toBe(filePath);
    expect(result.markdown).toContain('第一段内容');
    expect(new Date(result.createdAt).toString()).not.toBe('Invalid Date');
  });

  it('在没有 heading 时回退到文件名作为标题', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'knowledge-markdown-adapter-fallback-'));
    cleanupPaths.push(workspace);
    const filePath = join(workspace, 'plain-note.md');
    writeFileSync(filePath, '没有标题\n\n只有正文。');

    const adapter = new MarkdownAdapter();
    const result = await adapter.ingest(filePath);

    expect(result.title).toBe('plain-note');
  });
});
