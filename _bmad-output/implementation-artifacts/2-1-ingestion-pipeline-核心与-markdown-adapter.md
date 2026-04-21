# Story 2.1: Ingestion Pipeline 核心与 Markdown Adapter

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 用户,
I want 通过 `kb ingest ./path/to/doc.md` 将本地 Markdown 文件入库,
so that 我的本地笔记和文档可以被知识库管理。

## Acceptance Criteria

1. **Given** 一个有效的本地 Markdown 文件路径  
   **When** 用户执行 `kb ingest ./notes/article.md`  
   **Then** 系统通过 adapter 注册表自动选择 Markdown adapter  
   **And** 读取文件内容，提取元数据（标题取自第一个 heading 或文件名、来源类型为 `local-markdown`、来源路径、入库时间）  
   **And** 对内容执行清洗和标准化处理  
   **And** 将内容按段落/标题级别切分为 chunks，并保留 chunk 间重叠窗口  
   **And** 在同一个 SQLite 事务中存储 `KnowledgeItem` 和所有 `Chunks`  
   **And** 输出入库结果摘要（标题、来源、字数、切分块数）
2. **Given** `IngestionAdapter` 接口定义  
   **When** Markdown adapter 实现该接口  
   **Then** adapter 实现 `sourceType`、`canHandle()`、`ingest()` 三个成员  
   **And** adapter 不直接写数据库，只返回处理后的内容交给 pipeline 编排
3. **Given** pipeline 编排完整流程  
   **When** 入库执行  
   **Then** 步骤链按 `resolve adapter -> fetch -> parse -> chunk -> store -> index` 顺序执行  
   **And** 每个 chunk 记录在原文中的位置索引，确保溯源

## Tasks / Subtasks

- [x] 定义入库领域模型与核心接口（AC: 1, 2, 3）
  - [x] 在 `src/core/ingestion/adapter.ts` 定义 `IngestionAdapter`、`IngestOptions`、`RawContent`
  - [x] 在 `src/core/types.ts` 或等价核心类型文件中补齐 `KnowledgeItem`、`Chunk`、`ProgressEvent` 等领域类型
  - [x] 保持核心层函数签名支持可选 `onProgress?: (event) => void`，即使 CLI 进度渲染延后到 `2.3`
- [x] 引入 Story 2.1 所需的渐进式 schema 与存储入口（AC: 1, 3）
  - [x] 新增编号迁移，为本故事首次引入 `knowledge_items` 与 `chunks` 所需表结构、约束和索引
  - [x] 不修改 `001-bootstrap.sql`；所有新增 schema 必须通过新的编号迁移进入系统
  - [x] 新增或扩展 Repository，使 `KnowledgeItem` / `Chunk` 的写入封装在 `storage/` 层内完成
  - [x] 让 `store` 与 `index` 落在同一事务边界内，失败时保证无部分写入
- [x] 实现 Markdown adapter 与 adapter 注册表（AC: 1, 2, 3）
  - [x] 在 `src/adapters/markdown-adapter.ts` 读取本地 Markdown，抽取标题、来源路径、来源类型、正文与时间戳
  - [x] 在 `src/adapters/index.ts` 建立 adapter 注册/解析逻辑，优先通过扩展名选择 Markdown adapter
  - [x] 保持 adapter 只负责把来源转成标准化 `RawContent`，不进入数据库写入逻辑
- [x] 实现 chunk 切分与 pipeline 编排（AC: 1, 3）
  - [x] 在 `src/core/ingestion/chunker.ts` 按 Markdown 标题/段落进行稳定、可测试的切分
  - [x] 记录每个 chunk 在原文中的位置索引与重叠窗口信息
  - [x] 在 `src/core/ingestion/pipeline.ts` 按 `resolve -> fetch -> parse -> chunk -> store -> index` 顺序编排步骤
  - [x] 核心编排失败时统一抛出 `IngestionError` 或 `StorageError`，不要裸抛 `Error`
