import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommanderError } from 'commander';
import { handleCliError } from './index.js';
import { IngestionError } from '../errors/index.js';

const originalExitCode = process.exitCode;
const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

afterEach(() => {
  process.exitCode = originalExitCode;
  stderrSpy.mockClear();
});

describe('handleCliError', () => {
  it('保留 Commander 未知命令的退出码 2', () => {
    handleCliError(new CommanderError(1, 'commander.unknownCommand', 'unknown command'));

    expect(process.exitCode).toBe(2);
    expect(stderrSpy).toHaveBeenCalledWith('unknown command\n');
  });

  it('对输入不合法的 KbError 使用退出码 2', () => {
    handleCliError(
      new IngestionError('不支持的文件类型 .png，当前支持的 Markdown 扩展名：.md、.markdown、.mdx', {
        step: 'resolve-adapter',
        source: '/tmp/image.png',
        exitCode: 2,
      }),
    );

    expect(process.exitCode).toBe(2);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('不支持的文件类型 .png，当前支持的 Markdown 扩展名：.md、.markdown、.mdx\n'),
    );
  });

  it('对运行期失败的 KbError 维持退出码 1', () => {
    handleCliError(
      new IngestionError('文件不存在，无法读取来源内容', {
        step: 'fetch',
        source: '/tmp/missing.md',
      }),
    );

    expect(process.exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('step: fetch\n'));
  });
});
