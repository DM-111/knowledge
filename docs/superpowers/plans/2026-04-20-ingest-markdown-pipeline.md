# Story 2.1 Ingest Markdown Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `kb ingest <markdown-path>` 能把本地 Markdown 文件切分并写入 `knowledge_items`、`chunks` 和 `chunks_fts`，同时输出最小摘要。

**Architecture:** 保持 `cli -> core -> storage` 单向依赖。CLI 只做参数与摘要输出；core 负责编排 adapter、chunker、pipeline；storage 负责迁移、Repository、事务和 FTS 写入。`store + index` 必须位于同一事务中，失败时整体回滚。

**Tech Stack:** TypeScript, Commander, better-sqlite3, Vitest, tsx, tsup, YAML config loader

---

### Task 1: 建立存储与核心类型骨架

**Files:**
- Create: `src/core/types.ts`
- Create: `src/storage/repositories/knowledge-item-repository.ts`
- Create: `src/storage/repositories/chunk-repository.ts`
- Modify: `src/storage/index.ts`
- Modify: `src/core/index.ts`
- Modify: `src/storage/migrator.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
it('运行 002 迁移后创建 knowledge_items、chunks、chunks_fts', () => {
  const provider = createDatabaseProvider(':memory:');
  runMigrations(provider, {
    migrations: [
      { version: 1, name: '001-bootstrap.sql', sql: 'SELECT 1;' },
      { version: 2, name: '002-ingestion-schema.sql', sql: `...` },
    ],
  });

  const tables = provider
    .getConnection()
    .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')")
    .all() as Array<{ name: string }>;

  expect(tables.map((row) => row.name)).toContain('knowledge_items');
  expect(tables.map((row) => row.name)).toContain('chunks');
  expect(tables.map((row) => row.name)).toContain('chunks_fts');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run src/storage/migrator.test.ts`
Expected: FAIL，因为 `002` 迁移与对应 schema 尚不存在。

- [ ] **Step 3: 最小实现**

```ts
export interface KnowledgeItem {
  id: number;
  title: string;
  sourceType: 'local-markdown';
  sourcePath: string;
  createdAt: string;
  content: string;
  wordCount: number;
}

export interface Chunk {
  id: number;
  knowledgeItemId: number;
  chunkIndex: number;
  content: string;
  startOffset: number;
  endOffset: number;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run src/storage/migrator.test.ts`
Expected: PASS。

### Task 2: 建立 Markdown adapter 与注册表

**Files:**
- Create: `src/core/ingestion/adapter.ts`
- Create: `src/adapters/markdown-adapter.ts`
- Modify: `src/adapters/index.ts`
- Test: `src/adapters/markdown-adapter.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
it('对 .md 文件返回可处理并提取首个 heading 作为标题', async () => {
  const adapter = new MarkdownAdapter();
  const result = await adapter.ingest('/tmp/article.md');

  expect(adapter.canHandle('/tmp/article.md')).toBe(true);
  expect(result.title).toBe('文章标题');
  expect(result.sourceType).toBe('local-markdown');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run src/adapters/markdown-adapter.test.ts`
Expected: FAIL，因为 `MarkdownAdapter` 尚不存在。

- [ ] **Step 3: 最小实现**

```ts
export interface RawContent {
  title: string;
  markdown: string;
  sourceType: 'local-markdown';
  sourcePath: string;
  createdAt: string;
}

export class MarkdownAdapter implements IngestionAdapter {
  readonly sourceType = 'local-markdown';
  canHandle(source: string): boolean {
    return source.toLowerCase().endsWith('.md') || source.toLowerCase().endsWith('.markdown');
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run src/adapters/markdown-adapter.test.ts`
Expected: PASS。

### Task 3: 建立 chunker 与 pipeline

**Files:**
- Create: `src/core/ingestion/chunker.ts`
- Create: `src/core/ingestion/pipeline.ts`
- Create: `src/core/ingestion/index.ts`
- Test: `src/core/ingestion/chunker.test.ts`
- Test: `src/core/ingestion/pipeline.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
it('按标题和段落切分，并记录原文 offset', () => {
  const result = chunkMarkdown('# 标题\n\n第一段。\n\n## 第二节\n\n第二段。');

  expect(result).toHaveLength(2);
  expect(result[0]?.startOffset).toBe(0);
  expect(result[0]?.endOffset).toBeGreaterThan(result[0]?.startOffset ?? 0);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run src/core/ingestion/chunker.test.ts src/core/ingestion/pipeline.test.ts`
