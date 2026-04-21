---
stepsCompleted:
- step-01-init
- step-02-context
- step-03-starter
- step-04-decisions
- step-05-patterns
- step-06-structure
- step-07-validation
- step-08-complete
inputDocuments:
- _bmad-output/planning-artifacts/prd.md
- _bmad-output/planning-artifacts/implementation-readiness-report-2026-04-20.md
workflowType: 'architecture'
project_name: 'knowledge'
user_name: 'DM'
date: '2026-04-20'
lastStep: 8
status: 'complete'
completedAt: '2026-04-20'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

MVP 阶段 26 条功能需求覆盖 6 个核心能力域：

- **知识入库（FR1-FR9）**：统一 ingestion pipeline，通过 adapter 模式支持 URL 网页和本地 Markdown 两种来源。架构含义：需要定义清晰的 adapter 接口、pipeline 编排流程和 chunk 切分策略。
- **知识检索（FR10-FR14）**：基于 SQLite FTS5 的全文检索，支持元数据过滤和结果限制。架构含义：需要设计 FTS5 索引结构和查询构建层。
- **知识组织（FR15-FR16）**：手动标签管理和多维度浏览。架构含义：标签系统需要灵活的多对多关系模型。
- **过程可观测性（FR17-FR19）**：实时进度输出和错误报告。架构含义：需要事件/回调机制贯穿 pipeline，能力层不直接控制输出格式。
- **配置管理（FR20-FR22）**：四层分层配置。架构含义：需要统一的配置解析和合并逻辑。
- **输出与集成（FR23-FR26）**：TTY/非TTY 自适应、JSON 输出、退出码、Shell 补全。架构含义：输出层需要格式化策略模式。

Growth 阶段 6 条功能需求（FR27-FR32）引入 RAG 推理和 Agent 辅助能力，架构需预留 LLM 集成和 embedding 存储的扩展点。

**Non-Functional Requirements:**

- **性能**：本地入库 <3s、网页入库 <10s、检索 <1s、CLI 启动 <500ms——对架构选型有直接约束，排除重量级框架
- **数据完整性**：事务保护、chunk-item 溯源、本地独立备份——要求 SQLite 事务设计和数据模型的完整性约束
- **可维护性**：核心层/CLI 层解耦、adapter 模式、单向依赖——这是最核心的架构原则，决定模块划分和依赖方向
- **安全**：敏感配置不硬编码、文件权限管理——配置模块需考虑安全边界

**Scale & Complexity:**

- Primary domain: CLI Tool / 本地知识服务
- Complexity level: 中等
- Estimated architectural components: 6-8 个核心模块（CLI 入口、配置管理、Ingestion Pipeline、内容处理、存储层、检索层、输出格式化、未来 MCP 入口）

### Technical Constraints & Dependencies

- **存储**：SQLite + FTS5，本地文件系统，无外部数据库依赖
- **中文分词**：FTS5 默认分词器对中文支持有限，已标记为已知限制，MVP 先用 simple tokenizer
- **网页提取**：依赖第三方正文提取库（Readability / Defuddle），不自己造轮子
- **单人开发**：架构需要足够简单，模块边界清晰，避免过度设计
- **里程碑驱动**：架构需支持增量交付，MVP 先跑通核心链路，Growth 能力可后续无痛接入
- **性能约束**：CLI 启动 <500ms 排除了需要重初始化的方案

### Cross-Cutting Concerns Identified

- **Adapter 模式**：贯穿所有内容来源的入库流程，需要统一接口定义
- **事务完整性**：所有写操作（入库、标签修改、回写）需要事务保护
- **输出格式适配**：所有命令的输出需要支持 TTY/非TTY/JSON 三种模式
- **错误处理与可观测性**：所有链路节点需要结构化错误上报，不静默吞掉异常
- **配置解析**：所有模块需要统一的配置访问方式，遵循四层优先级
- **核心层/入口层分离**：所有业务逻辑在能力层实现，CLI 和未来 MCP 只是薄入口

## Starter Template Evaluation

### Primary Technology Domain

CLI Tool / 本地知识服务，基于 Node.js + TypeScript 生态

### Starter Options Considered

| 方案 | 评估结论 |
|------|---------|
| oclif generate | ❌ 过重 — 企业级 class-based 脚手架，引入 Mocha 等不匹配的工具链，单人项目不需要插件系统 |
| citty + unbuild | ⚠️ 可选但生态小 — 优雅轻量，但社区和文档资源有限 |
| Commander + tsup 手动搭建 | ✅ 最佳 — 零依赖 CLI 框架 + 零配置构建工具，按需组装，完全控制项目结构 |

### Selected Starter: 手动搭建（Commander + tsup + vitest）

**Rationale for Selection:**

