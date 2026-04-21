import { describe, expect, it } from 'vitest';
import { createIngestProgressRenderer } from './ingest-progress.js';

describe('ingest progress renderer', () => {
  it('按固定顺序渲染步骤状态，并在结束时补换行', () => {
    const chunks: string[] = [];
    const renderer = createIngestProgressRenderer({
      write(chunk: string) {
        chunks.push(chunk);
      },
    });

    renderer.render({
      step: 'fetch',
      status: 'start',
      detail: '读取 sample.md',
    });
    renderer.render({
      step: 'fetch',
      status: 'complete',
      detail: '已读取 sample.md',
    });
    renderer.finish();

    const output = stripTerminalControl(chunks.join(''));
    expect(output).toContain('[x] 读取文件');
    expect(output.indexOf('选择适配器')).toBeLessThan(output.indexOf('读取文件'));
    expect(output.indexOf('读取文件')).toBeLessThan(output.indexOf('内容清洗'));
    expect(output.endsWith('\n')).toBe(true);
  });

  it('在 error 事件时标记失败步骤', () => {
    const chunks: string[] = [];
    const renderer = createIngestProgressRenderer({
      write(chunk: string) {
        chunks.push(chunk);
      },
    });

    renderer.render({
      step: 'store',
      status: 'error',
      detail: '存储入库失败',
    });

    const output = stripTerminalControl(chunks.join(''));
    expect(output).toContain('[!] 存储入库');
    expect(output).toContain('存储入库失败');
  });

  it('会净化 detail 中的换行与控制序列，避免破坏单行渲染', () => {
    const chunks: string[] = [];
    const renderer = createIngestProgressRenderer({
      write(chunk: string) {
        chunks.push(chunk);
      },
    });

    renderer.render({
      step: 'fetch',
      status: 'start',
      detail: '读取 sample.md\n第二行\u001B[31m红色\u001B[0m',
    });
    renderer.finish();

    const output = stripTerminalControl(chunks.join(''));
    expect(output).toContain('读取 sample.md 第二行红色');
    expect(output).not.toContain('\n第二行');
  });
});

function stripTerminalControl(value: string): string {
  return value.replace(/\u001B\[[0-9;]*[A-Za-z]/g, '');
}
