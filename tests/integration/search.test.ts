import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execa } from 'execa';
import Database from 'better-sqlite3';

const cleanupPaths: string[] = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    const target = cleanupPaths.pop();
    if (target) {
      rmSync(target, { recursive: true, force: true });
    }
  }
});

describe('kb search integration', () => {
  it('入库后可用关键词命中并看到标题与来源', async () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-kb-search-'));
    const dbPath = join(root, 'data', 'knowledge.db');
    const knowledgeBasePath = join(root, 'kb');
    cleanupPaths.push(root);
    const fixturePath = resolve('tests/fixtures/sample-article.md');

    const ingest = await execa(
      'node',
      [
        '--import',
        'tsx',
        'src/cli/main.ts',
        'ingest',
        fixturePath,
        '--knowledge-base-path',
        knowledgeBasePath,
        '--db-path',
        dbPath,
      ],
      { cwd: process.cwd(), reject: false },
    );
    expect(ingest.exitCode).toBe(0);

    const search = await execa(
      'node',
      [
        '--import',
        'tsx',
        'src/cli/main.ts',
        'search',
        '泛型',
        '--knowledge-base-path',
        knowledgeBasePath,
        '--db-path',
        dbPath,
      ],
      { cwd: process.cwd(), reject: false },
    );
    expect(search.exitCode).toBe(0);
    expect(search.stdout).toContain('TypeScript 泛型入门');
    expect(search.stdout).toContain(`来源: ${fixturePath}`);
    expect(search.stdout).toContain('摘要:');
  });

  it('无命中时提示且退出码 0', async () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-kb-search-empty-'));
    const dbPath = join(root, 'data', 'knowledge.db');
    const knowledgeBasePath = join(root, 'kb');
    cleanupPaths.push(root);
    const fixturePath = resolve('tests/fixtures/sample-article.md');

    await execa('node', ['--import', 'tsx', 'src/cli/main.ts', 'ingest', fixturePath, '--knowledge-base-path', knowledgeBasePath, '--db-path', dbPath], {
      cwd: process.cwd(),
    });

    const search = await execa(
      'node',
      [
        '--import',
        'tsx',
        'src/cli/main.ts',
        'search',
        '绝不存在的关键词zzsearchempty',
        '--knowledge-base-path',
        knowledgeBasePath,
        '--db-path',
        dbPath,
      ],
      { cwd: process.cwd(), reject: false },
    );
    expect(search.exitCode).toBe(0);
    expect(search.stdout).toContain('未找到匹配结果');
    expect(search.stdout).not.toMatch(/\u001B\[[0-9;]*m/);
  });

  it('尊重 --limit', async () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-kb-search-limit-'));
    const dbPath = join(root, 'data', 'knowledge.db');
    const knowledgeBasePath = join(root, 'kb');
    cleanupPaths.push(root);
    const fixturePath = resolve('tests/fixtures/sample-article.md');

    await execa('node', ['--import', 'tsx', 'src/cli/main.ts', 'ingest', fixturePath, '--knowledge-base-path', knowledgeBasePath, '--db-path', dbPath], {
      cwd: process.cwd(),
    });

    const search = await execa(
      'node',
      [
        '--import',
        'tsx',
        'src/cli/main.ts',
        'search',
        '泛型',
        '--limit',
        '1',
        '--knowledge-base-path',
        knowledgeBasePath,
        '--db-path',
        dbPath,
      ],
      { cwd: process.cwd(), reject: false },
    );
    expect(search.exitCode).toBe(0);
    const indexLines = search.stdout.split('\n').filter((line) => /^\d+\.\s+/.test(line));
    expect(indexLines).toHaveLength(1);
  });

  it('支持按标签、来源和时间过滤检索结果', async () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-kb-search-filter-'));
    const dbPath = join(root, 'data', 'knowledge.db');
    const knowledgeBasePath = join(root, 'kb');
    cleanupPaths.push(root);
    const fixturePath = resolve('tests/fixtures/sample-article.md');
    const aprilFixture = resolve('tests/fixtures/sample-article-april.md');

    await execa(
      'node',
      [
        '--import',
        'tsx',
        'src/cli/main.ts',
        'ingest',
        fixturePath,
        '--tag',
        'typescript',
        '--knowledge-base-path',
        knowledgeBasePath,
        '--db-path',
        dbPath,
      ],
      { cwd: process.cwd() },
    );
    await execa(
      'node',
      [
        '--import',
        'tsx',
        'src/cli/main.ts',
        'ingest',
        aprilFixture,
        '--tag',
        'archive',
        '--knowledge-base-path',
        knowledgeBasePath,
        '--db-path',
        dbPath,
      ],
      { cwd: process.cwd() },
    );

    const connection = new Database(dbPath);
    connection.prepare('UPDATE knowledge_items SET created_at = ? WHERE source_path = ?').run(
      '2026-04-20T08:00:00.000Z',
      fixturePath,
    );
    connection.prepare('UPDATE knowledge_items SET created_at = ? WHERE source_path = ?').run(
      '2026-05-10T08:00:00.000Z',
      aprilFixture,
    );
    connection.close();

    const search = await execa(
      'node',
      [
        '--import',
        'tsx',
        'src/cli/main.ts',
        'search',
        '泛型',
        '--tag',
        'typescript',
        '--source',
        'local-markdown',
        '--after',
        '2026-04-01',
        '--before',
        '2026-04-30',
        '--knowledge-base-path',
        knowledgeBasePath,
        '--db-path',
        dbPath,
      ],
      { cwd: process.cwd(), reject: false },
    );

    expect(search.exitCode).toBe(0);
    expect(search.stdout).toContain('TypeScript 泛型入门');
    expect(search.stdout).not.toContain('四月归档笔记');
    expect(search.stdout).not.toMatch(/\u001B\[[0-9;]*m/);
  });

  it('在非 TTY 下默认输出纯文本且不含 ANSI 污染', async () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-kb-search-plain-'));
    const dbPath = join(root, 'data', 'knowledge.db');
    const knowledgeBasePath = join(root, 'kb');
    cleanupPaths.push(root);
    const fixturePath = resolve('tests/fixtures/sample-article.md');

    await execa('node', ['--import', 'tsx', 'src/cli/main.ts', 'ingest', fixturePath, '--knowledge-base-path', knowledgeBasePath, '--db-path', dbPath], {
      cwd: process.cwd(),
    });

    const search = await execa(
      'node',
      ['--import', 'tsx', 'src/cli/main.ts', 'search', '泛型', '--knowledge-base-path', knowledgeBasePath, '--db-path', dbPath],
      { cwd: process.cwd(), reject: false },
    );

    expect(search.exitCode).toBe(0);
    expect(search.stdout).toContain('摘要:');
    expect(search.stdout).not.toMatch(/\u001B\[[0-9;]*m/);
  });

  it('search --json 返回 items/total 结构化结果', async () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-kb-search-json-'));
    const dbPath = join(root, 'data', 'knowledge.db');
    const knowledgeBasePath = join(root, 'kb');
    cleanupPaths.push(root);
    const fixturePath = resolve('tests/fixtures/sample-article.md');
    const aprilFixture = resolve('tests/fixtures/sample-article-april.md');

    await execa('node', ['--import', 'tsx', 'src/cli/main.ts', 'ingest', fixturePath, '--knowledge-base-path', knowledgeBasePath, '--db-path', dbPath], {
      cwd: process.cwd(),
    });
    await execa('node', ['--import', 'tsx', 'src/cli/main.ts', 'ingest', aprilFixture, '--knowledge-base-path', knowledgeBasePath, '--db-path', dbPath], {
      cwd: process.cwd(),
    });

    const search = await execa(
      'node',
      [
        '--import',
        'tsx',
        'src/cli/main.ts',
        'search',
        '泛型',
        '--limit',
        '1',
        '--json',
        '--knowledge-base-path',
        knowledgeBasePath,
        '--db-path',
        dbPath,
      ],
      { cwd: process.cwd(), reject: false },
    );

    expect(search.exitCode).toBe(0);
    expect(search.stdout).not.toMatch(/\u001B\[[0-9;]*m/);
    expect(search.stderr).toBe('');
    const payload = JSON.parse(search.stdout);
    expect(payload.total).toBeGreaterThan(1);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('kb list integration', () => {
  it('支持按标签过滤并在超过 limit 时提示总数', async () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-kb-list-'));
    const dbPath = join(root, 'data', 'knowledge.db');
    const knowledgeBasePath = join(root, 'kb');
    cleanupPaths.push(root);
    const fixturePath = resolve('tests/fixtures/sample-article.md');
    const aprilFixture = resolve('tests/fixtures/sample-article-april.md');

    await execa(
      'node',
      [
        '--import',
        'tsx',
        'src/cli/main.ts',
        'ingest',
        fixturePath,
        '--tag',
        'typescript',
        '--knowledge-base-path',
        knowledgeBasePath,
        '--db-path',
        dbPath,
      ],
      { cwd: process.cwd() },
    );
    await execa(
      'node',
      [
        '--import',
        'tsx',
        'src/cli/main.ts',
        'ingest',
        aprilFixture,
        '--tag',
        'typescript',
        '--knowledge-base-path',
        knowledgeBasePath,
        '--db-path',
        dbPath,
      ],
      { cwd: process.cwd() },
    );

    const connection = new Database(dbPath);
    connection.prepare('UPDATE knowledge_items SET created_at = ? WHERE source_path = ?').run(
      '2026-04-20T08:00:00.000Z',
      fixturePath,
    );
    connection.prepare('UPDATE knowledge_items SET created_at = ? WHERE source_path = ?').run(
      '2026-04-10T08:00:00.000Z',
      aprilFixture,
    );
    connection.close();

    const list = await execa(
      'node',
      [
        '--import',
        'tsx',
        'src/cli/main.ts',
        'list',
        '--tag',
        'typescript',
        '--limit',
        '1',
        '--knowledge-base-path',
        knowledgeBasePath,
        '--db-path',
        dbPath,
      ],
      { cwd: process.cwd(), reject: false },
    );

    expect(list.exitCode).toBe(0);
    expect(list.stdout).toContain('TypeScript 泛型入门');
    expect(list.stdout).toContain('标签: typescript');
    expect(list.stdout).toContain('共 2 条，当前展示 1 条');
    expect(list.stdout).not.toMatch(/\u001B\[[0-9;]*m/);
  });

  it('list --json 返回 items/total 结构化结果', async () => {
    const root = mkdtempSync(join(tmpdir(), 'knowledge-kb-list-json-'));
    const dbPath = join(root, 'data', 'knowledge.db');
    const knowledgeBasePath = join(root, 'kb');
    cleanupPaths.push(root);
    const fixturePath = resolve('tests/fixtures/sample-article.md');
    const aprilFixture = resolve('tests/fixtures/sample-article-april.md');

    await execa('node', ['--import', 'tsx', 'src/cli/main.ts', 'ingest', fixturePath, '--tag', 'typescript', '--knowledge-base-path', knowledgeBasePath, '--db-path', dbPath], {
      cwd: process.cwd(),
    });
    await execa('node', ['--import', 'tsx', 'src/cli/main.ts', 'ingest', aprilFixture, '--tag', 'typescript', '--knowledge-base-path', knowledgeBasePath, '--db-path', dbPath], {
      cwd: process.cwd(),
    });

    const list = await execa(
      'node',
      [
        '--import',
        'tsx',
        'src/cli/main.ts',
        'list',
        '--tag',
        'typescript',
        '--limit',
        '1',
        '--json',
        '--knowledge-base-path',
        knowledgeBasePath,
        '--db-path',
        dbPath,
      ],
      { cwd: process.cwd(), reject: false },
    );

    expect(list.exitCode).toBe(0);
    expect(list.stderr).toBe('');
    expect(list.stdout).not.toMatch(/\u001B\[[0-9;]*m/);
    const payload = JSON.parse(list.stdout);
    expect(payload.total).toBe(2);
    expect(payload.items).toHaveLength(1);
  });
});