本项目不使用现成脚手架，而是手动搭建项目结构。原因：
1. 现有 CLI 脚手架（如 oclif）引入过多不需要的工具和约定
2. 项目需要特定的核心层/CLI 层分离架构，脚手架反而会限制结构设计
3. Commander + tsup 的组合足够简单，手动搭建成本极低
4. 保持对项目结构的完全控制，适配 adapter 模式和后续 MCP 扩展

**Initialization Command:**

```bash
mkdir knowledge && cd knowledge
pnpm init
pnpm add commander better-sqlite3
pnpm add -D typescript tsx tsup vitest @types/node @types/better-sqlite3
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**
- TypeScript (strict mode)
- Node.js (LTS)
- ESM 模块系统

**CLI Framework:**
- Commander.js — 零依赖、TypeScript-first、chainable API
- 支持子命令、选项解析、自动生成 help

**Storage:**
- better-sqlite3 — 同步 API、直接支持 FTS5 virtual table
- 不使用 ORM（Drizzle 对 FTS5 支持不完整），直接编写 SQL
- 通过 `DatabaseProvider` 接口抽象封装，测试时注入 `:memory:` 实例，为未来底层切换留口子

**Build Tooling:**
- tsup — esbuild 驱动的零配置打包，输出 CJS + .d.ts
- better-sqlite3 标记为 external（native addon 不打包）
- tsc --noEmit 独立做类型检查

**Testing Framework:**
- vitest — 快速、TypeScript 原生支持、与 Vite 生态兼容

**Development Experience:**
- tsx — 开发时零配置 TypeScript 执行（~100ms 冷启动）
- pnpm — 包管理器

### Database Selection Rationale（Party Mode 讨论结论）

**结论：better-sqlite3 + FTS5 是架构最优解，不是妥协。**

**排除的方案及原因：**

| 方案 | 排除原因 |
|------|---------|
| PostgreSQL / MySQL | 需要独立服务器进程，违背 local-first 和 CLI 启动 <500ms 约束 |
| LevelDB / RocksDB | KV 存储无 SQL 和 FTS 能力，需自建索引和查询层 |
| DuckDB | OLAP 引擎，不适合频繁小事务写入的 OLTP 场景 |
| sql.js (WASM SQLite) | 性能差 3-5x，大文件 ingest 无法满足 <3s NFR |
| Deno KV / bun:sqlite | 绑定特定运行时，与 Node.js 选型冲突 |
| libsql / Turso | SQLite fork 有向量支持，但 Node binding 生态不成熟，频繁 breaking change，可关注 |

**better-sqlite3 选择理由：**
- 同步 API，事务边界清晰，不用与 async/await 错误处理搏斗
- 单文件存储，备份就是 `cp`——**这是产品特性，不是技术妥协**
- FTS5 通过原生 SQL 操作，无需等待 ORM 支持
- 性能满足所有 NFR 要求

**已知工程代价（native addon）：**
- 依赖 prebuild 二进制，边缘平台可能 fallback 到编译（需 C++ 工具链）
- pnpm hoisting + native addon 偶尔出现符号链接问题
- better-sqlite3 是 CJS 模块，需确认与 ESM 输出的 interop

**缓解策略：**
- `DatabaseProvider` 接口抽象：隔离底层实现，测试用 `:memory:`，未来可换实现
- tsup 输出 CJS 避免 ESM interop 问题
- CI 矩阵覆盖 macOS / Linux / Windows

**存储演进路径：**

| 阶段 | 存储方案 | 说明 |
|------|---------|------|
| MVP | better-sqlite3 + FTS5 | 结构化数据 + 全文检索，单文件架构 |
| Growth | SQLite + 向量存储（sqlite-vec 或 hnswlib-node） | 延迟决策：sqlite-vec 保持单文件简洁性 vs 独立向量库避免叠加 native addon |
| Vision | 上面 + 邻接表（或嵌入式图库） | 知识图谱用递归 CTE 大概率够用，复杂图遍历时再评估 |

**Note:** 项目初始化（创建目录结构、配置文件、基础代码骨架）应作为第一个实施 story。

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- 数据建模与 Schema 迁移策略
- 网页正文提取库选型
- 错误处理标准
- 可观测性与进度上报机制

**Important Decisions (Shape Architecture):**
- DOM 解析库选型（配合网页提取）
- 分发与版本策略

**Deferred Decisions (Post-MVP):**
- npm 包名与发布策略（MVP 后）
- 向量存储方案选型（Growth 阶段）
- 知识图谱存储方案（Vision 阶段）
- MCP Tool 接口设计（Vision 阶段）

### Data Architecture

**Schema 迁移策略：手写 SQL + PRAGMA user_version**

- 使用 SQLite 内置的 `PRAGMA user_version` 跟踪数据库 schema 版本
- 每个版本对应一个编号的 SQL 迁移脚本（如 `migrations/001-bootstrap.sql`、`002-add-xxx.sql`）
- 迁移脚本按能力渐进引入：某类数据库对象只在其首次被对应用户能力需要时加入，不在初始迁移中预建所有后续表
- 应用启动时自动检测当前版本并顺序执行未应用的迁移
- 每个迁移在事务中执行，失败则回滚
- 不引入额外迁移库——FTS5 虚拟表的创建和修改不走常规 DDL，自动化工具无法正确处理

**数据验证策略：**

- 入口层（CLI）做参数格式校验（URL 格式、文件路径存在性）
- 核心层做业务规则校验（内容非空、元数据完整性）
- 存储层依赖 SQLite 约束（NOT NULL、UNIQUE、FOREIGN KEY）做最终保障
- 不引入独立验证库（如 zod），MVP 阶段手写校验足够

### Content Processing

**网页正文提取：Defuddle v0.16.0 + linkedom**

- Defuddle：比 Mozilla Readability 更宽容，保留更多有价值内容；直接输出 Markdown 格式，与知识库存储格式一致，减少转换步骤
- linkedom：轻量级服务端 DOM 解析（81.8KB vs jsdom 2MB），DOM 遍历和节点移除性能优于 jsdom，专为服务端 HTML 解析场景设计
- 提取失败时保留原始 HTML 并标记状态，允许后续重试（PRD 风险缓解策略）

**Chunk 切分策略：**

- MVP 先用段落/标题级切分（按 Markdown heading 和空行分块）
- 保留 chunk 间的重叠窗口（前后各保留部分上下文）
- 每个 chunk 记录在原文中的位置索引，确保溯源
- 后续根据实际检索效果迭代切分粒度

### Error Handling Standards

**自定义 Error 类型层级：**

- `KbError`（基类）：所有知识库错误的基类
  - `IngestionError`：入库流程错误（抓取失败、解析失败、切分失败）
  - `StorageError`：存储层错误（数据库写入失败、事务冲突）
  - `SearchError`：检索错误（查询构建失败、FTS5 语法错误）
  - `ConfigError`：配置错误（配置文件缺失、格式错误、必填项缺失）
- 每个 Error 携带结构化上下文：
  - `step`：失败的处理步骤（如 'fetch'、'parse'、'chunk'、'store'）
  - `source`：触发错误的来源（URL、文件路径）
  - `cause`：原始底层错误（Node.js Error cause chain）
- CLI 层统一捕获 `KbError`，根据类型格式化输出（人类友好的错误信息 + 可操作的建议）
- 非 `KbError` 的未知异常统一报告为内部错误

### Observability & Progress Reporting

**回调函数注入模式：**

- 核心层函数接受可选的 `onProgress?: (event: ProgressEvent) => void` 回调参数
- `ProgressEvent` 包含：`step`（当前步骤）、`status`（进行中/完成/失败）、`detail`（步骤特定信息）
- CLI 层注入回调，将进度事件渲染为终端输出（进度条、状态文本）
- 不注入回调时静默执行（适配脚本/Agent 调用场景）
- MVP 阶段单回调足够，Growth 阶段如需多监听者可升级为 EventEmitter

### Distribution & Versioning

**MVP 阶段：本地开发使用**

- 通过 `pnpm link --global` 将 `kb` 命令注册到本地 PATH
- 不发布到 npm，先验证核心链路的实际使用价值
- 版本策略：SemVer `0.x.y`（0.1.0 起步，表示 MVP 不稳定）

**Post-MVP 发布计划（延迟决策）：**

- 包名待定（需确认 npm 可用性）
- 发布到 npm 后支持 `npx kb-xxx` 和 `npm install -g kb-xxx`
- better-sqlite3 native addon 的跨平台 prebuild 覆盖需要 CI 验证

### Decision Impact Analysis

**Implementation Sequence:**

1. 项目初始化（目录结构、配置文件、基础骨架）
2. DatabaseProvider 接口 + Schema 迁移引擎 + 最小 bootstrap schema
3. 配置管理模块（分层配置加载）
4. Ingestion Pipeline 核心（adapter 接口 + Markdown adapter）及首个入库能力所需 schema
5. 内容处理（Defuddle 网页提取 + chunk 切分）
6. 存储层与标签能力（按故事逐步引入 KnowledgeItem / Chunk / Tag 相关 schema 与 CRUD）
7. FTS5 全文检索（在搜索能力首次实现时引入 `chunks_fts` 迁移）
8. CLI 命令实现（ingest、search、list、tag）
9. 输出格式化（TTY/非TTY/JSON）
10. 错误处理与可观测性集成

**Cross-Component Dependencies:**

- DatabaseProvider 是所有存储操作的基础，必须最先实现
- 错误类型层级贯穿所有模块，应在项目初始化时定义
- 回调函数注入模式影响所有核心层函数签名，应在接口设计阶段确定
- 配置管理被所有模块依赖（数据库路径、API key 等），应尽早实现

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**识别出 5 大类潜在冲突领域：**命名约定、项目结构、数据格式、通信模式、流程模式

### Naming Patterns

**Database Naming Conventions:**

- 表名：`snake_case`，复数形式 → `knowledge_items`、`chunks`、`tags`、`item_tags`
- 列名：`snake_case` → `source_url`、`created_at`、`source_type`
- 主键：统一用 `id`（INTEGER PRIMARY KEY AUTOINCREMENT）
- 外键：`{referenced_table_singular}_id` → `knowledge_item_id`、`chunk_id`
- 索引名：`idx_{table}_{column}` → `idx_knowledge_items_source_url`
- FTS5 虚拟表：`{base_table}_fts` → `chunks_fts`
- 迁移文件：`{NNN}-{description}.sql` → `001-bootstrap.sql`、`002-add-notes-column.sql`

**Code Naming Conventions:**

- 文件名：`kebab-case.ts` → `knowledge-item.ts`、`web-adapter.ts`、`database-provider.ts`
- 目录名：`kebab-case` → `src/core/`、`src/adapters/`、`src/storage/`
- 类/接口/类型：`PascalCase` → `KnowledgeItem`、`IngestionAdapter`、`DatabaseProvider`
- 函数/方法：`camelCase` → `ingestFromUrl()`、`searchByKeyword()`
- 常量：`UPPER_SNAKE_CASE` → `DEFAULT_CHUNK_SIZE`、`MAX_RETRY_COUNT`
- 枚举值：`PascalCase` → `SourceType.WebPage`、`SourceType.LocalMarkdown`
- 私有成员：不用下划线前缀，依赖 TypeScript `private` 关键字
- 布尔变量/属性：`is/has/should` 前缀 → `isProcessed`、`hasEmbedding`

**Test File Naming:**

- 测试文件与源文件同目录 co-located：`foo.ts` → `foo.test.ts`
- 测试描述用中文（匹配 communication_language）：`describe('知识入库')`, `it('应当正确提取网页标题')`

### Structure Patterns

**Project Organization（按模块职责分层）：**

```
src/
├── cli/              # CLI 入口层（薄层，只做参数解析和输出格式化）
│   ├── commands/     # 每个子命令一个文件
│   ├── formatters/   # 输出格式化（TTY/JSON/plain）
│   └── index.ts      # CLI 入口
├── core/             # 核心能力层（所有业务逻辑）
│   ├── ingestion/    # ingestion pipeline + adapter 接口
│   ├── search/       # 检索逻辑
│   ├── organize/     # 标签、归档逻辑
│   └── types.ts      # 核心类型定义
├── storage/          # 存储层（DatabaseProvider + Repository）
│   ├── provider.ts   # DatabaseProvider 接口和实现
│   ├── migrations/   # SQL 迁移脚本
│   └── repositories/ # 每个聚合根一个 repository
├── adapters/         # Ingestion adapters（web、markdown 等）
├── config/           # 配置管理
├── errors/           # 错误类型定义
└── utils/            # 纯工具函数（无业务逻辑）
```

**关键结构规则：**

- 依赖方向**严格单向**：`cli/ → core/ → storage/`，不允许反向依赖
- `adapters/` 实现 `core/ingestion/` 中定义的接口，被 core 层消费
- `cli/` 不直接调用 `storage/`，必须经过 `core/`
- `utils/` 是纯函数，不依赖任何其他模块
- 每个模块通过 `index.ts` 导出公开 API，内部文件不直接被外部引用

**Test Organization:**

- 测试文件 co-located（`foo.ts` 旁边放 `foo.test.ts`）
- 集成测试放 `tests/integration/`（需要真实数据库的测试）
- 测试 fixtures 放 `tests/fixtures/`（示例 Markdown 文件、HTML 页面等）

### Format Patterns

**CLI 输出格式：**

- JSON 模式（`--json`）统一使用 `camelCase` 字段名：

```json
{
  "id": 1,
  "title": "文章标题",
  "sourceUrl": "https://...",
  "sourceType": "web",
  "tags": ["tag1", "tag2"],
  "createdAt": "2026-04-20T12:00:00.000Z",
  "chunkCount": 5
}
```

- 日期格式：JSON 输出用 ISO 8601 字符串，TTY 输出用本地化格式
- 列表输出：JSON 用 `{ "items": [...], "total": N }`，TTY 用表格或列表
- 错误输出 JSON 格式：`{ "error": { "type": "IngestionError", "message": "...", "step": "fetch", "source": "..." } }`

**数据库 ↔ 代码映射：**

- 数据库 `snake_case` → 代码 `camelCase`，在 Repository 层做转换
- Repository 方法返回 TypeScript 接口类型，不暴露原始 SQL 行结构
- 时间戳：数据库存 ISO 8601 字符串（SQLite 无原生日期类型），代码层用 `Date` 对象

### Communication Patterns

**ProgressEvent 结构标准：**

```typescript
interface ProgressEvent {
  step: string;         // 'fetch' | 'parse' | 'chunk' | 'store' | 'index'
  status: 'start' | 'progress' | 'complete' | 'error';
  detail?: string;      // 人类可读的描述
  metadata?: Record<string, unknown>; // 步骤特定数据
}
```

**Adapter 接口标准：**

```typescript
interface IngestionAdapter {
  readonly sourceType: SourceType;
  canHandle(source: string): boolean;
  ingest(source: string, options?: IngestOptions): Promise<RawContent>;
}
```

- 每个 adapter 必须实现这三个成员
- `canHandle` 是同步的快速判断（URL 格式、文件扩展名）
- `ingest` 返回标准化的 `RawContent`（标题、正文 Markdown、元数据）
- adapter 不直接写数据库，只返回处理后的内容交给 pipeline 编排

### Process Patterns

**Pipeline 编排模式：**

- ingestion pipeline 是顺序步骤链：`resolve adapter → fetch → parse → chunk → store → index`
- 每个步骤是独立函数，接受上一步输出 + 可选 `onProgress` 回调
- 任一步骤失败时抛出对应的 `KbError` 子类，pipeline 立即中止
- 事务边界：`store` 和 `index` 在同一个 SQLite 事务中执行

**Repository 模式：**

- 每个聚合根一个 Repository：`KnowledgeItemRepository`、`ChunkRepository`、`TagRepository`
- Repository 接受 `DatabaseProvider` 注入，不自行创建数据库连接
- Repository 方法命名：`create`、`findById`、`findByQuery`、`update`、`delete`
- 复杂查询（如 FTS5 搜索 + 元数据过滤）封装在 Repository 方法内

**配置加载模式：**

- 配置加载在应用启动时一次完成，结果为冻结的 `Config` 对象
- 核心层函数通过参数接收需要的配置值，不直接访问全局配置
- 配置合并优先级：CLI 参数 > 环境变量 > 项目配置 > 用户配置 > 默认值

### Enforcement Guidelines

**All AI Agents MUST:**

1. 遵循依赖方向：`cli/ → core/ → storage/`，不允许反向引用
2. 所有数据库操作必须通过 Repository，不直接写 SQL 查询于 core/ 或 cli/ 层
3. 所有错误必须是 `KbError` 子类或被包装为 `KbError`，不允许裸 `throw new Error()`
4. 所有核心层函数接受 `onProgress?` 回调参数，不直接 `console.log`
5. 所有 adapter 实现 `IngestionAdapter` 接口，不自行定义入库逻辑
6. 数据库表/列用 `snake_case`，代码用 `camelCase`，转换在 Repository 层完成
7. 测试文件 co-located 且命名为 `*.test.ts`

**Anti-Patterns（禁止）：**

- ❌ 在 `core/` 中 import `cli/` 的任何内容
- ❌ 在 `cli/` 中直接调用 `storage/` 的 Repository
- ❌ 在核心层使用 `console.log` / `process.stdout` 做进度输出
- ❌ 在 adapter 中直接写数据库
- ❌ 裸 `throw new Error('something wrong')` 不携带上下文
- ❌ 在 Repository 外写 SQL 查询

## Project Structure & Boundaries

### Complete Project Directory Structure

```
knowledge/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── .gitignore
├── .env.example
├── README.md
├── bin/
│   └── kb.js                        # 构建产物入口（#!/usr/bin/env node）
├── src/
│   ├── cli/                          # CLI 入口层
│   │   ├── index.ts                  # Commander program 定义 + 命令注册
│   │   ├── commands/
│   │   │   ├── init.ts               # kb init（交互式初始化）
│   │   │   ├── ingest.ts             # kb ingest <source>
│   │   │   ├── search.ts             # kb search <query>
│   │   │   ├── list.ts               # kb list
│   │   │   └── tag.ts                # kb tag <id> <tags>
│   │   └── formatters/
│   │       ├── index.ts              # 格式化策略分发（TTY/JSON/plain）
│   │       ├── tty-formatter.ts      # 终端富文本输出
│   │       ├── json-formatter.ts     # --json 结构化输出
│   │       └── plain-formatter.ts    # 非 TTY 纯文本输出
│   ├── core/                         # 核心能力层
│   │   ├── index.ts                  # 核心层公开 API
│   │   ├── types.ts                  # 核心类型定义（KnowledgeItem、Chunk、Tag 等）
│   │   ├── ingestion/
│   │   │   ├── index.ts              # pipeline 编排（resolve → fetch → parse → chunk → store）
│   │   │   ├── adapter.ts            # IngestionAdapter 接口定义
│   │   │   ├── chunker.ts            # 内容切分逻辑
│   │   │   └── pipeline.ts           # pipeline 步骤链编排
│   │   ├── search/
│   │   │   ├── index.ts              # 检索入口
│   │   │   └── query-builder.ts      # FTS5 查询构建 + 元数据过滤组合
│   │   └── organize/
│   │       └── index.ts              # 标签管理、列表查询
│   ├── adapters/                     # Ingestion adapters
│   │   ├── index.ts                  # adapter 注册表（根据 source 自动选择）
│   │   ├── web-adapter.ts            # URL → Markdown（Defuddle + linkedom）
│   │   └── markdown-adapter.ts       # 本地 .md 文件读取
│   ├── storage/                      # 存储层
│   │   ├── index.ts                  # 存储层公开 API
│   │   ├── provider.ts               # DatabaseProvider 接口 + better-sqlite3 实现
│   │   ├── migrator.ts               # Schema 迁移引擎（PRAGMA user_version）
│   │   ├── migrations/
│   │   │   └── 001-bootstrap.sql     # 最小 bootstrap schema（迁移基础设施 + 最早需要的数据结构）
│   │   └── repositories/
│   │       ├── knowledge-item-repository.ts
│   │       ├── chunk-repository.ts
│   │       └── tag-repository.ts
│   ├── config/                       # 配置管理
│   │   ├── index.ts                  # 配置加载与合并（四层优先级）
│   │   ├── schema.ts                 # Config 类型定义 + 默认值
│   │   └── loader.ts                 # 文件/环境变量读取逻辑
│   ├── errors/                       # 错误类型
│   │   └── index.ts                  # KbError + 子类（IngestionError、StorageError 等）
│   └── utils/                        # 纯工具函数
│       ├── url.ts                    # URL 验证与规范化
│       └── fs.ts                     # 文件路径解析与验证
├── tests/
│   ├── integration/                  # 集成测试（需要真实 DB）
│   │   ├── ingestion.test.ts         # 端到端入库流程
│   │   └── search.test.ts            # 端到端检索流程
│   └── fixtures/
│       ├── sample-article.md         # 测试用 Markdown 文件
│       ├── sample-page.html          # 测试用 HTML 页面
│       └── sample-config.yaml        # 测试用配置文件
└── docs/                             # 项目文档（可选）
    └── schema.md                     # 数据库 schema 说明
