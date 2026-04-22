# Story 3.3: 输出格式化策略（TTY / 非 TTY / JSON）

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 用户,
I want 在不同环境下获得合适的输出格式,
so that 无论在终端交互还是脚本管道中都能高效使用.

## Acceptance Criteria

1. **Given** 用户在 TTY 终端执行 `kb search` 或 `kb list`  
   **When** `stdout` 是 TTY  
   **Then** 使用富文本输出：彩色高亮关键词、表格/列表布局、摘要截断

2. **Given** 用户在管道或脚本中执行命令  
   **When** `stdout` 不是 TTY（如 `kb search "关键词" | grep xxx`）  
   **Then** 自动切换为纯文本输出  
   **And** 输出中不包含 ANSI 颜色转义码

3. **Given** 用户执行 `kb search "关键词" --json` 或 `kb list --json`  
   **When** 输出格式为 JSON  
   **Then** 返回结构化 JSON：`{ "items": [...], "total": N }`  
   **And** 字段使用 `camelCase`  
   **And** 日期格式为 ISO 8601 字符串

4. **Given** 命令执行出错且带有 `--json` 参数  
   **When** 错误被 CLI 捕获  
   **Then** 以 JSON 格式输出错误：`{ "error": { "type": "SearchError", "message": "...", "step": "..." } }`  
   **And** 继续保持现有退出码约定（成功 `0`、运行期失败 `1`、输入/命令错误 `2`）

## Tasks / Subtasks

- [x] 在 `cli/formatters/` 建立输出策略分发，而不是把 TTY / plain / JSON 逻辑散落在各命令里（AC: 1, 2, 3, 4）
  - [x] 新增 `src/cli/formatters/index.ts` 作为策略入口，并补齐 `tty` / `plain` / `json` formatter（文件名可与架构文档保持一致）
  - [x] 设计最小可复用的 formatter contract，输入保持领域对象，输出保持字符串；不要让 core 层知道终端颜色或 JSON 序列化细节
  - [x] 让 `search` 与 `list` 共用同一模式选择逻辑：`--json` 优先，其次看 `process.stdout.isTTY`

- [x] 让 `kb search` / `kb list` 接入三态输出，同时保持 CLI 薄层（AC: 1, 2, 3）
  - [x] 在 `src/cli/commands/search.ts`、`src/cli/commands/list.ts` 增加 `--json` 选项，并将现有纯文本 formatter 改为通过策略层输出
  - [x] TTY 输出负责彩色高亮、摘要截断、时间本地化与可读布局；非 TTY plain 输出保持稳定、可 grep、无颜色
  - [x] `kb list` 继续复用已有 `ListKnowledgeItemsResult`，不要为 JSON 再造一套列表查询流程
  - [x] `kb search` 当前只有 `SearchHit[]`，若 JSON 需要 `{ items, total }`，应在 core / repository 层补齐总数能力，而不是把“当前展示条数”伪装成总数

- [x] 统一 JSON 错误输出与现有 `handleCliError()` 管道（AC: 4）
  - [x] 扩展 `src/cli/index.ts` 的错误处理路径，使 `KbError`、`CommanderError` 与未知错误在 `--json` 模式下都能输出结构化错误对象
  - [x] 保持现有退出码与 `KbError` 字段（`type`/`message`/`step`/`source`）语义一致，不要引入另一套错误模型
  - [x] 避免先写入半段人类文本、再输出 JSON 错误，确保脚本消费者拿到的是单一稳定格式

- [x] 必要时在核心层补充 search 的结构化结果契约，但不要破坏既有职责边界（AC: 3）
  - [x] 评估是为 `searchByKeyword()` 增加 `total`，还是新增等价的结构化搜索入口；二选一即可，但 CLI 不应自行拼装数据库统计
  - [x] 若需要总数统计，应在 `SearchRepository` 中补充 count 查询或等价稳定实现，避免在应用层对已截断结果“猜总数”
  - [x] 继续保持 `cli -> core -> storage` 单向依赖，SQL 仅留在 repository

- [x] 补齐 TTY / 非 TTY / JSON 的单测与集成测（AC: 1, 2, 3, 4）
  - [x] 在 `src/cli/commands/search.test.ts` 与 `list.test.ts` 增加 `--json`、TTY、非 TTY 分支断言
  - [x] 在 `src/cli/index.test.ts` 增加 JSON 错误输出测试，覆盖 `KbError`、`CommanderError`、未知错误
  - [x] 在 `tests/integration/cli-errors.test.ts` / `tests/integration/search.test.ts` 验证：非 TTY 默认纯文本、`--json` 成功输出、`--json` 错误输出、无 ANSI 污染
  - [x] 保留并复验既有契约：无结果仍为成功退出、非法参数仍可测试且退出码稳定

