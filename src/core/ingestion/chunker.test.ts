import { describe, expect, it } from 'vitest';
import { chunkMarkdownContent } from './chunker.js';

describe('chunkMarkdownContent', () => {
  it('按标题与段落切分并记录原文位置', () => {
    const content = ['# 第一节', '', '第一段。', '', '## 第二节', '', '第二段。', '', '第三段。', ''].join('\n');

    const chunks = chunkMarkdownContent(content);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toMatchObject({
      heading: '# 第一节',
      content: '第一段。',
      startOffset: content.indexOf('第一段。'),
    });
    expect(chunks[1]).toMatchObject({
      heading: '## 第二节',
      content: '第二段。',
      startOffset: content.indexOf('第二段。'),
    });
    expect(chunks[2]).toMatchObject({
      heading: '## 第二节',
      content: '第三段。',
      startOffset: content.indexOf('第三段。'),
    });
  });

  it('为相邻 chunk 保留前一段的重叠窗口', () => {
    const content = ['# 标题', '', '第一段内容。', '', '第二段内容。', ''].join('\n');

    const chunks = chunkMarkdownContent(content, {
      overlapParagraphs: 1,
    });

    expect(chunks).toHaveLength(2);
    expect(chunks[1]?.overlap).toBe('第一段内容。');
  });

  it('为重叠窗口记录原文 offset 范围', () => {
    const content = ['# 标题', '', '第一段内容。', '', '第二段内容。', ''].join('\n');

    const chunks = chunkMarkdownContent(content, {
      overlapParagraphs: 1,
    });

    expect(chunks[1]?.overlapStartOffset).toBe(content.indexOf('第一段内容。'));
    expect(chunks[1]?.overlapEndOffset).toBe(content.indexOf('第一段内容。') + '第一段内容。'.length);
  });
});
