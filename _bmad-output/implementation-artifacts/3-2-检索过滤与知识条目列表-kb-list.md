# Story 3.2: 检索过滤与知识条目列表（kb list）

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 用户,
I want 按标签、来源类型、时间范围过滤检索结果，并能列出所有已入库条目,
so that 我能精准定位目标知识并掌握知识库全貌.

## Acceptance Criteria

1. **Given** 知识库中有多种来源和标签的内容  
   **When** 用户执行 `kb search "关键词" --tag typescript --source local-markdown`  
   **Then** 仅返回同时匹配关键词、标签为 `typescript` 且来源为 `local-markdown` 的结果  
   **And** 继续沿用 Story 3.1 已建立的结果字段：标题、来源、命中摘要、入库时间

2. **Given** 用户需要按时间过滤  
   **When** 执行 `kb search "关键词" --after 2026-04-01 --before 2026-04-30`  
   **Then** 仅返回入库时间在指定范围内的匹配结果  
   **And** 日期过滤基于 `knowledge_items.created_at`  
   **And** CLI 对非法日期输入给出稳定、可测试的 `SearchError`

3. **Given** 用户需要查看知识库全部内容  
   **When** 执行 `kb list`  
   **Then** 展示所有已入库的知识条目  
   **And** 每条包含：`ID`、标题、来源类型、标签列表、入库时间  
   **And** 支持 `--tag`、`--source` 过滤

4. **Given** 用户执行 `kb list --limit 10`  
   **When** 知识库条目超过 `10` 条  
   **Then** 仅展示前 `10` 条  
   **And** 明确提示总数  
   **And** 输出文案保持稳定、可测试

## Tasks / Subtasks

- [x] 扩展 `kb search` 的 CLI 过滤参数并保持现有命令约定一致（AC: 1, 2）
  - [x] 在 `src/cli/commands/search.ts` 为现有命令增加 `--tag`、`--source`、`--after`、`--before`
  - [x] 复用或抽取现有 `parseLimit` 逻辑，避免 `search` 与 `list` 出现两套 `--limit` 解析规则
  - [x] 对日期参数做显式校验；错误必须走 `SearchError` + `handleCliError()` 路径，而不是裸异常

- [x] 实现 `kb list` 命令并替换当前占位实现（AC: 3, 4）
  - [x] 将 `src/cli/commands/list.ts` 从占位 `SearchError` 改为真实可运行命令
  - [x] 支持 `--tag`、`--source`、`--limit`，并继续复用 `ensureConfigForCommand()` / `addConfigOptions()` / `getConfigOverrides()`
  - [x] 在本故事中仅交付稳定的纯文本输出；不要提前实现 Story 3.3 的 TTY/非 TTY/`--json` 分支

- [x] 在 `core/search/` 中定义可复用的检索/列表用例与领域类型（AC: 1, 2, 3, 4）
  - [x] 在 `searchByKeyword` 所用参数中引入元数据过滤选项，而不是复制一套新的检索主流程
  - [x] 新增 `kb list` 对应的核心入口（命名可为 `listKnowledgeItems` 或等价语义），返回领域对象而非 CLI 字符串
  - [x] 核心层保持纯业务逻辑，不直接写 SQL、不直接 `console.log`

- [x] 在 `storage/repositories/` 实现过滤查询、列表查询与总数统计（AC: 1, 2, 3, 4）
  - [x] 复用/扩展现有 `SearchRepository`、`KnowledgeItemRepository`、`TagRepository`，优先在已有仓储上演进，不重复造轮子
  - [x] 在 Repository 内完成 `knowledge_items`、`chunks`、`chunks_fts`、`tags`、`item_tags` 的关联与过滤
  - [x] 需要列表总数时提供显式计数查询或等价稳定方案，避免在 CLI 或 core 里对全量结果做二次截断统计
  - [x] 严格遵守 `snake_case -> camelCase` 仅在 Repository 边界转换