## Dev Notes

### Epic Context And Scope

- Epic 3 的完整目标是：`kb search` 检索、`kb list` 浏览、支持元数据过滤，并在 TTY / 非 TTY / JSON 三种环境下返回合适输出；3.3 是该 Epic 在“输出与集成”上的收口故事。  
  [Source: `_bmad-output/planning-artifacts/epics.md#Epic 3: 知识检索与浏览`]
- PRD 已明确把“用户终端富文本”“stdout 非 TTY 自动纯文本”“`--json` 结构化输出”定义为统一输出能力，而不是某个单命令的临时特例。  
  [Source: `_bmad-output/planning-artifacts/prd.md#Output Formats`]
- 3.3 不新增检索过滤语义、不新增数据模型、不改入库链路；范围仅限 search/list 的输出策略与错误呈现。超出该范围的交互式能力、Shell 补全等仍属于其他故事。  
  [Source: `_bmad-output/planning-artifacts/epics.md#Story 3.3: 输出格式化策略（TTY / 非 TTY / JSON）`]

### Story 3.1 / 3.2 Intelligence

- Story 3.1 明确把 `TTY / 非 TTY / --json` 留给 3.3，本故事应在既有 `kb search` 真实实现之上增加格式化策略，而不是重写检索链路。  
  [Source: `_bmad-output/implementation-artifacts/3-1-全文检索与结果展示-kb-search.md#Dev Notes`]
- Story 3.2 已交付稳定纯文本 `search` / `list` 输出，并在文档中明确“不要提前实现 Story 3.3 的 TTY/非 TTY/JSON 分支”；3.3 应直接承接这些函数与测试，而不是推翻其文本基线。  
  [Source: `_bmad-output/implementation-artifacts/3-2-检索过滤与知识条目列表-kb-list.md#Tasks / Subtasks`]
- 3.2 的 deferred review 已指出 `formatKnowledgeListText` 目前输出原始 UTC ISO 时间戳，这正是 3.3 应处理的展示层职责；无需在 core/storage 层为“本地化时间”做额外数据改造。  
  [Source: `_bmad-output/implementation-artifacts/3-2-检索过滤与知识条目列表-kb-list.md#Review Findings`]
- 3.2 已抽出 `parsePositiveIntegerOption` 与 `normalizeSearchFilters` 等共享逻辑；3.3 若新增 `--json`，应延续“抽公共逻辑但保持最小抽象”的做法。  
  [Source: `_bmad-output/implementation-artifacts/3-2-检索过滤与知识条目列表-kb-list.md#Regression Traps`]

### Current Code Anchors

- `src/cli/commands/search.ts` 当前只提供 `formatSearchHitsText()` 纯文本输出，并直接 `writeOut()` 到 stdout；尚未识别 `stdout.isTTY`，也没有 `--json`。  
- `src/cli/commands/list.ts` 当前只提供 `formatKnowledgeListText()` 纯文本输出，已具备 `{ items, total }` 领域返回值，是 3.3 接入 JSON 的自然入口。  
- `src/cli/index.ts` 的 `handleCliError()` 当前固定把 `KbError` 格式化为多行文本写入 stderr；3.3 必须在此处或其上层接入 JSON 错误模式。  
- `src/cli/commands/ingest.ts` 已有 `resolveIo()` / `stdinIsTTY` / `stdoutIsTTY` 的注入式 IO 模式，可借鉴测试方式；但 3.3 的“输出格式选择”应以 `stdout.isTTY` 为主，因为 AC 针对的是输出通道而非交互性。  
- `src/cli/formatters/` 目前只有 `ingest-progress.ts`；而架构文档已明确该目录应承载 `tty-formatter.ts`、`json-formatter.ts`、`plain-formatter.ts`，3.3 应把目录结构补齐。  
- `src/core/search/index.ts` 当前 `searchByKeyword()` 返回 `SearchHit[]`，没有 `total`；`listKnowledgeItems()` 已返回 `ListKnowledgeItemsResult`。若 search JSON 也必须输出 `{ items, total }`，需要在 core/repository 层显式补能力。  
- `src/storage/repositories/search-repository.ts` 当前只做命中查询与 limit 截取，没有 count；若 3.3 要返回 total，应在 repository 层提供稳定统计，而不是在 CLI 通过 `items.length` 冒充总数。