- [x] 将 `kb ingest` 从占位命令替换为真实最小实现（AC: 1)
  - [x] 继续复用 `ensureConfigForCommand()` 做配置预检，不重复实现配置读取/补全
  - [x] 在 CLI 层调用 core 暴露的 ingest 入口，而不是直接访问 Repository 或 `better-sqlite3`
  - [x] 输出最小可读摘要：标题、来源、字数、切分块数
  - [x] 不在本 story 中顺手实现标签/备注、进度渲染、JSON 输出策略或 Web ingestion
- [x] 补齐自动化验证与回归保护（AC: 1, 2, 3）
  - [x] 为 Markdown adapter 的 `canHandle()`、标题提取、内容读取添加测试
  - [x] 为 chunker 的标题/段落切分、位置索引、重叠窗口行为添加测试
  - [x] 为迁移与 Repository 写入添加测试，验证事务失败时不会留下部分数据
  - [x] 为 `kb ingest <path>` 增加集成测试，验证成功入库与摘要输出

## Dev Notes

- 这是 Epic 2 的第一个 story，目标不是“把所有入库能力做完”，而是把**本地 Markdown 入库的垂直切片**真正跑通：来源解析、内容标准化、切分、持久化、CLI 最小成功路径。
- 当前仓库已经有 CLI 骨架、统一错误体系、配置加载、数据库 provider 与迁移引擎；`2.1` 应在这些现有基础设施上继续搭建，不要重写已有入口。

### Technical Requirements

- 技术栈沿用当前仓库已锁定版本：`commander@14.x`、`better-sqlite3@12.9.0`、`@inquirer/prompts@8.4.x`、`yaml@2.8.x`、`vitest@4.x`、`tsx@4.x`、`tsup@8.5.x`。
- 源码继续采用 ESM 风格与 `.js` 后缀 import，构建产物保持现有 CJS 输出约束，不要改动打包路线。
- `kb ingest` 必须复用 `ensureConfigForCommand()` 获取完整配置；数据库初始化继续走 `ensureStorageReady({ dbPath })` / 既有迁移链，不要在命令里绕过 core 直接打开数据库。
- `IngestionAdapter` 是 source -> `RawContent` 的转换边界；adapter 负责文件读取、轻量清洗、元数据抽取，不负责 SQL、事务或 CLI 输出。
- chunk 切分先实现“标题/段落级 + 重叠窗口”的稳定 MVP 算法，重点是可解释、可测试，而不是一次到位做复杂语义切分。
- `KnowledgeItem` 与 `Chunk` 的数据库对象应在本故事中通过新增迁移引入；标签、备注、`item_tags` 等 schema 留给后续 story。
- 当前 `2.1` 需要真实写入 `KnowledgeItem` 和 `Chunk`；写入过程必须放在事务内，避免中途失败留下半成品数据。
- CLI 输出本 story 只需最小人类可读摘要，不要提前做 `TTY/plain/JSON` 三种格式策略，那是 Epic 3 的范围。

### Architecture Compliance

- 严格遵守依赖方向：`cli/ -> core/ -> storage/`。`cli/commands/ingest.ts` 不能直接 import Repository 或 `better-sqlite3`。
- 继续遵守 Repository 边界：所有 SQL 只能出现在 `storage/` 内；不要在 `core/ingestion/` 写 SQL。
- 所有核心层入库函数应预留 `onProgress?` 参数，但 CLI 真正的进度渲染属于 Story `2.3`；本 story 可以先发事件、不渲染。
- 不要在 `2.1` 中实现以下内容：
  - `2.2` 的 `--tag` / `--note`
  - `2.3` 的实时进度渲染
  - `2.4` 的完整异常路径与重复入库交互
  - `4.1` 的 Web adapter / Defuddle / linkedom
  - `3.x` 的搜索命令、查询构建、结果格式化
- 迁移策略必须保持“渐进式引入 schema”：不要回填 `001-bootstrap.sql`，也不要顺手把后续所有表提前建好。

### Critical Scope Note

