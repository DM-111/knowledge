import { execa } from 'execa';
import { afterEach, describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const cleanupPaths: string[] = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    const target = cleanupPaths.pop();
    if (target) {
      rmSync(target, { recursive: true, force: true });
    }
  }
});

describe('cli errors', () => {
  it('returns exit code 2 for unknown commands', async () => {
    const result = await execa('node', ['--import', 'tsx', 'src/cli/main.ts', 'foo'], {
      reject: false,
    });

    expect(result.exitCode).toBe(2);
    expect(`${result.stdout}\n${result.stderr}`).toContain('help');
  });

  it('list 命令传入非法日期时退出码为 1 并报告 SearchError', async () => {
    const homeDir = createTempPath('cli-errors-baddate-home');
    const configDir = join(homeDir, '.config', 'kb');
    const dbDir = createTempPath('cli-errors-baddate-db');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'config.yaml'),
      [`knowledgeBasePath: "${dbDir}"`, `dbPath: "${join(dbDir, 'knowledge.db')}"`, ''].join('\n'),
    );

    const result = await execa(
      'node',
      ['--import', 'tsx', 'src/cli/main.ts', 'list', '--after', 'not-a-date'],
      {
        cwd: process.cwd(),
        env: { HOME: homeDir },
        reject: false,
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('SearchError');
  });

  it('list --json 在输入错误时返回结构化错误对象', async () => {
    const homeDir = createTempPath('cli-errors-json-baddate-home');
    const configDir = join(homeDir, '.config', 'kb');
    const dbDir = createTempPath('cli-errors-json-baddate-db');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'config.yaml'),
      [`knowledgeBasePath: "${dbDir}"`, `dbPath: "${join(dbDir, 'knowledge.db')}"`, ''].join('\n'),
    );

    const result = await execa(
      'node',
      ['--import', 'tsx', 'src/cli/main.ts', 'list', '--json', '--after', 'not-a-date'],
      {
        cwd: process.cwd(),
        env: { HOME: homeDir },
        reject: false,
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).not.toMatch(/\u001B\[[0-9;]*m/);
    expect(JSON.parse(result.stderr)).toEqual({
      error: {
        type: 'SearchError',
        message: expect.stringContaining('not-a-date'),
        step: 'search',
        source: 'listKnowledgeItems',
      },
    });
  });

  it('未知命令在 --json 下保持退出码 2 并返回结构化错误', async () => {
    const result = await execa('node', ['--import', 'tsx', 'src/cli/main.ts', 'foo', '--json'], {
      reject: false,
    });

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({
      error: {
        type: 'CommanderError',
        message: expect.any(String),
        step: 'command',
      },
    });
  });

  it('list 命令在配置就绪且库为空时返回稳定结果', async () => {
    const homeDir = createTempPath('cli-errors-home');
    const configDir = join(homeDir, '.config', 'kb');
    const dbDir = createTempPath('cli-errors-db');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'config.yaml'),
      [`knowledgeBasePath: "${dbDir}"`, `dbPath: "${join(dbDir, 'knowledge.db')}"`, ''].join('\n'),
    );

    const result = await execa('node', ['--import', 'tsx', 'src/cli/main.ts', 'list'], {
      cwd: process.cwd(),
      env: {
        HOME: homeDir,
      },
      reject: false,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('未找到匹配条目');
    expect(result.stdout).toContain('共 0 条，当前展示 0 条');
  });
});

function createTempPath(prefix: string): string {
  const value = join(tmpdir(), `knowledge-${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  cleanupPaths.push(value);
  return value;
}
