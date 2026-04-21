import { readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeUserConfig } from './index.js';

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

describe('writeUserConfig', () => {
  it('将用户配置写入 ~/.config/kb/config.yaml 并设置 0600 权限', () => {
    const homeDir = createTempPath('writer-home');

    const result = writeUserConfig(
      {
        knowledgeBasePath: '/tmp/knowledge-base',
        dbPath: '/tmp/knowledge-base/knowledge.db',
      },
      { homeDir },
    );

    expect(result.configPath).toBe(join(homeDir, '.config', 'kb', 'config.yaml'));
    expect(readFileSync(result.configPath, 'utf8')).toContain('knowledgeBasePath: /tmp/knowledge-base');
    expect(readFileSync(result.configPath, 'utf8')).toContain('dbPath: /tmp/knowledge-base/knowledge.db');
    expect(statSync(result.configPath).mode & 0o777).toBe(0o600);
  });
});

function createTempPath(prefix: string): string {
  const value = join(tmpdir(), `knowledge-${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  cleanupPaths.push(value);
  return value;
}