```

### Architectural Boundaries

**Layer Boundaries（严格单向依赖）：**

```
┌─────────────────────────────────────┐
│           CLI Layer (cli/)          │  参数解析、输出格式化、进度渲染
│  ┌─────────┐  ┌──────────────────┐  │
│  │commands/ │  │   formatters/    │  │
│  └────┬─────┘  └────────┬────────┘  │
└───────┼─────────────────┼───────────┘
        │                 │
        ▼                 │
┌───────────────────────────────────┐
│         Core Layer (core/)        │  业务逻辑、pipeline 编排
│  ┌──────────┐ ┌────────┐ ┌─────┐ │
│  │ingestion/│ │search/ │ │org/ │ │
│  └────┬─────┘ └───┬────┘ └──┬──┘ │
└───────┼────────────┼─────────┼────┘
        │            │         │
        ▼            ▼         ▼
┌───────────────────────────────────┐
│       Storage Layer (storage/)    │  数据持久化、SQL 执行
│  ┌────────┐  ┌──────────────────┐ │
│  │provider │  │  repositories/   │ │
│  └────────┘  └──────────────────┘ │
└───────────────────────────────────┘

  ◄── adapters/ 实现 core/ingestion/adapter.ts 接口
  ◄── config/ 被所有层依赖（通过参数注入，不直接 import 全局状态）
  ◄── errors/ 被所有层依赖
  ◄── utils/ 被所有层依赖（纯函数，无副作用）
