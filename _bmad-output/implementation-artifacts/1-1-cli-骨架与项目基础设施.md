# Story 1.1: CLI 骨架与项目基础设施

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 用户,
I want 安装 `kb` 工具后能看到可用命令列表和帮助信息,
so that 我知道工具已正确安装并可以开始使用。

## Acceptance Criteria

1. **Given** 项目代码已构建  
   **When** 用户执行 `kb --help`  
   **Then** 终端输出可用的子命令列表（`init`、`ingest`、`search`、`list`、`tag`）和全局选项  
   **And** 退出码为 `0`
2. **Given** 用户执行未知命令如 `kb foo`  
   **When** Commander 无法匹配命令  
   **Then** 输出清晰的错误提示，提示可用命令  
   **And** 退出码为 `2`（参数错误）
3. **Given** 工具执行过程中发生内部错误  
   **When** 错误被捕获  
   **Then** 错误通过 `KbError` 类型层级（`IngestionError` / `StorageError` / `SearchError` / `ConfigError`）携带结构化上下文（`step`、`source`、`cause`）  
   **And** CLI 层统一格式化输出人类友好的错误信息，退出码为 `1`
4. **Given** 项目使用 `pnpm build` 构建  
   **When** 构建完成后执行 `pnpm link --global`  
   **Then** `kb` 命令在系统 `PATH` 中可用
5. Story 1.1 中注册到 CLI 的子命令允许先以占位形式存在，但不得提前实现数据库迁移、真实配置加载、交互式 `kb init`、ingestion pipeline、检索逻辑或 shell 补全。

## Tasks / Subtasks

- [x] 初始化工程元数据与基础工具链（AC: 4, 5）
  - [x] 创建 `package.json`，定义 `build`、`dev`、`test`、`typecheck` 等基础脚本
  - [x] 按架构约束使用 `pnpm`、TypeScript strict mode、ESM 源码组织
  - [x] 配置 `tsconfig.json`、`tsup.config.ts`、`vitest.config.ts`
  - [x] 在 `README.md` 中写明本地构建与 `pnpm link --global` 使用方式
  - [x] 如在本 story 中提前安装 `better-sqlite3`，需同步声明 Node.js 最低版本要求，避免后续环境不兼容

- [x] 搭建目录骨架与可执行入口（AC: 1, 4, 5）
  - [x] 创建 `bin/kb.js`，作为 CLI 可执行入口并指向构建产物
  - [x] 建立基础目录：`src/cli/`、`src/core/`、`src/storage/`、`src/adapters/`、`src/config/`、`src/errors/`、`src/utils/`
  - [x] 为各层提供最小 `index.ts` 导出，保持后续 story 可平滑增量开发
  - [x] 保证依赖方向为 `cli/ -> core/ -> storage/`，不要在 1.1 中引入反向依赖

- [x] 实现 Commander 根程序与命令注册（AC: 1, 2, 4, 5）
  - [x] 在 `src/cli/index.ts` 中创建 Commander `program`
  - [x] 注册 `init`、`ingest`、`search`、`list`、`tag` 五个子命令
  - [x] 让 `kb --help` 能稳定展示命令列表、帮助信息与全局选项
  - [x] 未知命令时输出可操作提示并返回退出码 `2`
  - [x] 各子命令在 1.1 可为最小占位实现，但占位文案应明确“功能将在后续 story 中完成”

- [x] 建立统一错误模型与 CLI 顶层异常处理（AC: 3, 5）
  - [x] 在 `src/errors/index.ts` 中定义 `KbError` 基类
  - [x] 定义 `IngestionError`、`StorageError`、`SearchError`、`ConfigError`
  - [x] 统一约定错误上下文字段：`step`、`source`、`cause`
  - [x] 在 CLI 顶层对 `KbError` 和未知异常分别处理，并统一格式化输出
  - [x] 禁止在核心约束中留下裸 `throw new Error()` 的实现路径

- [x] 补齐最小验证与回归保护（AC: 1, 2, 3, 4）
  - [x] 为 `kb --help`、未知命令退出码、`KbError` 输出各添加至少一个自动化测试
  - [x] 验证构建产物可被 `pnpm link --global` 暴露为 `kb`
  - [x] 验证 `pnpm build` 与 `pnpm test` 可运行

### Review Findings