### Architecture Guardrails

- 严格遵守依赖方向：`cli/ -> core/ -> storage/`。CLI 负责参数解析、TTY 检测、输出格式化；core 负责业务对象；SQL 仍只存在于 repository。  
  [Source: `_bmad-output/planning-artifacts/architecture.md#Structure Patterns`]
- 架构已明确 `cli/formatters/` 是输出适配层，支持 TTY / JSON / plain 三种模式；3.3 应采用策略分发，而不是在 `search.ts` / `list.ts` 里堆大型条件分支。  
  [Source: `_bmad-output/planning-artifacts/architecture.md#Structure Patterns`]  
  [Source: `_bmad-output/planning-artifacts/architecture.md#Format Patterns`]
- JSON 输出统一使用 `camelCase` 字段名，日期为 ISO 8601；TTY 输出才做本地化时间与富文本增强。  
  [Source: `_bmad-output/planning-artifacts/architecture.md#Format Patterns`]
- 错误处理仍沿用 `KbError` 层级与 CLI 统一捕获；JSON 错误是“同一错误模型的另一种序列化方式”，不要在命令内直接 `console.error(JSON.stringify(...))` 绕开主错误管道。  
  [Source: `_bmad-output/planning-artifacts/architecture.md#Error Handling Standards`]
- 核心层不能直接 `console.log` / `process.stdout.write`；格式化、颜色、终端宽度、摘要截断都属于 CLI 层。  
  [Source: `_bmad-output/planning-artifacts/architecture.md#Error Handling Standards`]

### Library / Runtime Guidance

- 当前仓库运行时依赖里没有终端着色/表格库，且架构强调轻量 CLI、低启动开销；3.3 优先考虑零依赖或极小增量实现，只有在收益明确时才新增依赖。  
  [Source: `package.json`]  
  [Source: `_bmad-output/planning-artifacts/architecture.md#Selected Starter: 手动搭建（Commander + tsup + vitest）`]
