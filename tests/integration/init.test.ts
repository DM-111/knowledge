import { existsSync, readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execa } from 'execa';

const cleanupPaths: string[] = [];

afterEach(async () => {
  const { rmSync } = await import('node:fs');

  while (cleanupPaths.length > 0) {
    const target = cleanupPaths.pop();
    if (target) {
      rmSync(target, { recursive: true, force: true });
    }
  }
});

describe('kb init integration', () => {
  it('在提供完整参数时可非交互完成初始化并自动建库', async () => {
    const homeDir = createTempPath('integration-home');
    const cwd = createTempPath('integration-workspace');
    const knowledgeBasePath = join(cwd, 'knowledge-base');
    const dbPath = join(knowledgeBasePath, 'knowledge.db');

    const result = await execa(
      'node',
      [
        '--import',
        'tsx',
        'src/cli/main.ts',
        'init',
        '--knowledge-base-path',
        knowledgeBasePath,
        '--db-path',
        dbPath,
      ],
      {
        cwd: process.cwd(),
        env: {
          HOME: homeDir,
        },
        reject: false,
      },
    );

    expect(result.exitCode).toBe(0);

    const configPath = join(homeDir, '.config', 'kb', 'config.yaml');
    expect(existsSync(configPath)).toBe(true);
    expect(readFileSync(configPath, 'utf8')).toContain(`dbPath: ${dbPath}`);

    const connection = new Database(dbPath, { readonly: true });
    const version = connection.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined;

    expect(version?.user_version).toBe(3);

    connection.close();
  });

  it('已有配置时在非 TTY 环境拒绝覆盖并提示重新交互执行', async () => {
    const homeDir = createTempPath('integration-existing-home');
    const cwd = createTempPath('integration-existing-workspace');
    const knowledgeBasePath = join(cwd, 'knowledge-base');
    const dbPath = join(knowledgeBasePath, 'knowledge.db');
    const configDir = join(homeDir, '.config', 'kb');
    const configPath = join(configDir, 'config.yaml');

    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(configPath, [`knowledgeBasePath: ${knowledgeBasePath}`, `dbPath: ${dbPath}`, ''].join('\n'));

    const result = await execa(
      'node',
      [
        '--import',
        'tsx',
        'src/cli/main.ts',
        'init',
        '--knowledge-base-path',
        knowledgeBasePath,
        '--db-path',
        dbPath,
      ],
      {
        cwd: process.cwd(),
        env: {
          HOME: homeDir,
        },
        reject: false,
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('ConfigError');
    expect(result.stderr).toContain('非交互环境');
  });
});

function createTempPath(prefix: string): string {
  const value = join(tmpdir(), `knowledge-${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  cleanupPaths.push(value);
  return value;
}
