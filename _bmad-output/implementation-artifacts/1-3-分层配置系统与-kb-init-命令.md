# Story 1.3: 分层配置系统与 kb init 命令

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 用户,
I want 通过 `kb init` 交互式引导完成初始化配置,
so that 我可以快速配置知识库存储路径并开始使用工具。

## Acceptance Criteria

1. **Given** 用户首次使用工具  
   **When** 执行 `kb init`  
   **Then** 系统交互式引导用户配置知识库存储路径和数据库路径  
   **And** 生成配置文件到 `~/.config/kb/config.yaml`  
   **And** 自动触发数据库初始化
2. **Given** 已存在配置文件  
   **When** 用户再次执行 `kb init`  
   **Then** 显示当前配置并询问是否要覆盖  
   **And** 用户确认后才覆盖
3. **Given** 系统加载配置  
   **When** 存在多层配置源  
   **Then** 按优先级合并：CLI 参数 > 环境变量 > 项目配置文件（`./kb.config.yaml`）> 用户配置文件（`~/.config/kb/config.yaml`）> 默认值
4. **Given** 用户通过 CLI 参数传递 `--db-path /custom/path`  
   **When** 配置解析完成  
   **Then** 该参数值覆盖配置文件和环境变量中的同名配置
5. **Given** 必要配置缺失（如知识库路径未设置）  
   **When** 用户执行任何需要配置的命令  
   **Then** 系统交互式引导用户补充缺失配置（FR8）  
   **And** 如果是非 TTY 环境则输出明确错误提示并退出

## Tasks / Subtasks

- [x] 建立配置模型、默认值与路径约定（AC: 1, 3, 4, 5）
  - [x] 在 `src/config/schema.ts` 中定义 `Config` 类型，至少包含知识库存储路径、数据库路径，以及必要的路径来源辅助类型
  - [x] 约定用户配置文件位置为 `~/.config/kb/config.yaml`，项目配置文件位置为 `./kb.config.yaml`
  - [x] 为“仅填写 knowledgeBasePath 时如何推导 dbPath”定义明确且可测试的规则，避免调用方各自拼接路径
  - [x] 保证对外暴露的是冻结后的配置对象，符合“启动时一次加载”的架构约束

- [x] 实现分层配置加载与逐字段优先级合并（AC: 3, 4, 5）
  - [x] 在 `src/config/loader.ts` 中实现默认值、用户配置、项目配置、环境变量、CLI overrides 的读取与合并
  - [x] 保证优先级为 `CLI > ENV > project > user > default`，并按字段合并而不是整源覆盖
  - [x] 缺失配置文件时静默跳过；YAML 格式错误、字段类型错误或无效路径时抛 `ConfigError`
  - [x] 将 CLI 覆盖值设计为显式参数对象，不让 `config/` 模块直接依赖 Commander

- [x] 实现配置写入能力与 `kb init` 交互式流程（AC: 1, 2, 5）
  - [x] 在 `src/config/writer.ts` 中实现用户配置文件写入，负责创建 `~/.config/kb/` 目录并尽量设置配置文件权限为 `0600`
  - [x] 将 `src/cli/commands/init.ts` 从占位实现替换为真实初始化流程，使用交互式 Prompt 收集所需路径
  - [x] 若已有用户配置文件，先展示当前有效配置摘要并要求确认后才覆盖
  - [x] 非 TTY 环境下缺少必要输入时，不进入交互，输出明确错误并以 `ConfigError` 退出

- [x] 编排“配置保存后自动初始化数据库”的最小闭环（AC: 1）
  - [x] 复用 `core -> storage` 现有入口，在配置保存成功后调用 `ensureStorageReady({ dbPath })`
  - [x] 保持数据库初始化仍然只跑 `001-bootstrap.sql` 及现有迁移链，不新增业务 schema
  - [x] 为 `kb init` 输出可读的初始化结果摘要，例如配置文件路径、最终 `dbPath`、数据库初始化状态
  - [x] 保证配置读写与数据库初始化的错误都进入 `KbError` 体系，禁止裸 `throw new Error()`

- [x] 为后续命令预埋共享配置入口，但不提前实现真实业务能力（AC: 4, 5）
  - [x] 在 `config/` 或 `cli/` 侧抽出共享的配置解析 helper，供后续 `ingest/search/list/tag` 复用
  - [x] 视实现需要给相关命令预留共享 CLI overrides（至少 `--db-path`），但不要在本 story 中实现真实业务逻辑
  - [x] 对“需要配置的命令”补最小 preflight 机制：TTY 下可引导补齐，非 TTY 下明确报错