- [x] 明确过滤语义与默认排序，并用测试锁定（AC: 1, 2, 3, 4）
  - [x] `--source` 与 `knowledge_items.source_type` 保持一致，当前至少覆盖 `local-markdown`，并为后续 `web` 留兼容空间
  - [x] `--tag` MVP 先满足单标签精确过滤；不要超前设计多标签布尔表达式
  - [x] 日期过滤以 `knowledge_items.created_at` 的 ISO 时间为准；若接收 `YYYY-MM-DD`，统一先归一化后再比较，并把边界语义写进测试
  - [x] `kb list` 默认排序文档未硬性规定，必须选择一个稳定顺序并在测试中固定；推荐优先按 `created_at DESC, id DESC`

- [x] 补齐测试并更新已过时的占位断言（AC: 1, 2, 3, 4）
  - [x] 在 `src/core/search/` 增加过滤相关单测：标签、来源、时间范围、limit 与非法输入
  - [x] 在 `src/cli/commands/` 为 `search` 新参数与 `list` 输出补 CLI 单测，延续依赖注入 + `writeOut` 的测试方式
  - [x] 在 `tests/integration/search.test.ts` 扩展 `search` 过滤场景，并新增或并入 `kb list` 集成测试
  - [x] 更新 `tests/integration/cli-errors.test.ts`，去掉对 `list` 占位错误的旧假设，避免 Story 3.2 落地后产生伪失败

### Review Findings

- [ ] [Review][Decision] 无时区 ISO 字符串静默接受 — `filters.ts` 接受 `"2024-01-01T12:00:00"`（无时区后缀）并通过 `Date.parse` 归一化；该字符串在不同运行时/时区下解析结果不同，但当前代码既不报错也不文档化时区假设。需决策：拒绝无时区完整 ISO 字符串（仅接受 `YYYY-MM-DD` 或带 `Z`/`±HH:MM` 后缀的字符串），还是静默转为 UTC 并在 help 文字中说明？

- [x] [Review][Patch] `parsePositiveIntegerOption` 接受截断整数和小数 [`src/cli/commands/query-options.ts:19`] — 已在 parseInt 前增加 `/^\d+$/` 正则校验，"20abc"/"1.5" 均触发 SearchError
- [x] [Review][Patch] `searchByKeyword` 缺少 `provider.close()` — 已验证为误报，searchByKeyword 已有 try/finally { provider.close() }，无需修改
- [x] [Review][Patch] `list()` 将 `undefined` 的 `limit` 参数传给 better-sqlite3 [`src/storage/repositories/knowledge-item-repository.ts:list`] — 已改为仅在 limit 定义时才展开进 params
- [x] [Review][Patch] `listTagsByKnowledgeItemIds` 超过 SQLite 999 参数上限 [`src/storage/repositories/tag-repository.ts:listTagsByKnowledgeItemIds`] — 已加 > 999 的 StorageError 保护
- [x] [Review][Patch] `prepareSearchStatement` catch 吞噬根因错误 [`src/storage/repositories/search-repository.ts:prepareSearchStatement`] — 已用 `firstError ??= err` 保留根因，作为 cause 传入最终 StorageError
- [x] [Review][Patch] `search.ts` 中 `if (limit === undefined)` 不可达死代码 [`src/cli/commands/search.ts`] — 已删除，改为 `?? 20` 兜底
- [x] [Review][Patch] AC4 集成测试场景反了 [`tests/integration/search.test.ts`] — 复查为误报：测试场景为 2 条匹配、limit=1，已正确覆盖 total > limit 场景
- [x] [Review][Patch] CLI 单测缺少非法日期输入路径 — 已在 `tests/integration/cli-errors.test.ts` 新增 `kb list --after not-a-date` 测试，验证退出码 1 且 stderr 含 SearchError
- [x] [Review][Decision] 无时区 ISO 字符串静默接受 — 决策：保留 Date.parse 宽松解析，已在 --after/--before CLI help 文字中补充"建议 YYYY-MM-DD；完整时间戳须含时区"说明