```

**Data Boundaries：**

- CLI 层操作的数据类型：命令参数（strings）、格式化后的输出（strings）
- Core 层操作的数据类型：领域对象（`KnowledgeItem`、`Chunk`、`RawContent`、`SearchResult`）
- Storage 层操作的数据类型：SQL 行 ↔ 领域对象的映射（`snake_case` ↔ `camelCase` 转换在此层完成）
- Adapter 层输入/输出：原始来源（URL/路径）→ `RawContent`（标准化的 Markdown + 元数据）

### Requirements to Structure Mapping

**FR 类别 → 目录映射：**

| FR 类别 | FRs | 主要目录 | 关键文件 |
|---------|-----|---------|---------|
| 知识入库 | FR1-FR9 | `core/ingestion/`, `adapters/` | `pipeline.ts`, `chunker.ts`, `web-adapter.ts`, `markdown-adapter.ts` |
| 知识检索 | FR10-FR14 | `core/search/`, `storage/repositories/` | `query-builder.ts`, `chunk-repository.ts` |
| 知识组织 | FR15-FR16 | `core/organize/`, `storage/repositories/` | `organize/index.ts`, `tag-repository.ts` |
| 过程可观测性 | FR17-FR19 | `core/`（回调注入）, `cli/formatters/` | 各核心函数的 `onProgress` 参数 |
| 配置管理 | FR20-FR22 | `config/` | `loader.ts`, `schema.ts` |
| 输出与集成 | FR23-FR26 | `cli/formatters/`, `cli/commands/` | `tty-formatter.ts`, `json-formatter.ts` |

**Cross-Cutting Concerns → 位置映射：**

| 关注点 | 位置 | 说明 |
|--------|------|------|
| 错误处理 | `errors/index.ts` | KbError 类型层级，被所有模块 import |
| 事务管理 | `storage/provider.ts` | DatabaseProvider 暴露 `transaction()` 方法 |
| 进度上报 | 各核心函数参数 | `onProgress?: (event: ProgressEvent) => void` |
| 输出适配 | `cli/formatters/` | TTY 检测 + 策略分发 |
| 配置注入 | `config/index.ts` → 参数传递 | 启动时加载，通过函数参数传递到各模块 |

### Data Flow

**Ingestion 数据流：**

```
用户输入 (URL/路径)
  → CLI (cli/commands/ingest.ts) 解析参数
    → Core (core/ingestion/pipeline.ts) 编排 pipeline
      → Adapter (adapters/web-adapter.ts) 抓取+提取 → RawContent
      → Chunker (core/ingestion/chunker.ts) 切分 → Chunk[]
      → Storage (storage/repositories/) 存储 KnowledgeItem + Chunks
      → Storage FTS5 索引更新
    ← ProgressEvent 回调 → CLI 渲染进度
  ← 结果 → CLI 格式化输出
