# Story 3.1: 全文检索与结果展示（kb search）

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 用户,
I want 通过 `kb search "关键词"` 搜索知识库中的内容,
so that 我能快速找回之前入库的知识.

## Acceptance Criteria

1. **Given** 知识库中已有入库内容  
   **When** 用户执行 `kb search "TypeScript 泛型"`（或等效无查询参数时的交互/占位，以当前 CLI 约定为准；至少应支持**位置参数**传入检索词）  
   **Then** 系统通过 **FTS5** 对 `chunks_fts` 做全文匹配  
   **And** 返回匹配结果列表，每条包含：**标题**、**来源**（`knowledge_items` 的 `source_path`；Web 入库后为 URL 场景预留，当前以文件路径为主）、**命中摘要**（能体现关键词上下文的短片段，可用 FTS5 `snippet`/`highlight` 或等效截断策略）、**入库时间**（`created_at`）  
   **And** 结果按 **相关度** 排序（优先使用 FTS5 的 `bm25(chunks_fts)` 等内置相关度，若环境不支持则回退为文档约定的稳定次序并补充说明）

2. **Given** 检索结果数量较多  
   **When** 用户执行 `kb search "关键词" --limit 5`  
   **Then** 仅返回前 5 条结果（在相关度序下截取）

3. **Given** 知识库中无匹配内容  
   **When** 用户执行检索  
   **Then** 向 stdout 输出「未找到匹配结果」类友好提示（具体文案可落地时统一，但须稳定、可测试）  
   **And** 退出码为 `0`（无结果**不是**错误）

4. **Given** 知识库包含 10,000 条以内的内容（规模指知识条目/合理 chunk 体量下的经验上限，以 PRD NFR3 为意图）  
   **When** 执行检索  
   **Then** 在本地典型环境下目标 **1 秒内** 返回（NFR3）；若无法在无集成环境下严格计时，需用 **单测+可选集成** 覆盖查询路径并避免全表无索引扫描

## Tasks / Subtasks

- [x] 在 `core/search/` 实现检索用例与查询组装（不放在 CLI 内拼 SQL）  
  - [x] 定义**单一入口**（如 `searchByKeyword({ query, limit })`），返回**领域模型**（chunk 命中 + 父级 `knowledge_items` 元数据）  
  - [x] 实现 FTS5 `MATCH` 查询；处理用户输入中的 FTS 特殊字符，避免不可预期的语法错误（失败时抛 `SearchError` 等 `KbError` 子类，而非裸 `Error`）  
  - [x] 将「相关度排序」「limit」放在同一查询策略中，避免先拉全量再截断
- [x] 在 `storage/repositories/` 扩展或新增与检索相关的数据访问（由 core 调用，**禁止** `cli` 直连 `storage`）  
  - [x] 以 `chunks_fts` ↔ `chunks` ↔ `knowledge_items` 关联读取标题、source、时间  
  - [x] 复杂 SQL 只留在 Repository；Repository 返回 TS 类型（snake→camel 在边界转换与现有项目一致）  
- [x] 将 `src/cli/commands/search.ts` 从占位 `SearchError` 改为**可运行**：解析 `[query]`、`--limit`（默认值与 `commander`/`shared-options` 模式对齐项目惯例）  
  - [x] 成功时向 **stdout** 输出可读的**多行/列表**结果；**本故事不**实现 Epic 3.3 的完整「TTY/非 TTY/`--json`」分支，但输出必须满足 AC1 的字段与可读性  
  - [x] 无匹配时**不写 stderr**，**退出码 0**  
- [x] 测试：`*.test.ts` 与 `tests/integration/` 按项目惯例补齐（核心查询、CLI 无结果、limit、至少一条 happy path）

## Dev Notes

- **Epic 3 内分工**：`3-2` 负责 **标签/来源/时间过滤** 与 `kb list`；`3-3` 负责 **TTY/非 TTY/JSON** 输出策略。**本故事不要** 实现 `--tag`/`--source`/`--after`/`--before`/`--json` 等，以免与后续故事重复或冲突。  
- **依赖 Epic 2**：入库链路已写入 `chunks` 与 `chunks_fts`（见 `002-ingestion-schema.sql`）；检索只读、不改迁移方向。  
- **中文分词**：架构已说明 MVP 用默认/simple 类分词、中文效果有限是**已知限制**；本故事不引入 jieba 等外部分词。  
- **错误模型**：`SearchError` 已存在于 `src/errors/index.ts`；检索失败、查询非法等用 `KbError` 子类，CLI 走现有 `handleCliError()`。  
- **性能**：为满足 NFR3，应确保 FTS 使用索引路径；避免在应用层对全表 chunk 做过滤排序。若需 `PRAGMA`/连接选项，在 `DatabaseProvider` 或单测中一致化。  

### 架构与依赖方向

- 严格遵守：`cli/` → `core/search/` → `storage/repositories/`，**禁止** `cli` 直接 `import` storage repository。  
- 参考：[Source: _bmad-output/planning-artifacts/architecture.md]「Implementation Patterns」中的 Repository 与分层说明；检索时复杂查询封在 Repository 方法内。  