- [x] [Review][Defer] 动态 SQL 导致无法缓存预编译 Statement [`src/storage/repositories/search-repository.ts`] — deferred, pre-existing：旧缓存针对固定 SQL，现在 SQL 按过滤条件动态生成，缓存需要按过滤组合键实现，复杂度不在本故事范围
- [x] [Review][Defer] `formatKnowledgeListText` 输出原始 UTC ISO 时间戳 [`src/cli/commands/list.ts`] — deferred, pre-existing：输出格式化属于 Story 3.3 职责，本故事明确约定不超前实现
- [x] [Review][Defer] 集成测试直接写库绕过入库路径设置 `created_at` [`tests/integration/search.test.ts`] — deferred, pre-existing：为模拟特定时间范围需要篡改 DB，测试工程实践问题，不影响业务正确性

## Dev Notes

### Epic Context And Scope

- Epic 3 的目标是让用户可通过 `kb search` 检索、通过 `kb list` 浏览，并逐步补齐过滤与输出策略；本故事承接 3.1，面向 **过滤能力 + 条目列表**，而 **TTY/非 TTY/JSON 输出策略属于 3.3**。  
  [Source: `_bmad-output/planning-artifacts/epics.md#Epic 3: 知识检索与浏览`]  
- PRD 明确要求 Journey 2 支持“全文检索 + 元数据过滤”，MVP Must-Have 同时包含 `kb search <query>` 与 `kb list`。  
  [Source: `_bmad-output/planning-artifacts/prd.md#Journey 2：检索找回（确定性检索）`]  
  [Source: `_bmad-output/planning-artifacts/prd.md#MVP Feature Set（Phase 1）`]

### Story 3.1 Intelligence

- Story 3.1 已落地 `core/search/` + `SearchRepository` + `src/cli/commands/search.ts` 的基本链路；3.2 应在此基础上演进，不要另起一套“过滤版 search”。  
  [Source: `_bmad-output/implementation-artifacts/3-1-全文检索与结果展示-kb-search.md#当前代码锚点`]  
- 3.1 已明确把 `--tag`、`--source`、`--after`、`--before`、`--json` 留给后续故事；3.2 只接手前四个过滤能力和 `kb list`，继续把 `--json` 留在 3.3。  
  [Source: `_bmad-output/implementation-artifacts/3-1-全文检索与结果展示-kb-search.md#Dev Notes`]  
- 3.1 已有核心测试、CLI 单测和 `tests/integration/search.test.ts` 的集成测样板，3.2 应复用同一测试风格。  
  [Source: `_bmad-output/implementation-artifacts/3-1-全文检索与结果展示-kb-search.md#Testing Requirements`]

### Current Code Anchors

- `src/cli/commands/search.ts` 已提供 `runSearchCommand()`、`formatSearchHitsText()` 和 `parseLimit()`；3.2 可在此处增加过滤参数，并考虑将 `parseLimit()` 抽成可共享工具。  
- `src/cli/commands/list.ts` 当前仍是占位实现：会先做 config preflight，再抛 `SearchError('list 命令将在后续 story 中实现')`；本故事必须替换它。  
- `src/core/search/index.ts` 当前只有 `searchByKeyword({ query, limit, dbPath })`；3.2 应在这里继续承接领域入口，而不是让 CLI 直接碰 Repository。  
- `src/storage/repositories/search-repository.ts` 已实现单条 FTS 查询、摘要提取和相关度排序；过滤能力应尽量基于这个仓储或与之紧邻的仓储扩展。  
- `src/storage/repositories/knowledge-item-repository.ts` 已暴露 `KnowledgeItemSummary`；`src/storage/repositories/tag-repository.ts` 已掌握标签归一化与 `item_tags` 关联写入，这些都是 `kb list` 读路径的现成锚点。

### Architecture Guardrails

- 严格遵守依赖方向：`cli/ -> core/ -> storage/`。CLI 只做参数解析与文本输出；所有 SQL 必须留在 Repository。  
  [Source: `_bmad-output/planning-artifacts/architecture.md#Structure Patterns`]  
  [Source: `_bmad-output/planning-artifacts/architecture.md#Enforcement Guidelines`]  