- 上游文档存在一处需要实现时明确遵守的边界：`epics.md` 的 `2.1` 验收标准写了 `store -> index`，但 `architecture.md` 的实施顺序把 `chunks_fts` 放到了搜索阶段。
- 为避免实现时各自猜测，本 story 的执行建议是：
  - 以 **当前 Story 2.1 的验收标准** 作为本故事完成定义；
  - 如果实现 `index` 需要引入 `chunks_fts`，必须通过新的编号迁移引入，且**只落数据库对象与写入链路**，不要提前做搜索查询层或 `kb search`；
  - 如果开发前用户决定把 FTS 引入时机延后到 Epic 3，则应在开始编码前先同步修正文档，而不是在实现中静默偏离验收标准。

### Current Implementation Context

- `src/cli/commands/ingest.ts` 目前只是占位命令，已经接好了配置 preflight；`2.1` 应在此文件上就地替换为真实实现，而不是新开第二套命令入口。
- `src/cli/commands/init.ts` 已提供 `ensureConfigForCommand()` 与 `runInitFlow()`；继续复用它们，避免在 `ingest` 中复制配置缺失处理逻辑。
- `src/storage/provider.ts` 已提供 `DatabaseProvider`、事务封装、`getUserVersion()` / `setUserVersion()`；新增存储能力时应直接建立在这层之上。
- `src/storage/migrator.ts` 与 `src/storage/migrations/001-bootstrap.sql` 已完成最小初始化；`2.1` 只新增本故事需要的迁移，不修改迁移引擎设计。
- `src/adapters/index.ts` 当前为空，是建立 adapter 注册表的自然落点。

### File Structure Requirements

- 预计优先新增或修改这些文件：
  - `src/cli/commands/ingest.ts`
  - `src/core/index.ts`
  - `src/core/types.ts`
  - `src/core/ingestion/index.ts`
  - `src/core/ingestion/adapter.ts`
  - `src/core/ingestion/chunker.ts`
  - `src/core/ingestion/pipeline.ts`
  - `src/adapters/index.ts`
  - `src/adapters/markdown-adapter.ts`
  - `src/storage/index.ts`
  - `src/storage/migrations/002-*.sql`（以及如需索引则继续新增后续编号迁移）
  - `src/storage/repositories/knowledge-item-repository.ts`
  - `src/storage/repositories/chunk-repository.ts`
  - `tests/integration/ingestion.test.ts`
  - `tests/fixtures/sample-article.md`
- 文件命名继续使用 `kebab-case`；测试文件 co-located 或放 `tests/integration/`，保持现有 Vitest 风格。

### Testing Requirements

- 单元测试至少覆盖：
  - Markdown adapter 的 `canHandle()`、标题提取（首个 heading / 文件名回退）、来源路径与元数据构造
  - chunker 的分块边界、位置索引与重叠窗口
  - pipeline 的步骤顺序与错误包装
  - Repository 写入和事务回滚
- 集成测试至少覆盖：
  - 在已有有效配置的前提下，`kb ingest <markdown-path>` 可成功写入数据库并输出摘要
  - 成功入库后数据库中可看到 `knowledge_items` 与 `chunks` 记录
  - 若本 story 引入 `chunks_fts`，测试要验证索引表被创建且与写入事务一致
- 测试风格沿用现有模式：`vitest` + `execa('node', ['--import', 'tsx', 'src/cli/main.ts', ...])`，中文测试描述，必要时用临时目录隔离文件系统副作用。

### Project Structure Notes

- 当前仓库已存在 `src/cli/`、`src/config/`、`src/errors/`、`src/storage/` 基础能力，但 `src/core/ingestion/`、具体 adapters、repositories 仍未建立，`2.1` 正是把这些规划中的落点首次实化。
- 当前未发现 `project-context.md`；本 story 应以 `epics.md`、`architecture.md`、`prd.md`、以及已完成的 `1.1` / `1.2` / `1.3` story 文件和现有源码为事实来源。
- 本故事是第一次真正把业务数据写入数据库，因此要特别防止“为了赶快跑通而把 SQL、CLI、adapter 混写在一起”的反模式。

### References

