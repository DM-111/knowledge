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

  it('formats KbError failures from placeholder commands after config preflight', async () => {
    const homeDir = createTempPath('cli-errors-home');
    const configDir = join(homeDir, '.config', 'kb');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'config.yaml'),
      ['knowledgeBasePath: "/tmp/kb"', 'dbPath: "/tmp/kb/knowledge.db"', ''].join('\n'),
    );

    const result = await execa('node', ['--import', 'tsx', 'src/cli/main.ts', 'list'], {
      cwd: process.cwd(),
      env: {
        HOME: homeDir,
      },
      reject: false,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('SearchError');
    expect(result.stderr).toContain('step: command');
    expect(result.stderr).toContain('list');
  });
});

function createTempPath(prefix: string): string {
  const value = join(tmpdir(), `knowledge-${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  cleanupPaths.push(value);
  return value;
}