- [x] [Review][Patch] 测试与 CLI 入口对预构建 `dist` 产物存在隐式依赖，干净环境下 `pnpm test` / `node bin/kb.js` 会直接失败 [bin/kb.js:6]
- [x] [Review][Patch] CLI 顶层异常处理未完全统一，`createProgram()` 或入口阶段的早期异常会绕过 `formatKbError()`，导致结构化上下文丢失 [src/cli/index.ts:29]
- [x] [Review][Patch] 声明的 Node 版本范围比实际依赖支持范围更宽，`>=20` 会错误覆盖一部分无法安装/运行的版本区间 [package.json:8]

## Dev Notes

- 这是整个项目的第一个实施 story，目标是建立可执行、可测试、可扩展的 CLI 基础骨架，而不是交付任何真实业务能力。
- 该 story 的价值在于先固定技术栈、目录结构、错误边界和分发方式，让后续 `1.2`、`1.3` 及更后面的 story 都在同一条实现轨道上推进。

### Technical Requirements

- 使用手动搭建方案，不使用现成 CLI 脚手架；技术栈以架构文档为准：TypeScript（strict mode）+ Node.js（LTS）+ ESM + Commander.js + tsup + vitest + tsx + pnpm。
- `src/` 目录结构必须从一开始按分层职责建立，至少包含：`cli`、`core`、`storage`、`adapters`、`config`、`errors`、`utils`。
- `cli/` 是薄层，只负责命令解析、帮助信息、退出码与人类可读输出；不要把业务逻辑、数据库访问或配置合并逻辑写进 CLI 层。
- 错误模型必须统一到 `KbError` 类型层级，错误对象应携带 `step`、`source`、`cause` 等结构化信息，便于后续 story 直接复用。
- 源码使用 ESM 组织，但构建输出遵循架构文档的 CJS + `.d.ts` 约定，以兼容 `better-sqlite3` 的后续接入。
- 退出码遵循 PRD：`0` 成功，`1` 一般错误，`2` 参数错误。

### Architecture Compliance

- 必须遵守单向依赖：`cli/ -> core/ -> storage/`。`cli/` 不直接访问 Repository，`core/` 不反向依赖 `cli/`。
- 该 story 只建立结构与边界，不提前实现以下能力：
  - Story `1.2` 的数据库文件创建、`DatabaseProvider`、迁移引擎、`PRAGMA user_version`、SQL 迁移脚本、事务回滚
  - Story `1.3` 的分层配置、`kb init` 交互式流程、`~/.config/kb/config.yaml` 落盘、缺配置时交互式补全
  - Epic `2` / `3` / `5` 的 ingestion、search、list 真实业务、TTY/非 TTY/JSON 输出策略、shell 补全
- `init`、`ingest`、`search`、`list`、`tag` 在本 story 中可以是占位命令，但必须通过统一注册机制出现在帮助信息里。
- 占位命令的实现应尽量轻量，避免在 1.1 内引入后续 story 才需要的依赖和复杂逻辑。

### Library / Framework Requirements

- Commander.js：优先使用当前稳定主线。检索结果显示 `v14.0.3` 为当前稳定版本，而 `v15` 仍处预发布且转向 ESM-only、Node.js 要求更高；在未重新评估运行时基线前，优先保持 14.x 稳定线。
- tsup：当前稳定版本约为 `8.5.1`。虽然生态上已有维护状态提醒，但架构已明确选择 tsup，本 story 不应擅自更换构建器。
- Vitest：使用当前稳定大版本的最新兼容补丁即可；搜索结果存在 patch 版本信息不一致，实施时应以包管理器解析结果为准。
- better-sqlite3：当前稳定版本约为 `12.9.0`，并要求 Node.js `>=20`。如果在 1.1 中先安装该依赖以锁定后续基线，应同步在 `README` / `engines` 中说明最低 Node 版本。
- Node.js：保持 LTS 基线，且至少满足 `better-sqlite3` 的 Node `>=20` 约束；不要为了追新而把项目绑定到尚未在架构文档中确认的新主线版本。

### File Structure Requirements

- 推荐优先触达以下文件与目录：
  - `package.json`
  - `tsconfig.json`
  - `tsup.config.ts`
  - `vitest.config.ts`
  - `README.md`
  - `bin/kb.js`
  - `src/cli/index.ts`
  - `src/cli/commands/init.ts`
  - `src/cli/commands/ingest.ts`
  - `src/cli/commands/search.ts`
  - `src/cli/commands/list.ts`
  - `src/cli/commands/tag.ts`
  - `src/errors/index.ts`
  - `src/core/index.ts`
  - `src/storage/index.ts`
