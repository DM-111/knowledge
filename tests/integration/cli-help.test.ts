import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

describe('kb --help', () => {
  it('outputs registered commands and exits with code 0', async () => {
    const result = await execa('node', ['--import', 'tsx', 'src/cli/main.ts', '--help'], {
      reject: false,
    });
    const combinedOutput = `${result.stdout}\n${result.stderr}`;

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('init');
    expect(result.stdout).toContain('ingest');
    expect(result.stdout).toContain('search');
    expect(result.stdout).toContain('list');
    expect(result.stdout).toContain('tag');
    expect(combinedOutput).not.toContain('outputHelp');
  });
});