- [x] 补齐自动化验证与回归保护（AC: 1, 2, 3, 4, 5）
  - [x] 为配置优先级矩阵添加测试，覆盖 `CLI > ENV > project > user > default`
  - [x] 为 YAML 解析失败、字段非法、缺文件跳过、冻结对象等 loader 边界添加测试
  - [x] 为 `kb init` 首次初始化、再次执行覆盖确认、非 TTY 缺配置错误分别添加 CLI 级集成测试
  - [x] 为 `kb init` 后自动建库与 `user_version === 1` 添加集成测试，并断言不会提前创建 `chunks`、`tags`、`item_tags`、`chunks_fts`

### Review Findings

- [x] [Review][Patch] `kb init` 交互式输入的相对路径会被原样写入用户配置，后续重新加载时却按 `~/.config/kb` 重新解析，导致初始化时路径和运行时路径语义不一致 [src/cli/commands/init.ts:151]
- [x] [Review][Patch] `kb init` 先写用户配置再做数据库初始化；一旦建库或迁移失败，会遗留一份指向坏路径/坏库的持久配置，后续命令持续读取并失败 [src/cli/commands/init.ts:108]
- [x] [Review][Patch] 多个 CLI 集成测试把仓库 `cwd` 硬编码为本机绝对路径，换机器或 CI 路径后会直接失效 [tests/integration/init.test.ts:41]

## Dev Notes

- 这是 Epic 1 的第三个 story，目标是把“配置域”从占位变成后续所有命令可复用的基础设施，同时把 `kb init` 变成真正可用的入口。
- 这条 story 的价值不在于“把 init 命令填满”，而在于一次性补齐配置模型、分层加载、配置写入和初始化编排，让后续命令不必各自重复实现配置逻辑。

### Previous Story Intelligence

- `1.1` 已建立 Commander 根程序、`KbError` 层级、统一退出码和 CLI 测试风格；`1.3` 必须继续复用 `ConfigError` + CLI 顶层错误格式化，而不是自定义新的错误通道。
- `1.1` 当前 `src/cli/commands/init.ts` 仍是显式占位，说明 `1.3` 应替换这一实现，但不要借机扩张到 `ingest/search/list/tag` 的真实业务逻辑。
- `1.2` 已交付 `ensureStorageReady()`、`initializeStorage()`、`DatabaseProvider`、迁移引擎与最小 `001-bootstrap.sql`；`1.3` 在“自动触发数据库初始化”时必须复用这条链路，而不是重新实现建库或迁移逻辑。
- `1.2` 的 review 修复已经补上迁移版本唯一/连续、非法迁移文件名和数据库版本超前的保护；`1.3` 不要绕过这些 guardrails，也不要新增另一套初始化状态判断。
- 当前 CLI 集成测试已切换为 `execa('node', ['--import', 'tsx', 'src/cli/main.ts', ...])` 路径，新增 CLI 测试应沿用这一模式，避免隐式依赖 `dist/` 构建产物。

### Technical Requirements

- 配置加载应在应用启动时一次完成，结果为冻结的 `Config` 对象；核心层通过参数接收配置值，不直接访问全局配置或直接读取 `process.env`。
- 分层配置必须按字段合并，而不是让高优先级源整块覆盖低优先级对象；否则只覆盖一个字段时会误清空其它来源的有效配置。
- 用户配置文件路径固定为 `~/.config/kb/config.yaml`，项目配置文件路径固定为当前工作目录下的 `kb.config.yaml`。
- 建议将路径写入为绝对路径；至少要保证 `dbPath` 的解析规则稳定，不受命令执行目录漂移影响。
- 配置文件读写、YAML 解析、字段校验、权限设置失败都应落到 `ConfigError`；数据库初始化失败继续使用 `StorageError` 并通过 CLI 顶层统一格式化。
- 自动数据库初始化只能发生在“配置已确认并写入成功”之后；配置 loader 本身必须保持无副作用，不能一读取配置就触发建库。
- 必要配置缺失时，TTY 环境可交互补齐；非 TTY 环境必须明确报错并退出，不能阻塞等待输入。

### Architecture Compliance