- Node 官方文档建议使用 `process.stdout.isTTY` 判断是否连接到终端；在管道/重定向场景该值为 `false`，应据此关闭颜色与富文本。  
  [External: [Node.js TTY docs](https://nodejs.org/api/tty.html)]
- 若考虑使用 `chalk`，需要注意 Chalk 5 为 ESM-only；故事实现前必须验证与当前构建/产物形态兼容。若兼容性不明确，优先使用手写最小 ANSI helper 或不新增依赖。  
  [External: [chalk v5 release notes](https://github.com/chalk/chalk/releases/tag/v5.0.0)]  
  [External: [chalk repository](https://github.com/chalk/chalk)]

### File Structure Requirements

- 预计重点修改 / 新增：
  - `src/cli/commands/search.ts`
  - `src/cli/commands/list.ts`
  - `src/cli/index.ts`
  - `src/cli/formatters/index.ts`
  - `src/cli/formatters/tty-formatter.ts`
  - `src/cli/formatters/plain-formatter.ts`
  - `src/cli/formatters/json-formatter.ts`
  - `src/core/search/index.ts`
  - `src/core/search/types.ts`
  - `src/storage/repositories/search-repository.ts`
  - `src/cli/commands/search.test.ts`
  - `src/cli/commands/list.test.ts`
  - `src/cli/index.test.ts`
  - `tests/integration/search.test.ts`
  - `tests/integration/cli-errors.test.ts`
- 若最终选择新增共享 IO / formatter context，请保持其位于 `cli/` 下，不要把终端环境判断下沉到 `core/`。
- 不要修改 `ingest` 的进度渲染语义，除非为抽共享 formatter 基础设施所必需；3.3 的主范围是 `search` / `list`。

### Regression Traps

- 不要新增第二套“JSON 版 search/list”查询逻辑；结构化输出应复用现有核心入口，必要时只扩充返回类型或 repository 能力。  
- 不要把 `stdout` 是否 TTY 与 `stdin && stdout` 的“交互模式”混为一谈；search/list 的输出选择只应基于输出通道。  
- 不要让 JSON 模式下残留任何人类文本、ANSI 颜色码或多余换行，确保脚本消费者可以直接 `JSON.parse()`。  
- 不要破坏既有契约：无结果仍是成功退出；输入校验/命令错误的退出码与当前 `handleCliError()` 保持一致。  
- 如果要为 search 增加 `total`，不要用 limit 后结果长度代替真实总数；那会让 JSON 合约与 list 不一致，也会误导调用方。  
- 若 TTY 输出需要关键词高亮，只在展示字符串上做处理，不要反向污染 FTS 检索式或存储层 snippet 语义。

### Testing Requirements

- 单测至少覆盖：
  - `search` / `list` 在 TTY、非 TTY、`--json` 三种模式下的输出选择
  - JSON 成功体为 `{ items, total }` 且字段为 `camelCase`
  - JSON 错误体包含 `error.type`、`error.message`、`error.step`
  - 非 TTY 输出不含 ANSI 转义码
  - 无结果仍退出 `0` 且 JSON/plain/TTY 均有稳定行为
- `src/cli/index.test.ts` 需要扩展 `handleCliError()` 的 JSON 分支；除 `KbError` 外，还要覆盖 `CommanderError` 与未知异常。  
- 集成测试可继续利用 `execa` 默认非 TTY 的特点验证 plain 输出；若要验证 TTY 分支，优先通过依赖注入/可替换 writer 做单测，而不是依赖真实 pseudo-terminal。  
- 对 `search --json` 新增集成测时，要显式断言 `total` 的正确性；这会反向约束 repository/count 设计不能偷懒。  
- 若引入截断逻辑，测试应锁定“截断发生”而非具体终端宽度像素，避免脆弱断言。

### Git Intelligence Summary

- 最近相关提交已经形成稳定模式：先在 `cli` / `core` / `storage` / `tests` 四层成套落地功能，再补 story 文档沉淀。3.3 应继续沿用这一节奏。  
  - `f6a65d6 feat: 实现 kb search 全文检索（FTS5、SearchRepository、CLI 与测试）`
  - `f5fe4f6 feat(search): 实现 kb search 元数据过滤与 kb list 命令（Story 3.2）`
  - `41ff509 docs: 纳入 story 3-2 实施说明与评审发现`
- 3.2 功能提交已明确：search/list、共享 option parsing、repository 过滤与测试都已就绪，因此 3.3 的最小增量应集中在 formatter 与 error/output contract，而不是重做基础能力。

### Project Context

- 未找到 `project-context.md`；本故事以 `epics.md`、`prd.md`、`architecture.md`、Story 3.1 / 3.2 文档与当前源码为准。

### References

- `_bmad-output/planning-artifacts/epics.md#Epic 3: 知识检索与浏览`
- `_bmad-output/planning-artifacts/epics.md#Story 3.3: 输出格式化策略（TTY / 非 TTY / JSON）`
- `_bmad-output/planning-artifacts/prd.md#Output Formats`
- `_bmad-output/planning-artifacts/architecture.md#Structure Patterns`
- `_bmad-output/planning-artifacts/architecture.md#Format Patterns`
- `_bmad-output/planning-artifacts/architecture.md#Error Handling Standards`
- `_bmad-output/implementation-artifacts/3-1-全文检索与结果展示-kb-search.md`
- `_bmad-output/implementation-artifacts/3-2-检索过滤与知识条目列表-kb-list.md`
- `src/cli/index.ts`
- `src/cli/commands/search.ts`
- `src/cli/commands/list.ts`
- `src/cli/commands/ingest.ts`
- `src/cli/formatters/ingest-progress.ts`
- `src/core/search/index.ts`
- `src/core/search/types.ts`
- `src/storage/repositories/search-repository.ts`
- `package.json`
- [Node.js TTY docs](https://nodejs.org/api/tty.html)
- [chalk v5 release notes](https://github.com/chalk/chalk/releases/tag/v5.0.0)
- [chalk repository](https://github.com/chalk/chalk)

## Dev Agent Record

### Agent Model Used

GPT-5.4（Cursor）

### Debug Log References

- `git log -5 --oneline`
- `git show --stat --format=medium --summary f6a65d6`
- `git show --stat --format=medium --summary f5fe4f6`
- `git show --stat --format=medium --summary 41ff509`
- `date -Iseconds`
- `npm test -- src/core/search/search.test.ts src/cli/commands/search.test.ts src/cli/commands/list.test.ts src/cli/index.test.ts tests/integration/search.test.ts tests/integration/cli-errors.test.ts`
- `npm test`
- `npm run typecheck`

### Implementation Plan

- 在 `cli/formatters/` 建立统一策略分发，让 `search` / `list` 成功输出和错误输出都能复用同一模式选择逻辑。
- 评估并补齐 `search` 结构化返回的 `total` 能力，保持 JSON 合约与 `list` 一致，同时不打破 `cli -> core -> storage` 分层。
- 通过单测 + 集成测锁定三态输出、JSON 错误、退出码和“无 ANSI 污染”的脚本契约。

### Completion Notes List

- 2026-04-22：创建 Story 3.3 开发上下文文档，完成需求、架构、代码锚点、前序故事经验与技术选型风险梳理。
- 2026-04-22：新增 `cli/formatters` 三态输出策略层，`search` / `list` 统一走 `--json` 优先、否则按 `stdout.isTTY` 选择 TTY/plain 输出。
- 2026-04-22：将 `searchByKeyword()` 扩展为返回 `{ items, total }`，并在 `SearchRepository` 补充 count 查询，避免 CLI 伪造总数。
- 2026-04-22：扩展 `handleCliError()` 的 JSON 分支，覆盖 `KbError`、`CommanderError` 与未知错误，并在 `--json` 下抑制 Commander 预写入的人类文本。
- 2026-04-22：补齐 TTY / 非 TTY / JSON 的单测与集成测，执行全量 `vitest` 与 `tsc --noEmit` 通过。

### File List

- `_bmad-output/implementation-artifacts/3-3-输出格式化策略-tty-非-tty-json.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/cli/commands/list.ts`
- `src/cli/commands/list.test.ts`
- `src/cli/commands/search.ts`
- `src/cli/commands/search.test.ts`
- `src/cli/formatters/index.ts`
- `src/cli/formatters/json-formatter.ts`
- `src/cli/formatters/plain-formatter.ts`
- `src/cli/formatters/tty-formatter.ts`
- `src/cli/index.test.ts`
- `src/cli/index.ts`
- `src/cli/main.ts`
- `src/core/index.ts`
- `src/core/search/index.ts`
- `src/core/search/search.test.ts`
- `src/core/search/types.ts`
- `src/storage/repositories/search-repository.ts`
- `tests/integration/cli-errors.test.ts`
- `tests/integration/search.test.ts`

### Review Findings

- [x] [Review][Patch] `highlightKeywords` 在 query 为空字符串时应提前返回，避免构造无意义正则 [`src/cli/formatters/tty-formatter.ts`]
- [x] [Review][Patch] `CommanderError.exitCode` 未设置 fallback，可能导致 `process.exitCode = undefined` 悄然清零退出码 [`src/cli/formatters/index.ts:exitCode`]
- [x] [Review][Patch] `formatSearchResultPlain` 未输出总条数，与 TTY 和 list 的 plain 模式行为不一致 [`src/cli/formatters/plain-formatter.ts`]
- [x] [Review][Patch] 缺少 `search --json` 无结果时的专项单测（spec 要求"JSON/plain/TTY 均有稳定行为"）[`src/cli/commands/search.test.ts`]
- [x] [Review][Defer] 搜索执行两次独立 DB 查询（results + count）无事务保护，极端高并发写入时 total 可能与 items 不一致 [`src/core/search/index.ts`] — deferred, pre-existing design trade-off
- [x] [Review][Defer] TTY 格式化器不检查 `NO_COLOR` / `TERM=dumb` 环境变量，不符合 no-color.org 规范 [`src/cli/formatters/tty-formatter.ts`] — deferred, enhancement beyond current scope
- [x] [Review][Defer] `formatSearchResultJson` / `formatKnowledgeListJson` 直接序列化内部类型，内部 schema 即为公开 JSON 契约，未来字段改名会无声破坏下游 [`src/cli/formatters/json-formatter.ts`] — deferred, future API stability concern
- [x] [Review][Defer] JSON 错误体输出 `source` 字段超出 AC4 规范定义（AC4 仅定义 type/message/step），属于未声明的扩展 [`src/cli/formatters/json-formatter.ts`] — deferred, benign extension, useful for debugging
- [x] [Review][Defer] `argv.includes('--json')` 预解析检测分散于 `run()` 与 `main.ts` 两处，单一事实来源略显冗余 [`src/cli/index.ts`, `src/cli/main.ts`] — deferred, intentional defensive pattern

### Change Log

- 2026-04-22：创建 Story 3.3，状态置为 `ready-for-dev`，补齐 TTY / 非 TTY / JSON 输出策略的开发约束与实现指导。
- 2026-04-22：实现 `kb search` / `kb list` 的 TTY、plain、JSON 三态输出与统一 formatter 分发。
- 2026-04-22：实现 `search` 的结构化总数返回、JSON 错误输出与相关单测/集成测试，并完成全量回归与类型检查。

---

**Story 完成度说明** — Ultimate context engine analysis completed - comprehensive developer guide created