- 核心层不直接 `console.log`，如需要进度能力，只能通过已有的回调注入模式扩展。  
  [Source: `_bmad-output/planning-artifacts/architecture.md#Error Handling Standards`]  
- 错误必须使用 `KbError` 子类；过滤参数、检索式、列表查询相关错误应归入 `SearchError` 或被包装为 `SearchError`。  
  [Source: `_bmad-output/planning-artifacts/architecture.md#Error Handling Standards`]  
- 架构中“Search 数据流”已经把“用户输入（查询词 + 过滤条件）”作为预期形态，因此 3.2 是补全既定路线，而不是新设计。  
  [Source: `_bmad-output/planning-artifacts/architecture.md#Data Flow`]

### Data Model And Query Guidance

- 底层存储为 SQLite + FTS5；MVP 已知限制是中文分词能力有限，3.2 不引入 jieba 或外部搜索引擎。  
  [Source: `_bmad-output/planning-artifacts/architecture.md#Technical Constraints & Dependencies`]  
  [Source: `_bmad-output/planning-artifacts/prd.md#Risk Mitigation Strategy`]  
- 过滤字段落点：
  - `--source` 对应 `knowledge_items.source_type`
  - 时间过滤对应 `knowledge_items.created_at`
  - 标签过滤需要通过 `item_tags` / `tags` 关联
- `kb search` 仍以 FTS 命中为主，再叠加元数据过滤；不要先全量检索再在应用层筛选，否则容易破坏 NFR3 的性能目标。  
  [Source: `_bmad-output/planning-artifacts/prd.md#Non-Functional Requirements`]  
- `kb list` 需要返回 ID、标题、来源类型、标签列表、入库时间；建议在 Repository 侧一次性取回列表行与聚合标签，避免 CLI 拼接数据库细节。  
- 列表总数提示必须来自稳定的数据源；不要仅依赖输出行数猜测总数。

### Regression Traps

- `tests/integration/cli-errors.test.ts` 当前仍在断言 `list` 是占位命令；实现真实 `kb list` 后必须更新该测试，否则会出现伪回归。  
- 本故事不要顺手实现 `--json` 或 TTY 专用格式化，否则会与 Story 3.3 的职责发生重叠。  
- 3.1 已建立“无结果不是错误、退出码为 0”的约定；3.2 中 `search` 无结果与 `list` 空库场景也应保持同样的 CLI 语义。  
- 若需要新增共享 formatter 或 shared option helper，应保持最小抽象，只提炼已经在 `search`/`list` 两边都明确复用的逻辑。

### Testing Requirements

- 单测应覆盖：标签过滤、来源过滤、时间过滤、limit、无结果、非法日期输入、总数提示。  
- CLI 单测继续沿用依赖注入模式：为核心入口和 `writeOut()` 注入 mock，避免在测试里依赖真实 stdout。  
- 集成测试应走真实 CLI：先 `ingest` 多种来源/标签数据，再验证 `search` 与 `list` 的过滤和 limit 行为。  
- 需要显式补一个 `kb list` 场景：结果超过 limit 时，既验证仅输出前 N 条，也验证总数提示存在且稳定。  
- 性能目标沿用 PRD NFR3，测试重点是避免错误的数据路径与全表扫描，而不是写脆弱的毫秒级 benchmark。  
  [Source: `_bmad-output/planning-artifacts/prd.md#Non-Functional Requirements`]

### Git Intelligence Summary

- 最近相关提交显示 3.1 已分两步完成：先实现 `kb search` 核心能力，再补故事文档沉淀；3.2 应延续同样的实现与文档同步节奏。  
  - `f6a65d6 feat: 实现 kb search 全文检索（FTS5、SearchRepository、CLI 与测试）`
  - `4745ddd docs: 纳入 story 3-1 实施说明`
- 前一个功能提交 `718a2c0 feat: 完善入库异常处理与重复来源保护` 说明当前仓库已形成“CLI 薄层 + 核心能力 + Repository + 集成测试”的实现习惯，3.2 不应偏离这条线。

### References