- 文件命名遵循架构约束中的 `kebab-case`，测试文件命名为 `*.test.ts`。
- 根目录无需在本 story 中创建数据库迁移文件、配置 schema、adapter 具体实现或 repository 具体实现。

### Testing Requirements

- 至少覆盖以下最小回归场景：
  - `kb --help` 正常输出并返回退出码 `0`
  - 未知命令返回退出码 `2` 且提示可用命令
  - 触发一个 `KbError` 时返回退出码 `1` 且输出人类可读错误信息
- 单元测试尽量与源码 colocated；如果需要针对 CLI 二进制做 smoke / integration 验证，可放在 `tests/integration/`。
- 测试只验证 1.1 范围内的 CLI 基础设施，不要编写依赖数据库、配置文件或真实 ingestion/search 行为的测试。

### Project Structure Notes

- 当前仓库仍处于规划产物阶段，尚不存在既有 `package.json`、`src/`、`tsconfig.json` 或可复用实现；本 story 需要从零建立基础骨架。
- 当前未发现 `project-context.md`，因此 story 中已经把最关键的目录结构、边界、技术栈与禁止事项写全，开发时应以本文件和 planning artifacts 为主要事实来源。
- 为避免后续返工，建议 1.1 仅建立“可运行的骨架 + 可验证的错误/帮助行为”，不要在占位命令里偷偷写入真实业务逻辑。

### References

- Epic 与 Story 边界：`_bmad-output/planning-artifacts/epics.md`
- 产品目标、命令体系、退出码、配置优先级：`_bmad-output/planning-artifacts/prd.md`
- 技术栈、目录结构、错误模型、构建约束：`_bmad-output/planning-artifacts/architecture.md`
- 冲刺状态追踪：`_bmad-output/implementation-artifacts/sprint-status.yaml`

## Dev Agent Record

### Agent Model Used

GPT-5.4

### Debug Log References

- `pnpm vitest run tests/integration/cli-help.test.ts`
- `pnpm vitest run tests/integration/cli-errors.test.ts`
- `pnpm build && pnpm test && pnpm typecheck`
- `export PNPM_HOME="$HOME/.local/share/pnpm" && export PATH="$PNPM_HOME:$PATH" && pnpm link --global && kb --help`

### Completion Notes List

- Story 上下文已生成，可直接交由 `dev-story` 实施。
- 本 story 明确禁止提前实现数据库迁移、分层配置和真实业务命令。
- Web research 已补充当前技术版本基线与兼容性提示，实施时仍应以包管理器解析结果为准。
- 2026-04-20: 开始按 TDD 实施 Story 1.1，当前状态已切换为 `in-progress`。
- 2026-04-20: 已建立 `pnpm + TypeScript + tsup + Vitest` 工程骨架，并补齐 `build`、`dev`、`test`、`typecheck` 脚本。
- 2026-04-20: 已实现 `kb` CLI 主程序、五个占位命令、统一 `KbError` 层级与 Commander/内部错误退出码映射。
- 2026-04-20: 已通过自动化测试覆盖 `--help`、未知命令 `exit 2`、占位命令结构化错误 `exit 1`。
- 2026-04-20: 已验证 `pnpm build`、`pnpm test`、`pnpm typecheck` 以及配置 `PNPM_HOME` 后的 `pnpm link --global && kb --help`。

### File List

- `package.json`
- `pnpm-lock.yaml`
- `tsconfig.json`
- `tsup.config.ts`
- `vitest.config.ts`
- `.gitignore`
- `README.md`
- `bin/kb.js`
- `src/cli/index.ts`
- `src/cli/main.ts`
- `src/cli/commands/init.ts`
- `src/cli/commands/ingest.ts`
- `src/cli/commands/search.ts`
- `src/cli/commands/list.ts`
- `src/cli/commands/tag.ts`
- `src/errors/index.ts`
- `src/core/index.ts`
- `src/storage/index.ts`
- `src/adapters/index.ts`
- `src/config/index.ts`
- `src/utils/index.ts`
- `tests/integration/cli-help.test.ts`
- `tests/integration/cli-errors.test.ts`
- `docs/superpowers/plans/2026-04-20-cli-skeleton-infrastructure.md`
- `_bmad-output/implementation-artifacts/1-1-cli-骨架与项目基础设施.md`

### Change Log

- 2026-04-20: 完成 Story 1.1 实现，新增 CLI 工程骨架、占位命令、统一错误处理与基础集成测试。