- 严格遵守依赖方向：`cli/ -> core/ -> storage/`。`cli/` 可以负责参数和交互，但不能直接创建数据库连接、扫描迁移目录或写 SQL。
- `1.3` 只交付“配置系统 + kb init + 共享配置 preflight”；不得提前实现以下内容：
  - Epic 2 的真实 ingestion pipeline、Markdown adapter、入库事务或业务表结构
  - Epic 3 的检索 schema、查询构建、格式化输出策略
  - Epic 5 的标签 schema、shell completion
- 不要在本 story 中新增新的迁移文件来补业务表；自动建库只应复用 `1.2` 既有最小初始化迁移。
- 不要把“缺配置时交互补全”扩展成“占位命令开始执行业务逻辑”；对尚未实现的命令，最多只接入共享配置解析/报错机制。
- 不要引入重型配置框架、ORM 或第三方迁移库。当前项目的既定路线是轻量 CLI、显式配置加载和手写迁移。

### Library / Framework Requirements

- `@inquirer/prompts`：架构已明确这是 FR8 / FR20 的首选交互式 Prompt 方案。Web 调研显示 2026-04 的最新稳定线约为 `8.4.1`；实施时通过包管理器安装最新可解析稳定版本即可。
- `yaml`：用于读写 `kb.config.yaml` 和 `config.yaml`。Web 调研显示 2026-04 的稳定线约为 `2.8.3`，零依赖、支持 parse/stringify，适合作为本 story 的 YAML 解析与序列化库。
- 不推荐在本 story 引入 `zod` / `joi` / `cosmiconfig` / `rc` 等额外配置框架；当前配置项有限，手写校验与显式优先级合并更符合现有架构。
- Node 运行时应继续遵守当前仓库 `package.json` 中已声明的 `^20.19.0 || >=22.12.0` 区间，新增依赖需确保与该区间兼容。

### File Structure Requirements

- 推荐优先新增或修改以下文件：
  - `package.json`
  - `src/cli/index.ts`
  - `src/cli/commands/init.ts`
  - `src/config/index.ts`
  - `src/config/schema.ts`
  - `src/config/loader.ts`
  - `src/config/writer.ts`
  - `src/core/index.ts` 或 `src/core/init.ts`
  - `src/config/*.test.ts`
  - `tests/integration/init.test.ts`
- 如需抽共享 CLI overrides 或 preflight helper，可新增 `src/cli/shared-options.ts` 或同类文件，但要保持职责单一，不把配置合并逻辑塞回 `cli/commands/init.ts`。
- 文件命名继续保持 `kebab-case`，测试文件 co-located 且命名为 `*.test.ts`。
- 当前 `src/config/index.ts` 还是空导出，这正好说明配置域尚未落地；`1.3` 应优先把配置模块做成可复用 API，而不是只完成命令层表象。

### Testing Requirements

- 至少覆盖以下配置优先级场景：
  - 默认值仅作为兜底
  - 用户配置覆盖默认值
  - 项目配置覆盖用户配置
  - 环境变量覆盖项目配置
  - CLI 参数覆盖环境变量和文件配置
- 至少覆盖以下错误和边界场景：
  - YAML 文件不存在时跳过，不报错
  - YAML 语法错误或字段类型错误时抛 `ConfigError`
  - 返回的配置对象被冻结，调用方无法随意篡改
  - 非 TTY 环境下缺少必要配置时输出明确错误
- 至少覆盖以下 `kb init` 集成场景：
  - 首次执行写入 `~/.config/kb/config.yaml` 并自动完成数据库初始化
  - 再次执行时显示当前配置并要求确认，未确认不覆盖
  - 初始化完成后 `user_version === 1`
  - 初始化完成后数据库中仍不存在 `chunks`、`tags`、`item_tags`、`chunks_fts`
- 对仍是占位的命令，不要编写“真实业务成功”测试；只验证配置 preflight 和错误边界即可。

### Latest Technical Information

- `@inquirer/prompts` 当前稳定线约为 `8.4.1`（2026-04），提供 `input`、`confirm`、`select` 等 CLI 交互能力，适合作为 `kb init` 和缺配置补全的基础依赖。
- `yaml` 当前稳定线约为 `2.8.3`（2026-03），提供稳定的 `parse` / `stringify` API，适合直接用于用户配置和项目配置文件的读写。
- 现有存储初始化链路已经通过 `pnpm test` / `pnpm typecheck` / `pnpm build` 验证，因此本 story 不应替换存储初始化方案，而应只在配置写入后调用 `ensureStorageReady()`。

### Project Structure Notes

