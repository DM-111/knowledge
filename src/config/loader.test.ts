import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigError } from '../errors/index.js';
import { loadConfig } from './index.js';

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

describe('loadConfig', () => {
  it('按 CLI > ENV > project > user > default 优先级逐字段合并配置', () => {
    const root = createFixtureRoot('loader-priority');
    const homeDir = join(root, 'home');
    const cwd = join(root, 'workspace');
    mkdirSync(join(homeDir, '.config', 'kb'), { recursive: true });
    mkdirSync(cwd, { recursive: true });

    writeFileSync(
      join(homeDir, '.config', 'kb', 'config.yaml'),
      ['knowledgeBasePath: "/user/kb"', 'dbPath: "/user/kb/user.db"'].join('\n'),
    );
    writeFileSync(join(cwd, 'kb.config.yaml'), 'dbPath: "./project/project.db"\n');

    const loaded = loadConfig({
      cwd,
      homeDir,
      env: {
        KB_KNOWLEDGE_BASE_PATH: '/env/kb',
      },
      overrides: {
        dbPath: '/cli/knowledge.db',
      },
    });

    expect(loaded.config.knowledgeBasePath).toBe('/env/kb');
    expect(loaded.config.dbPath).toBe('/cli/knowledge.db');
    expect(loaded.sources.knowledgeBasePath).toBe('env');
    expect(loaded.sources.dbPath).toBe('cli');
  });

  it('在缺少 dbPath 时根据 knowledgeBasePath 推导并冻结结果', () => {
    const root = createFixtureRoot('loader-derived');
    const cwd = join(root, 'workspace');
    mkdirSync(cwd, { recursive: true });

    const loaded = loadConfig({
      cwd,
      homeDir: join(root, 'home'),
      overrides: {
        knowledgeBasePath: './knowledge-base',
      },
    });

    expect(loaded.config.knowledgeBasePath).toBe(join(cwd, 'knowledge-base'));
    expect(loaded.config.dbPath).toBe(join(cwd, 'knowledge-base', 'knowledge.db'));
    expect(loaded.sources.dbPath).toBe('derived');
    expect(Object.isFrozen(loaded.config)).toBe(true);
  });

  it('在 YAML 语法错误时抛出 ConfigError', () => {
    const root = createFixtureRoot('loader-yaml-error');
    const cwd = join(root, 'workspace');
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, 'kb.config.yaml'), 'knowledgeBasePath: [unterminated\n');

    expect(() =>
      loadConfig({
        cwd,
        homeDir: join(root, 'home'),
      }),
    ).toThrowError(ConfigError);
  });

  it('在出现未知字段时抛出 ConfigError', () => {
    const root = createFixtureRoot('loader-unknown-field');
    const cwd = join(root, 'workspace');
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, 'kb.config.yaml'), 'unknownField: true\n');

    expect(() =>
      loadConfig({
        cwd,
        homeDir: join(root, 'home'),
      }),
    ).toThrowError(ConfigError);
  });
});

function createFixtureRoot(prefix: string): string {
  const path = join(tmpdir(), `knowledge-${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  cleanupPaths.push(path);
  return path;
}
