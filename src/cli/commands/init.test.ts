import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigError } from '../../errors/index.js';
import { runInitFlow } from './init.js';

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

describe('runInitFlow', () => {
  it('首次初始化时通过交互写入配置并自动完成数据库初始化', async () => {
    const homeDir = createTempPath('init-home');
    const cwd = createTempPath('init-workspace');
    const knowledgeBasePath = join(cwd, 'knowledge-base');
    const dbPath = join(knowledgeBasePath, 'knowledge.db');

    const prompts = {
      input: vi
        .fn<(_options: { message: string; default?: string }) => Promise<string>>()
        .mockResolvedValueOnce(knowledgeBasePath)
        .mockResolvedValueOnce(dbPath),
      confirm: vi.fn<(_options: { message: string; default?: boolean }) => Promise<boolean>>(),
    };

    const result = await runInitFlow({
      cwd,
      homeDir,
      isInteractive: true,
      prompts,
    });

    expect(result.saved).toBe(true);
    expect(readFileSync(result.configPath, 'utf8')).toContain(`knowledgeBasePath: ${knowledgeBasePath}`);

    const connection = new Database(dbPath, { readonly: true });
    const version = connection.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined;
    const tables = connection
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;

    expect(version?.user_version).toBe(3);
    expect(tables.map((table) => table.name)).toContain('knowledge_items');
    expect(tables.map((table) => table.name)).toContain('chunks');
    expect(tables.map((table) => table.name)).toContain('chunks_fts');
    expect(tables.map((table) => table.name)).toContain('tags');

    connection.close();
  });

  it('交互式输入相对路径时会在写入配置前归一化为绝对路径', async () => {
    const homeDir = createTempPath('init-relative-home');
    const cwd = createTempPath('init-relative-workspace');
    const prompts = {
      input: vi
        .fn<(_options: { message: string; default?: string }) => Promise<string>>()
        .mockResolvedValueOnce('./knowledge-base')
        .mockResolvedValueOnce('./knowledge-base/knowledge.db'),
      confirm: vi.fn<(_options: { message: string; default?: boolean }) => Promise<boolean>>(),
    };

    const result = await runInitFlow({
      cwd,
      homeDir,
      isInteractive: true,
      prompts,
    });

    expect(result.config.knowledgeBasePath).toBe(join(cwd, 'knowledge-base'));
    expect(result.config.dbPath).toBe(join(cwd, 'knowledge-base', 'knowledge.db'));
    expect(readFileSync(result.configPath, 'utf8')).toContain(`knowledgeBasePath: ${join(cwd, 'knowledge-base')}`);
  });

  it('已有配置且用户拒绝覆盖时保持现状不变', async () => {
    const homeDir = createTempPath('init-existing-home');
    const cwd = createTempPath('init-existing-workspace');
    const knowledgeBasePath = join(cwd, 'existing-kb');
    const dbPath = join(knowledgeBasePath, 'existing.db');
    const configPath = join(homeDir, '.config', 'kb', 'config.yaml');

    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(join(homeDir, '.config', 'kb'), { recursive: true });
    writeFileSync(
      configPath,
      [`knowledgeBasePath: ${knowledgeBasePath}`, `dbPath: ${dbPath}`, ''].join('\n'),
      'utf8',
    );

    const before = readFileSync(configPath, 'utf8');

    const result = await runInitFlow({
      cwd,
      homeDir,
      isInteractive: true,
      prompts: {
        input: vi.fn(),
        confirm: vi.fn().mockResolvedValue(false),
      },
    });

    expect(result.saved).toBe(false);
    expect(readFileSync(configPath, 'utf8')).toBe(before);
  });

  it('数据库初始化失败时不会留下坏的用户配置文件', async () => {
    const homeDir = createTempPath('init-failed-storage-home');
    const cwd = createTempPath('init-failed-storage-workspace');
    const configPath = join(homeDir, '.config', 'kb', 'config.yaml');
    const prompts = {
      input: vi
        .fn<(_options: { message: string; default?: string }) => Promise<string>>()
        .mockResolvedValueOnce(join(cwd, 'knowledge-base'))
        .mockResolvedValueOnce('/dev/null/knowledge.db'),
      confirm: vi.fn<(_options: { message: string; default?: boolean }) => Promise<boolean>>(),
    };

    await expect(
      runInitFlow({
        cwd,
        homeDir,
        isInteractive: true,
        prompts,
      }),
    ).rejects.toThrow();

    expect(() => readFileSync(configPath, 'utf8')).toThrow();
  });

  it('非交互环境下缺少必要配置时抛出 ConfigError', async () => {
    const homeDir = createTempPath('init-non-tty-home');
    const cwd = createTempPath('init-non-tty-workspace');

    await expect(
      runInitFlow({
        cwd,
        homeDir,
        isInteractive: false,
      }),
    ).rejects.toBeInstanceOf(ConfigError);
  });
});

function createTempPath(prefix: string): string {
  const value = join(tmpdir(), `knowledge-${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  cleanupPaths.push(value);
  return value;
}