- 当前 `src/config/index.ts` 为空，`src/cli/commands/init.ts` 仍是占位，说明 `1.3` 真正的主工作量在配置域落地，而不是 CLI 框架搭建。
- 当前 `src/core/index.ts` 已有 `ensureStorageReady()`，`src/storage/` 已实现 provider / migrator / bootstrap 迁移，因此 `1.3` 不需要重新定义“数据库准备完成”的概念。
- 当前未发现 `project-context.md`；本 story 应以 `epics.md`、`prd.md`、`architecture.md` 以及前两条 story 文件和现有代码为唯一事实来源。
- 当前 `sprint-status.yaml` 中 `1-3-分层配置系统与-kb-init-命令` 还是 `backlog`，本文件创建后应切换为 `ready-for-dev`。

### References

- Story 边界与验收标准：`_bmad-output/planning-artifacts/epics.md`
- 产品目标、分层配置、配置文件位置、退出码：`_bmad-output/planning-artifacts/prd.md`
- 配置加载模式、目录结构、分层依赖、Prompt 库建议：`_bmad-output/planning-artifacts/architecture.md`
- 前一故事上下文与已落地存储初始化模式：`_bmad-output/implementation-artifacts/1-2-数据库迁移引擎与最小初始化.md`
- 当前 CLI 与错误处理实现：`src/cli/index.ts`、`src/cli/commands/init.ts`、`src/errors/index.ts`
- 当前存储初始化入口：`src/core/index.ts`、`src/storage/index.ts`

## Dev Agent Record

### Agent Model Used

GPT-5.4

### Debug Log References

- `pnpm vitest run src/config/loader.test.ts src/config/writer.test.ts src/cli/commands/init.test.ts tests/integration/init.test.ts tests/integration/cli-errors.test.ts`
- `pnpm vitest run src/storage/migrator.test.ts src/config/loader.test.ts src/config/writer.test.ts src/cli/commands/init.test.ts tests/integration/init.test.ts tests/integration/cli-errors.test.ts`
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- `HOME="$TMP_HOME" node bin/kb.js init --knowledge-base-path "$TMP_KB" --db-path "$TMP_KB/knowledge.db"`

### Completion Notes List

- 2026-04-20: 已为 Story 1.3 生成完整开发上下文，覆盖分层配置、`kb init`、配置写入、自动数据库初始化和非 TTY 边界。
- 2026-04-20: 已吸收 `1.1` 的 CLI / 错误处理模式与 `1.2` 的存储初始化能力，避免在本 story 中重复造轮子。
- 2026-04-20: 已补充交互式 Prompt 与 YAML 配置库的最新稳定线信息，供实施时作为依赖选择参考。
- 2026-04-20: 已新增 `config/schema.ts`、`config/loader.ts`、`config/writer.ts`，实现用户配置路径约定、四层优先级合并、路径归一化、`dbPath` 派生与冻结配置对象。
- 2026-04-20: 已将 `kb init` 从占位命令替换为真实初始化流程，支持交互式输入、覆盖确认、非 TTY 报错、配置写入和自动数据库初始化。
- 2026-04-20: 已为 `ingest/search/list/tag` 预埋共享配置 preflight 与 `--knowledge-base-path` / `--db-path` 覆盖入口，同时保持业务逻辑仍为占位。
- 2026-04-20: 已补充配置模块单测、`init` 流程测试、CLI 集成测试，并修复构建产物下的默认迁移目录解析，确保 `bin/kb.js init` 可正常运行。

### File List

- `package.json`
- `pnpm-lock.yaml`
- `bin/kb.js`
- `src/storage/migrator.ts`
- `src/config/index.ts`
- `src/config/schema.ts`
- `src/config/loader.ts`
- `src/config/writer.ts`
- `src/config/loader.test.ts`
- `src/config/writer.test.ts`
- `src/cli/shared-options.ts`
- `src/cli/commands/init.ts`
- `src/cli/commands/init.test.ts`
- `src/cli/commands/ingest.ts`
- `src/cli/commands/search.ts`
- `src/cli/commands/list.ts`
- `src/cli/commands/tag.ts`
- `tests/integration/init.test.ts`
- `tests/integration/cli-errors.test.ts`
- `_bmad-output/implementation-artifacts/1-3-分层配置系统与-kb-init-命令.md`

### Change Log

- 2026-04-20: 完成 Story 1.3 实现，新增分层配置模块、`kb init` 交互式初始化、共享配置 preflight、相关单元/集成测试，以及构建产物下的迁移目录解析修复。