```

**Search 数据流：**

```
用户输入 (查询词 + 过滤条件)
  → CLI (cli/commands/search.ts) 解析参数
    → Core (core/search/) 构建查询
      → Storage (chunk-repository) FTS5 查询 + 元数据过滤
    ← SearchResult[] → Core 排序/截断
  ← 结果 → CLI 格式化输出
```

### Development Workflow

**开发命令：**

```bash
pnpm dev           # tsx watch src/cli/index.ts（开发模式）
pnpm build         # tsup 构建到 dist/
pnpm test          # vitest 运行所有测试
pnpm test:watch    # vitest --watch
pnpm typecheck     # tsc --noEmit
pnpm lint          # ESLint（可选，后续添加）
pnpm kb            # tsx src/cli/index.ts（直接运行，等同于 kb 命令）
```

**构建产物结构：**

```
dist/
├── index.js          # 核心层入口（库模式导出，为 MCP 预留）
├── cli.js            # CLI 入口（#!/usr/bin/env node）
└── *.d.ts            # 类型声明
```

`package.json` 中 `"bin": { "kb": "./bin/kb.js" }` 指向构建产物。

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility：**
- 技术栈全链路兼容：TypeScript + Commander.js + better-sqlite3 + tsup + vitest + pnpm + tsx
- better-sqlite3 (CJS) 与 tsup 输出 CJS 无 interop 冲突
- Defuddle v0.16.0 + linkedom 组合验证通过
- 所有技术版本均为 2026 年活跃维护状态

**Pattern Consistency：**
- 命名规则三级一致：DB `snake_case` / 代码 `camelCase` / 文件 `kebab-case`，转换边界明确（Repository 层）
- 错误类型层级 + 回调注入 + 格式化器三者协同，数据流无断点
- Adapter 接口 + Pipeline 编排 + Repository 模式组成完整的写入链路

**Structure Alignment：**
- 项目目录结构完整映射到所有架构决策
- 依赖方向规则（cli → core → storage）在目录结构中得到物理体现
- 每个 FR 类别都有明确的目录和文件对应

### Requirements Coverage Validation ✅

**Functional Requirements Coverage（MVP 26 条）：**

| FR | 描述 | 架构支撑 | 状态 |
|----|------|---------|------|
| FR1 | URL 入库 | web-adapter.ts + pipeline.ts | ✅ |
| FR2 | 本地 MD 入库 | markdown-adapter.ts + pipeline.ts | ✅ |
| FR3 | 网页正文提取 | Defuddle + linkedom | ✅ |
| FR4 | 内容清洗 | adapter 内处理 | ✅ |
| FR5 | Chunk 切分 | chunker.ts | ✅ |
| FR6 | 元数据提取 | adapter → RawContent | ✅ |
| FR7 | 标签/备注选填 | CLI 参数 + tag-repository | ✅ |
| FR8 | 交互式引导 | Commander + @inquirer/prompts（实施时补充） | ⚠️ |
| FR9 | Adapter 扩展 | IngestionAdapter 接口 | ✅ |
| FR10 | 关键词检索 | FTS5 + query-builder.ts | ✅ |
| FR11 | 元数据过滤 | query-builder.ts | ✅ |
| FR12 | 结果展示 | formatters/ | ✅ |
| FR13 | 结果限制 | query-builder.ts --limit | ✅ |
| FR14 | 列出条目 | list 命令 + knowledge-item-repository | ✅ |
| FR15 | 手动打标签 | tag 命令 + tag-repository | ✅ |
| FR16 | 多维度浏览 | organize/index.ts | ✅ |
| FR17 | 进度输出 | ProgressEvent 回调 | ✅ |
| FR18 | 错误输出 | KbError 层级 + CLI 格式化 | ✅ |
| FR19 | 不静默吞错 | KbError 强制要求 + Enforcement 规则 | ✅ |
| FR20 | 交互式初始化 | init 命令 + config 模块 | ✅ |
| FR21 | 分层配置 | config/loader.ts 四层优先级 | ✅ |
| FR22 | 配置路径 | config/schema.ts | ✅ |
| FR23 | 输出格式自适应 | formatters/ TTY 检测 | ✅ |
| FR24 | --json 输出 | json-formatter.ts | ✅ |
| FR25 | 退出码规范 | CLI 层统一处理 | ✅ |
| FR26 | Shell 补全 | 延迟到 CLI 实施阶段 | ⚠️ |

**Non-Functional Requirements Coverage（14 条）：**

| NFR | 描述 | 架构支撑 | 状态 |
|-----|------|---------|------|
| NFR1-4 | 性能指标 | 轻量技术栈（Commander 零依赖、tsx 100ms 启动、SQLite 同步 API） | ✅ |
| NFR5-8 | 数据完整性 | SQLite 事务、FK 约束、单文件备份 | ✅ |
| NFR9-11 | 可维护性 | 三层分离、adapter 模式、单向依赖 | ✅ |
| NFR12-14 | 安全 | 配置文件管理、不硬编码、本地存储 | ✅ |

### Gap Analysis Results

**已发现缺口（均为实施级别，不阻塞架构）：**

1. **交互式 Prompt 库**（FR8、FR20）：需要 `@inquirer/prompts` 或类似库支持交互式输入。在对应 story 实施时作为依赖引入即可。
2. **Shell 补全**（FR26）：具体实现方式延迟到 CLI 命令实施阶段决定。

**无 Critical 或 Important 级别缺口。**

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] 项目上下文深度分析
- [x] 规模与复杂度评估
- [x] 技术约束识别
- [x] 跨领域关注点映射

**✅ Architectural Decisions**
- [x] 关键决策全部文档化（含版本号）
- [x] 技术栈完整指定
- [x] 数据库选型经过多角色讨论验证（Party Mode）
- [x] 存储演进路径规划
- [x] 延迟决策明确标注

**✅ Implementation Patterns**
- [x] 命名约定建立（DB / 代码 / 文件三级）
- [x] 结构模式定义
- [x] 通信模式指定（ProgressEvent、IngestionAdapter 接口）
- [x] 流程模式文档化（Pipeline、Repository、Config 加载）
- [x] 强制规则和反模式列表

**✅ Project Structure**
- [x] 完整目录结构定义
- [x] 组件边界建立
- [x] 集成点映射
- [x] 需求到结构的完整映射
- [x] 数据流图（Ingestion + Search）

### Architecture Readiness Assessment

**Overall Status: ✅ READY FOR IMPLEMENTATION**

**Confidence Level: High**

**Key Strengths:**
- 三层分离架构（CLI → Core → Storage）清晰，为 MCP 扩展预留空间
- 数据库选型经过架构师、开发者、产品经理三方独立评估，结论一致且充分
- 命名和结构规则具体到可直接执行的程度，AI Agent 无歧义空间
- 存储演进路径规划合理，MVP 不过度设计，Growth 能力可无痛接入

**Areas for Future Enhancement:**
- Growth 阶段向量存储选型（sqlite-vec vs 独立向量库）
- MCP Tool 接口设计
- npm 发布策略和包名确定

### Implementation Handoff

**AI Agent Guidelines:**
- 严格遵循本文档所有架构决策
- 使用 Implementation Patterns 中定义的一致性规则
- 尊重项目结构和层级边界
- 所有架构疑问以本文档为准

**First Implementation Priority:**
项目初始化（创建目录结构、安装依赖、配置 tsconfig/tsup/vitest、搭建基础代码骨架），随后按 Decision Impact Analysis 中的实施顺序推进。