- Story 边界与验收标准：`_bmad-output/planning-artifacts/epics.md`
- 产品目标、MVP 范围、命令体系：`_bmad-output/planning-artifacts/prd.md`
- 架构边界、目录结构、命名与迁移原则：`_bmad-output/planning-artifacts/architecture.md`
- 规划纠偏背景：`_bmad-output/planning-artifacts/sprint-change-proposal-2026-04-20.md`
- 已有存储基础设施：`_bmad-output/implementation-artifacts/1-2-数据库迁移引擎与最小初始化.md`
- 已有配置与 CLI preflight：`_bmad-output/implementation-artifacts/1-3-分层配置系统与-kb-init-命令.md`
- 当前实现入口：`src/cli/commands/ingest.ts`、`src/cli/commands/init.ts`、`src/core/index.ts`、`src/storage/index.ts`、`src/storage/provider.ts`

## Dev Agent Record

### Agent Model Used

GPT-5.4

### Debug Log References

- `pnpm vitest run src/storage/migrator.test.ts`
- `pnpm vitest run src/storage/repositories/knowledge-item-repository.test.ts`
- `pnpm vitest run src/adapters/markdown-adapter.test.ts`
- `pnpm vitest run src/core/ingestion/chunker.test.ts`
- `pnpm vitest run tests/integration/ingestion.test.ts --reporter=verbose --testTimeout=10000`
- `pnpm vitest run src/core/ingestion/pipeline.test.ts`
- `pnpm vitest run src/storage/index.test.ts src/cli/commands/init.test.ts tests/integration/init.test.ts`
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`

### Completion Notes List

- 2026-04-20: 已为 Story 2.1 生成完整开发上下文，状态设为 `ready-for-dev`。
- 2026-04-20: 已明确应复用现有配置 preflight、迁移引擎、错误体系和 CLI 集成测试风格。
- 2026-04-20: 已显式标注 `store/index` 与 `chunks_fts` 引入时机的上游文档冲突，要求通过新增迁移解决，而不是修改 `001-bootstrap.sql` 或提前实现搜索层。
- 2026-04-21: 已新增 `002-ingestion-schema.sql`，通过渐进式迁移引入 `knowledge_items`、`chunks` 与 `chunks_fts`，未改动 `001-bootstrap.sql`。
- 2026-04-21: 已实现 Markdown adapter、adapter 注册表、chunker 与 async ingestion pipeline，并通过 `onProgress` 发出完整的 `resolve -> fetch -> parse -> chunk -> store -> index` 事件序列。
- 2026-04-21: 已将 `kb ingest` 从占位命令替换为真实最小实现，可复用现有配置 preflight 完成本地 Markdown 入库并输出摘要。
- 2026-04-21: 已补齐 adapter、chunker、pipeline、repository、CLI 集成及既有初始化相关回归测试；`pnpm test`、`pnpm typecheck`、`pnpm build` 全部通过。

### File List

- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/2-1-ingestion-pipeline-核心与-markdown-adapter.md`
- `docs/superpowers/plans/2026-04-20-ingest-markdown-pipeline.md`
- `src/adapters/index.ts`
- `src/adapters/markdown-adapter.ts`
- `src/adapters/markdown-adapter.test.ts`
- `src/cli/commands/ingest.ts`
- `src/cli/commands/init.test.ts`
- `src/core/index.ts`
- `src/core/index.test.ts`
- `src/core/types.ts`
- `src/core/ingestion/index.ts`
- `src/core/ingestion/chunker.ts`
- `src/core/ingestion/chunker.test.ts`
- `src/core/ingestion/pipeline.ts`
- `src/core/ingestion/pipeline.test.ts`
- `src/storage/index.ts`
- `src/storage/index.test.ts`
- `src/storage/migrator.test.ts`
- `src/storage/migrations/002-ingestion-schema.sql`
- `src/storage/repositories/chunk-repository.ts`
- `src/storage/repositories/knowledge-item-repository.ts`
- `src/storage/repositories/knowledge-item-repository.test.ts`
- `tests/integration/ingestion.test.ts`
- `tests/integration/init.test.ts`
- `tests/integration/storage-ready.test.ts`

### Change Log

- 2026-04-21: 完成 Story 2.1，实现本地 Markdown 入库、chunk 存储与 FTS 写入链路，并将故事状态更新为 `review`。