Expected: FAIL，因为 chunker/pipeline 尚不存在。

- [ ] **Step 3: 最小实现**

```ts
export function chunkMarkdown(markdown: string): ChunkDraft[] {
  const sections = markdown.trim().split(/\n\s*\n(?=#{1,6}\s)|\n\s*\n/);
  // 先用可测试的最小规则实现，再补 overlap
  return sections.filter(Boolean).map((content, index) => ({ ... }));
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run src/core/ingestion/chunker.test.ts src/core/ingestion/pipeline.test.ts`
Expected: PASS。

### Task 4: 打通 storage transaction 与 FTS 写入

**Files:**
- Create: `src/storage/migrations/002-ingestion-schema.sql`
- Modify: `src/storage/index.ts`
- Modify: `src/storage/repositories/knowledge-item-repository.ts`
- Modify: `src/storage/repositories/chunk-repository.ts`
- Test: `src/storage/repositories/knowledge-item-repository.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
it('在同一事务中写入 knowledge_item、chunks 与 chunks_fts', () => {
  const provider = initializeStorage({ dbPath: ':memory:' });
  const itemRepo = new KnowledgeItemRepository(provider);
  const chunkRepo = new ChunkRepository(provider);

  const result = provider.transaction((db) => {
    const itemId = itemRepo.create({ ... }, db);
    chunkRepo.createMany(itemId, [{ ... }], db);
    return itemId;
  });

  expect(result).toBeGreaterThan(0);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run src/storage/repositories/knowledge-item-repository.test.ts`
Expected: FAIL，因为 repository/表结构/FTS 写入尚未实现。

- [ ] **Step 3: 最小实现**

```sql
CREATE TABLE knowledge_items (...);
CREATE TABLE chunks (...);
CREATE VIRTUAL TABLE chunks_fts USING fts5(content, content='chunks', content_rowid='id');
CREATE TRIGGER chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
END;
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run src/storage/repositories/knowledge-item-repository.test.ts`
Expected: PASS。

### Task 5: 接通 CLI ingest 命令

**Files:**
- Modify: `src/cli/commands/ingest.ts`
- Modify: `src/core/index.ts`
- Test: `tests/integration/ingestion.test.ts`
- Create: `tests/fixtures/sample-article.md`

- [ ] **Step 1: 写失败测试**

```ts
it('kb ingest 可把 markdown 入库并输出摘要', async () => {
  const result = await execa('node', ['--import', 'tsx', 'src/cli/main.ts', 'ingest', fixturePath], {
    env: { HOME: homeDir },
    reject: false,
  });

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('标题');
  expect(result.stdout).toContain('切分块数');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/integration/ingestion.test.ts`
Expected: FAIL，因为 CLI 仍是占位命令。

- [ ] **Step 3: 最小实现**

```ts
const config = await ensureConfigForCommand(...);
const result = ingestLocalMarkdown({ source, dbPath: config.dbPath });
process.stdout.write([
  `标题: ${result.title}`,
  `来源: ${result.sourcePath}`,
  `字数: ${result.wordCount}`,
  `切分块数: ${result.chunkCount}`,
].join('\n') + '\n');
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run tests/integration/ingestion.test.ts`
Expected: PASS。

### Task 6: 回归验证与故事状态更新

**Files:**
- Modify: `_bmad-output/implementation-artifacts/2-1-ingestion-pipeline-核心与-markdown-adapter.md`
- Modify: `_bmad-output/implementation-artifacts/sprint-status.yaml`

- [ ] **Step 1: 跑完整验证**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: 全部通过。

- [ ] **Step 2: 更新 story 追踪**

```md
- [x] 已完成当前任务与子任务
- Completion Notes 补充实现与测试结论
- File List 补全所有新增/修改文件
- Status 更新为 review
```

- [ ] **Step 3: 更新 sprint 状态**

Run: 将 `2-1-ingestion-pipeline-核心与-markdown-adapter` 更新为 `review`
Expected: `sprint-status.yaml` 与 story 文件同步。