### 当前代码锚点

- 占位实现：`src/cli/commands/search.ts` 当前固定抛出「后续 story 实现」——**本故事应替换为真实实现**。  
- `ChunkRepository` 目前仅有 `createMany`；检索方法可**扩展**该类或**新增** `SearchRepository`（二选一，与团队命名一致即可），但 SQL 不落在 `core` 的.ts 中手写散落多处。  
- `chunks_fts` 使用 `content='chunks'`，`rowid` 与 `chunks.id` 对齐；触发器已维护同步。见 [Source: `src/storage/migrations/002-ingestion-schema.sql`]  
- `knowledge_items` 含 `title`, `source_type`, `source_path`, `created_at`；展示「来源」时优先使用与 ingest 侧一致的**路径或 URL 字符串**（与 PRD/现有 ingest 元数据一致）。  

### 与 Story 2.4 的衔接

- 2.4 已强化 `ingest` 的异常、重复来源与 `KbError` 退出码；`search` 应复用**同一** `formatKbError` 与**不在 core 中 `console.log`** 的惯例。  
- 无需在本故事重复实现入库或事务回滚；只要查询只读即可。  

### File Structure（预计 touch）

- 新增/重点修改：  
  - `src/core/search/index.ts`（或等价入口）  
  - `src/core/search/query-builder.ts`（或合并入单文件，保持可读即可）  
  - `src/storage/repositories/chunk-repository.ts` 或 `src/storage/repositories/search-repository.ts`  
  - `src/cli/commands/search.ts`、`src/cli/commands/search.test.ts`  
  - `src/core/index.ts`（如需导出 `search` 公共 API）  
  - `tests/integration/*.ts`（若需端到端）  

### Testing Requirements

- 单元/集成应覆盖：有结果、无结果（退出码 0）、`--limit`、FTS 异常输入的 `SearchError` 行为（若有）。  
- 测试描述与断言风格与仓库现有 `*.test.ts` 一致（中文 `describe`/`it` 可延续）。  

## Dev Agent Record

### Agent Model Used

Claude (Cursor) — 实现 story 3-1 交付

### Debug Log References

无

### Completion Notes List

- 实现 `searchByKeyword({ query, limit, dbPath })`（CLI 经配置注入 `dbPath`）、`core/search/fts-match.ts` 中 `buildFtsMatchQuery`；在 `unicode61` 下对分词后各词使用前缀 `term*`，以在默认分词器下获得可用的中文/混合词命中，并在 Dev Notes 所承认的「分词能力有限」范围内满足 AC。
- 新增 `SearchRepository`：单条 SQL 完成 `chunks_fts` JOIN `chunks` JOIN `knowledge_items`，`snippet` 作摘要、优先 `ORDER BY bm25(chunks_fts) ASC`、不可用时在 `prepare` 时回退 `ORDER BY rank ASC`；`LIMIT` 与排序同查询。
- CLI：`kb search [query] --limit`（默认 20），可测输出与「未找到匹配结果」+ 退出码 0；`tests/integration/search.test.ts` 覆盖 happy path、无结果与 limit。

### File List

- `src/core/index.ts`
- `src/core/search/types.ts`
- `src/core/search/fts-match.ts`
- `src/core/search/fts-match.test.ts`
- `src/core/search/index.ts`
- `src/core/search/search.test.ts`
- `src/storage/index.ts`
- `src/storage/repositories/search-repository.ts`
- `src/cli/commands/search.ts`
- `src/cli/commands/search.test.ts`
- `tests/integration/search.test.ts`
- `tests/integration/cli-errors.test.ts`
- `_bmad-output/implementation-artifacts/3-1-全文检索与结果展示-kb-search.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-04-22：完成全文检索、仓储 SQL、CLI 与单测/集成测；`cli-errors` 集成测改为对仍占位的 `list` 子命令断言，避免与可运行的 `search` 冲突。

---

**Story 完成度说明** — Ultimate context engine analysis completed - comprehensive developer guide created

**Git 参考（近期提交主题）**  
- `718a2c0` 入库异常与重复来源保护、pipeline/CLI 协作模式  
- 可对照 ingest 的依赖注入、TTY 与错误出口，保持 `search` 侧一致的分层。  

**外部技术提示**  
- SQLite FTS5：`MATCH`、辅助函数 `snippet`/`highlight`、`bm25()` 的可用性依赖链接的 SQLite 版本；`better-sqlite3` 随 Node 带动的 native 版本需在实现时**实测**本仓库的最低版本。若 `bm25` 不可用，在 Dev Notes 中记录回退策略（例如用 `rank` 列或其它稳定排序并加测试注释）。  
- 本故事不要求联网检索新库；以上以官方 SQLite FTS5 文档与当前依赖为准。  

**Project Context**  
- 未找到 `project-context.md`；以本 story + `epics.md` + `architecture.md` 与源码为准。  

**Sprint 状态**  
- 本文件就绪后，应将 `sprint-status.yaml` 中 `3-1-全文检索与结果展示-kb-search` 置为 `ready-for-dev`；`epic-3` 置为 `in-progress`（首个 Epic 3 故事创建时）。  