- `_bmad-output/planning-artifacts/epics.md#Epic 3: 知识检索与浏览`
- `_bmad-output/planning-artifacts/prd.md#Journey 2：检索找回（确定性检索）`
- `_bmad-output/planning-artifacts/prd.md#MVP Feature Set（Phase 1）`
- `_bmad-output/planning-artifacts/prd.md#Non-Functional Requirements`
- `_bmad-output/planning-artifacts/architecture.md#Technical Constraints & Dependencies`
- `_bmad-output/planning-artifacts/architecture.md#Structure Patterns`
- `_bmad-output/planning-artifacts/architecture.md#Error Handling Standards`
- `_bmad-output/planning-artifacts/architecture.md#Enforcement Guidelines`
- `_bmad-output/planning-artifacts/architecture.md#Data Flow`
- `_bmad-output/implementation-artifacts/3-1-全文检索与结果展示-kb-search.md`
- `src/cli/commands/search.ts`
- `src/cli/commands/list.ts`
- `src/core/search/index.ts`
- `src/storage/repositories/search-repository.ts`
- `src/storage/repositories/knowledge-item-repository.ts`
- `src/storage/repositories/tag-repository.ts`
- `tests/integration/search.test.ts`
- `tests/integration/cli-errors.test.ts`

## Dev Agent Record

### Agent Model Used

GPT-5.4（Cursor）

### Debug Log References

- `pnpm vitest run src/core/search/search.test.ts src/cli/commands/search.test.ts src/cli/commands/list.test.ts tests/integration/search.test.ts tests/integration/cli-errors.test.ts`
- `pnpm test`
- `pnpm typecheck`

### Implementation Plan

- 在 CLI 层为 `search` / `list` 对齐共享参数解析，仅保留参数收集与稳定文本输出。
- 在 core 层新增过滤归一化与日期边界校验，并增加 `listKnowledgeItems` 领域入口。
- 在 Repository 层扩展 FTS 元数据过滤、列表查询、总数统计与标签读取，保持 SQL 只存在于 storage。

### Completion Notes List

- 已为 `kb search` 增加 `--tag`、`--source`、`--after`、`--before`，并通过 core 统一做日期归一化与 `SearchError` 校验。
- 已实现真实可用的 `kb list` 命令，支持 `--tag`、`--source`、`--after`、`--before`、`--limit`，输出稳定纯文本与总数提示。
- 已在 Repository 层补齐 FTS 元数据过滤、列表查询、总数统计，以及标签批量读取；`kb list` 默认排序固定为 `created_at DESC, id DESC`。
- 已新增/更新 CLI、core 与集成测试，验证标签、来源、时间范围、limit、空结果和错误路径；`pnpm test` 与 `pnpm typecheck` 已通过。

### File List

- `_bmad-output/implementation-artifacts/3-2-检索过滤与知识条目列表-kb-list.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/cli/commands/list.test.ts`
- `src/cli/commands/list.ts`
- `src/cli/commands/query-options.ts`
- `src/cli/commands/search.test.ts`
- `src/cli/commands/search.ts`
- `src/core/index.ts`
- `src/core/search/filters.ts`
- `src/core/search/index.ts`
- `src/core/search/search.test.ts`
- `src/core/search/types.ts`
- `src/storage/index.ts`
- `src/storage/repositories/knowledge-item-repository.ts`
- `src/storage/repositories/search-repository.ts`
- `src/storage/repositories/tag-repository.ts`
- `tests/fixtures/sample-article-april.md`
- `tests/integration/cli-errors.test.ts`
- `tests/integration/search.test.ts`

### Change Log

- 2026-04-22：创建 Story 3.2 开发上下文文档，并将 sprint 状态从 `backlog` 更新为 `ready-for-dev`。
- 2026-04-22：完成 Story 3.2 开发，实现 `kb search` 元数据过滤与 `kb list`，补齐 CLI/core/storage/test 覆盖，并将状态更新为 `review`。

---

**Story 完成度说明** — Ultimate context engine analysis completed - comprehensive developer guide created
