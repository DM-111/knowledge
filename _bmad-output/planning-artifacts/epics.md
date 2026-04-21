---
stepsCompleted:
- step-01-validate-prerequisites
- step-02-design-epics
- step-03-create-stories
- step-04-final-validation
inputDocuments:
- _bmad-output/planning-artifacts/prd.md
- _bmad-output/planning-artifacts/architecture.md
---

# knowledge - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for knowledge, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

**知识入库（Ingestion）**

- FR1: 用户可以通过 URL 将网页内容入库到知识库
- FR2: 用户可以通过本地文件路径将 Markdown 文档入库到知识库
- FR3: 系统可以自动抓取网页并提取正文内容，过滤导航、广告等无关元素
- FR4: 系统可以对入库内容执行清洗、标准化处理
- FR5: 系统可以将入库内容按段落/标题级别切分为 chunks
- FR6: 系统可以自动提取入库内容的元数据（标题、来源类型、来源地址、入库时间）
- FR7: 用户可以在入库时选填标签和备注信息
- FR8: 系统在缺少必要参数时可以交互式引导用户补充输入
- FR9: 系统可以通过 adapter 模式支持不同类型的内容来源扩展

**知识检索（Retrieval）**

- FR10: 用户可以通过关键词检索知识库中的内容
- FR11: 用户可以按标签、来源类型、时间范围过滤检索结果
- FR12: 系统可以在检索结果中展示标题、来源、命中摘要和入库时间
- FR13: 用户可以控制检索结果的数量（limit）
- FR14: 用户可以列出所有已入库的知识条目

**知识组织（Organization）**

- FR15: 用户可以为已入库的知识条目手动添加或修改标签
- FR16: 用户可以按标签、来源等维度浏览和归类知识条目

**过程可观测性（Observability）**

- FR17: 系统在入库过程中可以实时输出处理进度和结果摘要
- FR18: 系统在遇到错误时可以输出清晰的错误信息（失败步骤、原因、上下文）
- FR19: 系统对所有失败情况不静默吞掉，确保用户知晓处理状态

**配置管理（Configuration）**

- FR20: 用户可以通过交互式引导完成首次初始化配置
- FR21: 系统支持分层配置（CLI 参数 > 环境变量 > 项目配置文件 > 用户配置文件）
- FR22: 用户可以配置知识库存储路径和数据库路径

**输出与集成（Output & Integration）**

- FR23: 系统可以根据终端环境自动选择输出格式（TTY 富文本 / 非 TTY 纯文本）
- FR24: 用户可以通过 `--json` 参数获取结构化 JSON 输出
- FR25: 系统使用规范化退出码（0 成功，1 一般错误，2 参数错误）
- FR26: 系统提供 bash/zsh/fish shell 自动补全

**RAG 问答与推理（Growth 阶段）**

- FR27: 用户可以通过自然语言提问，系统基于知识库召回内容生成回答
- FR28: 系统可以对多条召回结果进行摘要、对比和归纳
- FR29: 用户可以将回答结果回写沉淀为新的知识条目

**Agent 辅助（Growth 阶段）**

- FR30: 系统可以通过 Agent 自动分析未归档内容并建议标签和分类方案
- FR31: 用户可以审阅 Agent 建议后批量确认或调整归档结果
- FR32: 系统可以通过 Agent 自动为入库内容生成标签和描述

### NonFunctional Requirements

**Performance**

- NFR1: 单条内容入库（本地 Markdown）应在 3 秒内完成（不含网络抓取时间）
- NFR2: 网页抓取入库应在 10 秒内完成（取决于网络条件，超时应明确提示）
- NFR3: 关键词检索应在 1 秒内返回结果（知识库 10,000 条以内）
- NFR4: CLI 启动到可交互应在 500ms 以内，避免明显的启动延迟

**Data Integrity**

- NFR5: 入库过程中断（如 Ctrl+C）不应导致数据库处于不一致状态（使用事务保护）
- NFR6: 知识库数据存储在用户可控的本地路径，不依赖外部服务
- NFR7: chunk 切分后保留与原始 KnowledgeItem 的关联关系，确保溯源完整
- NFR8: SQLite 数据库和本地文件应可独立备份和恢复

**Maintainability**

- NFR9: 核心能力层（ingestion、retrieval、storage）与 CLI 入口层解耦，便于后续接入 MCP 等新入口
- NFR10: adapter 模式设计，新增内容来源不需修改核心流程代码
- NFR11: 代码结构支持单人持续迭代，模块边界清晰、依赖方向单一

**Security**

- NFR12: LLM API key 等敏感配置不硬编码，通过配置文件或环境变量管理
- NFR13: 配置文件权限建议设为用户只读（0600）
- NFR14: 本地数据不上传到任何外部服务（除 Growth 阶段调用 LLM API 时的请求内容）

### Additional Requirements

**来自 Architecture 文档的技术需求：**

- AR1: **Starter Template / 项目初始化**：手动搭建项目结构（Commander + tsup + vitest），不使用现成脚手架。项目初始化（创建目录结构、配置文件、基础代码骨架）应作为第一个实施 story
- AR2: **技术栈**：TypeScript (strict mode) + Node.js (LTS) + ESM 模块系统 + Commander.js + better-sqlite3 + tsup + vitest + tsx + pnpm
- AR3: **Schema 迁移策略**：使用 SQLite `PRAGMA user_version` + 手写编号 SQL 迁移脚本，应用启动时自动检测并顺序执行未应用的迁移，每个迁移在事务中执行
- AR4: **DatabaseProvider 接口抽象**：封装 better-sqlite3，测试时注入 `:memory:` 实例，为未来底层切换预留接口
- AR5: **网页正文提取**：使用 Defuddle v0.16.0 + linkedom 组合，提取失败时保留原始 HTML 并标记状态
- AR6: **错误类型层级**：自定义 KbError 基类 + IngestionError / StorageError / SearchError / ConfigError 子类，携带结构化上下文（step、source、cause）
- AR7: **可观测性回调注入**：核心层函数接受可选 `onProgress?: (event: ProgressEvent) => void` 回调参数，不直接 console.log
- AR8: **IngestionAdapter 接口标准**：每个 adapter 必须实现 `sourceType`、`canHandle()`、`ingest()` 三个成员
- AR9: **Pipeline 编排模式**：顺序步骤链 resolve adapter → fetch → parse → chunk → store → index，store 和 index 在同一个 SQLite 事务中执行
- AR10: **Repository 模式**：每个聚合根一个 Repository（KnowledgeItemRepository、ChunkRepository、TagRepository），接受 DatabaseProvider 注入
- AR11: **三层分离架构**：严格单向依赖 cli/ → core/ → storage/，不允许反向依赖
- AR12: **数据库命名规则**：DB `snake_case` / 代码 `camelCase` / 文件 `kebab-case`，转换在 Repository 层完成
- AR13: **输出格式化策略**：TTY/非TTY/JSON 三种模式，格式化器策略模式分发
- AR14: **配置加载模式**：启动时一次加载为冻结 Config 对象，核心层通过参数接收配置值，不直接访问全局配置
- AR15: **测试组织**：测试文件 co-located（foo.test.ts），集成测试放 tests/integration/，fixtures 放 tests/fixtures/
- AR16: **构建与分发**：tsup 输出 CJS + .d.ts，better-sqlite3 标记为 external，MVP 通过 `pnpm link --global` 本地使用
- AR17: **交互式 Prompt 库**：需要 `@inquirer/prompts` 或类似库支持交互式输入（FR8、FR20 的实施依赖）

### UX Design Requirements

无 UX 设计文档（本项目为 CLI Tool，PRD 明确"能力层先行，不是 UI 先行"）。

### FR Coverage Map

- FR1: Epic 4 — 通过 URL 入库网页内容
- FR2: Epic 2 — 通过本地路径入库 Markdown 文档
- FR3: Epic 4 — 自动抓取网页并提取正文
- FR4: Epic 2 — 入库内容清洗与标准化
- FR5: Epic 2 — 入库内容按段落/标题切分为 chunks
- FR6: Epic 2 — 自动提取元数据（标题、来源、时间）
- FR7: Epic 2 — 入库时选填标签和备注
- FR8: Epic 1 — 缺少参数时交互式引导补充输入
- FR9: Epic 2 — adapter 模式支持来源扩展
- FR10: Epic 3 — 关键词检索知识库内容
- FR11: Epic 3 — 按标签、来源、时间过滤检索结果
- FR12: Epic 3 — 检索结果展示标题、来源、摘要、时间
- FR13: Epic 3 — 控制检索结果数量（limit）
- FR14: Epic 3 — 列出所有已入库知识条目
- FR15: Epic 5 — 手动添加或修改标签
- FR16: Epic 5 — 按标签、来源维度浏览归类
- FR17: Epic 2 — 入库过程实时输出进度和结果摘要
- FR18: Epic 2 — 错误时输出清晰错误信息
- FR19: Epic 2 — 不静默吞掉失败情况
- FR20: Epic 1 — 交互式引导完成首次初始化
- FR21: Epic 1 — 分层配置支持
- FR22: Epic 1 — 配置知识库存储路径和数据库路径
- FR23: Epic 3 — 根据终端环境自动选择输出格式
- FR24: Epic 3 — --json 参数获取结构化输出
- FR25: Epic 1 — 规范化退出码
- FR26: Epic 5 — bash/zsh/fish shell 自动补全
- FR27: Epic 6 — 自然语言提问 RAG 问答
- FR28: Epic 6 — 多条结果摘要、对比、归纳
- FR29: Epic 6 — 回答结果回写沉淀为新知识条目
- FR30: Epic 7 — Agent 自动分析未归档内容并建议标签分类
- FR31: Epic 7 — 审阅 Agent 建议后批量确认或调整
- FR32: Epic 7 — Agent 自动为入库内容生成标签和描述

## Epic List

### Epic 1: 项目初始化与基础配置
用户可以安装 `kb` 工具、通过交互式引导完成初始化配置、配置知识库存储路径，工具可正常启动运行。
**FRs covered:** FR8, FR20, FR21, FR22, FR25

### Epic 2: 本地 Markdown 入库
用户可以通过 `kb ingest ./path/to/doc.md` 将本地 Markdown 文件入库到知识库，入库过程实时显示进度和结果摘要（标题、字数、切分块数），支持选填标签和备注。
**FRs covered:** FR2, FR4, FR5, FR6, FR7, FR9, FR17, FR18, FR19

### Epic 3: 知识检索与浏览
用户可以通过 `kb search "关键词"` 搜索知识库内容，通过 `kb list` 浏览已入库条目，支持按标签/来源/时间过滤，支持 TTY 富文本、非 TTY 纯文本和 `--json` 结构化三种输出格式。
**FRs covered:** FR10, FR11, FR12, FR13, FR14, FR23, FR24

### Epic 4: 网页内容入库
用户可以通过 `kb ingest <url>` 将网页文章入库，系统自动抓取页面、提取正文内容（过滤导航和广告）、转为 Markdown 格式后走统一入库流程。
**FRs covered:** FR1, FR3

### Epic 5: 知识组织与使用体验优化
用户可以通过 `kb tag` 为已入库条目手动打标签和修改标签，按标签和来源维度浏览归类知识。同时获得 bash/zsh/fish shell 自动补全，提升日常使用效率。
**FRs covered:** FR15, FR16, FR26

### Epic 6: RAG 问答与智能推理（Growth）
用户可以通过 `kb ask <question>` 用自然语言提问，系统基于知识库召回相关内容生成回答，支持多条结果的摘要、对比和归纳。回答结果可通过 `kb write-back` 回写沉淀为新的知识条目，实现知识复利。
**FRs covered:** FR27, FR28, FR29

### Epic 7: Agent 辅助归档（Growth）
用户可以通过 `kb organize --auto` 让 Agent 自动分析未归档内容，基于内容相似性和主题聚类建议标签和分类方案。用户审阅后批量确认或调整归档结果。同时支持 Agent 自动为新入库内容生成标签和描述。
**FRs covered:** FR30, FR31, FR32

## Epic 1: 项目初始化与基础配置

用户可以安装 `kb` 工具、通过交互式引导完成初始化配置、配置知识库存储路径，工具可正常启动运行。

### Story 1.1: CLI 骨架与项目基础设施

As a 用户,
I want 安装 `kb` 工具后能看到可用命令列表和帮助信息,
So that 我知道工具已正确安装并可以开始使用.

**Acceptance Criteria:**

**Given** 项目代码已构建
**When** 用户执行 `kb --help`
**Then** 终端输出可用的子命令列表（init, ingest, search, list, tag）和全局选项
**And** 退出码为 0

**Given** 用户执行未知命令如 `kb foo`
**When** Commander 无法匹配命令
**Then** 输出清晰的错误提示，提示可用命令
**And** 退出码为 2（参数错误）

**Given** 工具执行过程中发生内部错误
**When** 错误被捕获
**Then** 错误通过 KbError 类型层级（IngestionError / StorageError / SearchError / ConfigError）携带结构化上下文（step、source、cause）
**And** CLI 层统一格式化输出人类友好的错误信息，退出码为 1

**Given** 项目使用 `pnpm build` 构建
**When** 构建完成后执行 `pnpm link --global`
**Then** `kb` 命令在系统 PATH 中可用

### Story 1.2: 数据库迁移引擎与最小初始化

As a 用户,
I want 工具在首次需要持久化能力时自动创建数据库并完成最小初始化,
So that 我无需手动设置数据库，同时后续功能只在真正需要时引入对应 schema.

**Acceptance Criteria:**

**Given** 用户首次执行任何需要数据库的命令
**When** 命令启动并解析出数据库路径
**Then** 系统在配置路径下自动创建 SQLite 数据库文件
**And** 通过 PRAGMA user_version 检测并顺序执行所有未应用的迁移脚本

**Given** 最小初始化迁移（如 `001-bootstrap.sql`）执行
**When** 迁移完成
**Then** 数据库具备迁移引擎运行和当前已启用能力所需的最小结构
**And** 不预先创建 `chunks`、`tags`、`item_tags`、`chunks_fts` 等后续能力才需要的数据库对象

**Given** 后续故事首次引入 chunk、tag 或 FTS 能力
**When** 对应能力被实现
**Then** 该故事同时引入对应的编号迁移脚本
**And** 新 schema 通过渐进式迁移加入，而不是回填到初始迁移中

**Given** 迁移脚本执行过程中发生错误
**When** 某个迁移失败
**Then** 该迁移的事务被回滚，数据库保持上一个已知好的状态
**And** 抛出 StorageError，包含失败的迁移版本号和原因

**Given** DatabaseProvider 接口
**When** 在测试环境中使用
**Then** 可以注入 `:memory:` 数据库实例，不依赖文件系统

### Story 1.3: 分层配置系统与 kb init 命令

As a 用户,
I want 通过 `kb init` 交互式引导完成初始化配置,
So that 我可以快速配置知识库存储路径并开始使用工具.

**Acceptance Criteria:**

**Given** 用户首次使用工具
**When** 执行 `kb init`
**Then** 系统交互式引导用户配置知识库存储路径和数据库路径
**And** 生成配置文件到 `~/.config/kb/config.yaml`
**And** 自动触发数据库初始化

**Given** 已存在配置文件
**When** 用户再次执行 `kb init`
**Then** 显示当前配置并询问是否要覆盖
**And** 用户确认后才覆盖

**Given** 系统加载配置
**When** 存在多层配置源
**Then** 按优先级合并：CLI 参数 > 环境变量 > 项目配置文件（`./kb.config.yaml`）> 用户配置文件（`~/.config/kb/config.yaml`）> 默认值

**Given** 用户通过 CLI 参数传递 `--db-path /custom/path`
**When** 配置解析完成
**Then** 该参数值覆盖配置文件和环境变量中的同名配置

**Given** 必要配置缺失（如知识库路径未设置）
**When** 用户执行任何需要配置的命令
**Then** 系统交互式引导用户补充缺失配置（FR8）
**And** 如果是非 TTY 环境则输出明确错误提示并退出

## Epic 2: 本地 Markdown 入库

用户可以通过 `kb ingest ./path/to/doc.md` 将本地 Markdown 文件入库到知识库，入库过程实时显示进度和结果摘要（标题、字数、切分块数），支持选填标签和备注。

### Story 2.1: Ingestion Pipeline 核心与 Markdown Adapter

As a 用户,
I want 通过 `kb ingest ./path/to/doc.md` 将本地 Markdown 文件入库,
So that 我的本地笔记和文档可以被知识库管理.

**Acceptance Criteria:**

**Given** 一个有效的本地 Markdown 文件路径
**When** 用户执行 `kb ingest ./notes/article.md`
**Then** 系统通过 adapter 注册表自动选择 Markdown adapter
**And** 读取文件内容，提取元数据（标题取自第一个 heading 或文件名、来源类型为 local-markdown、来源路径、入库时间）
**And** 对内容执行清洗和标准化处理（FR4）
**And** 将内容按段落/标题级别切分为 chunks（FR5），保留 chunk 间重叠窗口
**And** 在同一个 SQLite 事务中存储 KnowledgeItem 和所有 Chunks 并更新 FTS5 索引
**And** 输出入库结果摘要（标题、来源、字数、切分块数）

**Given** IngestionAdapter 接口定义
**When** Markdown adapter 实现该接口
**Then** adapter 实现 `sourceType`（LocalMarkdown）、`canHandle()`（检查文件扩展名）、`ingest()`（返回 RawContent）三个成员
**And** adapter 不直接写数据库，只返回处理后的内容交给 pipeline 编排

**Given** pipeline 编排完整流程
**When** 入库执行
**Then** 步骤链按 resolve adapter → fetch → parse → chunk → store → index 顺序执行
**And** 每个 chunk 记录在原文中的位置索引，确保溯源（NFR7）

### Story 2.2: 入库时标签与备注支持

As a 用户,
I want 在入库时通过 `--tag` 和 `--note` 选填标签和备注,
So that 我可以在入库时就对知识进行初步分类和标注.

**Acceptance Criteria:**

**Given** 用户执行 `kb ingest ./doc.md --tag "typescript,学习笔记" --note "关于泛型的总结"`
**When** 入库流程完成
**Then** 知识条目关联指定的标签（通过 item_tags 多对多关系）
**And** 备注信息存储在 KnowledgeItem 记录中
**And** 入库结果摘要中展示已添加的标签和备注

**Given** 标签不存在于数据库中
**When** 入库时指定了新标签
**Then** 系统自动创建新标签记录并建立关联

**Given** 用户未提供 `--tag` 和 `--note`
**When** 入库流程完成
**Then** 知识条目正常入库，标签和备注为空
**And** 不阻塞入库流程

### Story 2.3: 入库进度与可观测性

As a 用户,
I want 在入库过程中看到实时处理进度,
So that 我知道系统正在工作并了解处理到了哪一步.

**Acceptance Criteria:**

**Given** 用户在 TTY 终端执行 `kb ingest ./doc.md`
**When** pipeline 各步骤执行
**Then** CLI 通过 `onProgress` 回调实时渲染各步骤状态（读取文件 → 内容清洗 → 切分 chunks → 存储入库 → 索引更新）
**And** 每个步骤显示开始、进行中、完成或失败状态

**Given** 入库完成
**When** 最后一个步骤执行结束
**Then** 输出结果摘要：标题、来源路径、内容字数、切分块数、已添加标签

**Given** 核心层函数
**When** 不注入 `onProgress` 回调
**Then** 静默执行，不产生任何终端输出（适配脚本/Agent 调用场景）

### Story 2.4: 入库错误处理与异常路径

As a 用户,
I want 入库失败时看到清晰的错误信息,
So that 我能理解什么出了问题并决定下一步操作.

**Acceptance Criteria:**

**Given** 用户提供的文件路径不存在
**When** 执行 `kb ingest ./nonexistent.md`
**Then** 输出 IngestionError，包含失败步骤（fetch）、文件路径和"文件不存在"原因
**And** 退出码为 1

**Given** 用户提供的文件不是 Markdown 格式
**When** 执行 `kb ingest ./image.png`
**Then** 输出清晰错误提示，说明该文件类型不被支持，列出支持的格式
**And** 退出码为 2

**Given** pipeline 中 chunk 切分步骤失败
**When** 内容无法正确切分
**Then** 抛出 IngestionError，携带 step='chunk'、source 和具体原因
**And** pipeline 立即中止，不执行后续步骤
**And** 不产生部分写入的数据（事务回滚，NFR5）

**Given** 入库过程中用户按 Ctrl+C 中断
**When** 进程收到终止信号
**Then** 当前事务回滚，数据库保持一致状态（NFR5）
**And** 不产生残留的不完整记录

**Given** 用户尝试入库已存在的相同来源文件
**When** 系统检测到来源路径已存在于知识库中
**Then** 提示用户该内容已入库，显示已有条目信息
**And** 询问是否覆盖更新或跳过

## Epic 3: 知识检索与浏览

用户可以通过 `kb search "关键词"` 搜索知识库内容，通过 `kb list` 浏览已入库条目，支持按标签/来源/时间过滤，支持 TTY 富文本和 `--json` 结构化两种输出格式。

### Story 3.1: 全文检索与结果展示（kb search）

As a 用户,
I want 通过 `kb search "关键词"` 搜索知识库中的内容,
So that 我能快速找回之前入库的知识.

**Acceptance Criteria:**

**Given** 知识库中已有入库内容
**When** 用户执行 `kb search "TypeScript 泛型"`
**Then** 系统通过 FTS5 全文检索匹配相关 chunks
**And** 返回匹配结果列表，每条包含：标题、来源（URL 或文件路径）、命中摘要（高亮关键词上下文）、入库时间
**And** 结果按相关度排序

**Given** 检索结果数量较多
**When** 用户执行 `kb search "关键词" --limit 5`
**Then** 仅返回前 5 条结果

**Given** 知识库中无匹配内容
**When** 用户执行检索
**Then** 输出"未找到匹配结果"的友好提示
**And** 退出码为 0（无结果不是错误）

**Given** 知识库包含 10,000 条以内的内容
**When** 执行检索
**Then** 结果在 1 秒内返回（NFR3）

### Story 3.2: 检索过滤与知识条目列表（kb list）

As a 用户,
I want 按标签、来源类型、时间范围过滤检索结果，并能列出所有已入库条目,
So that 我能精准定位目标知识并掌握知识库全貌.

**Acceptance Criteria:**

**Given** 知识库中有多种来源和标签的内容
**When** 用户执行 `kb search "关键词" --tag typescript --source local-markdown`
**Then** 仅返回同时匹配关键词、标签为 typescript 且来源为 local-markdown 的结果

**Given** 用户需要按时间过滤
**When** 执行 `kb search "关键词" --after 2026-04-01 --before 2026-04-30`
**Then** 仅返回入库时间在指定范围内的匹配结果

**Given** 用户需要查看知识库全部内容
**When** 执行 `kb list`
**Then** 展示所有已入库的知识条目，每条包含：ID、标题、来源类型、标签列表、入库时间
**And** 支持 `--tag`、`--source` 过滤

**Given** 用户执行 `kb list --limit 10`
**When** 知识库条目超过 10 条
**Then** 仅展示前 10 条，并提示总数

### Story 3.3: 输出格式化策略（TTY / 非 TTY / JSON）

As a 用户,
I want 在不同环境下获得合适的输出格式,
So that 无论在终端交互还是脚本管道中都能高效使用.

**Acceptance Criteria:**

**Given** 用户在 TTY 终端执行 `kb search` 或 `kb list`
**When** stdout 是 TTY
**Then** 使用富文本输出：彩色高亮关键词、表格布局、摘要截断

**Given** 用户在管道或脚本中执行命令
**When** stdout 不是 TTY（如 `kb search "关键词" | grep xxx`）
**Then** 自动切换为纯文本输出，无颜色转义码

**Given** 用户执行 `kb search "关键词" --json`
**When** 输出格式为 JSON
**Then** 返回结构化 JSON：`{ "items": [...], "total": N }`
**And** 字段使用 camelCase（如 `sourceUrl`、`createdAt`、`chunkCount`）
**And** 日期格式为 ISO 8601 字符串

**Given** 命令执行出错且带有 `--json` 参数
**When** 错误被捕获
**Then** 以 JSON 格式输出错误：`{ "error": { "type": "SearchError", "message": "...", "step": "..." } }`

## Epic 4: 网页内容入库

用户可以通过 `kb ingest <url>` 将网页文章入库，系统自动抓取页面、提取正文内容（过滤导航和广告）、转为 Markdown 格式后走统一入库流程。

### Story 4.1: Web Adapter 与网页正文提取

As a 用户,
I want 通过 `kb ingest <url>` 将网页文章入库,
So that 我在浏览器中看到的有价值内容可以纳入知识库.

**Acceptance Criteria:**

**Given** 一个有效的网页 URL
**When** 用户执行 `kb ingest https://example.com/article`
**Then** 系统通过 adapter 注册表自动选择 Web adapter（`canHandle` 检测 URL 格式）
**And** 抓取网页 HTML 内容
**And** 使用 Defuddle + linkedom 提取正文，过滤导航、广告、侧栏等无关元素（FR3）
**And** 将提取结果转为 Markdown 格式
**And** 提取元数据（标题取自页面 title/h1、来源类型为 web、来源 URL、入库时间）
**And** 后续走统一的 chunk → store → index pipeline 完成入库

**Given** Web adapter 实现 IngestionAdapter 接口
**When** adapter 执行 `ingest()`
**Then** 返回标准化的 RawContent（标题、Markdown 正文、元数据）
**And** adapter 不直接写数据库

**Given** 用户在入库时附加标签和备注
**When** 执行 `kb ingest <url> --tag "技术选型" --note "关于数据库的对比"`
**Then** 标签和备注与 Epic 2 中建立的机制一致地关联到知识条目

### Story 4.2: 网页入库异常处理

As a 用户,
I want 网页入库失败时看到清晰的错误信息,
So that 我知道是网络问题、页面问题还是其他原因导致了失败.

**Acceptance Criteria:**

**Given** 用户提供了一个失效链接（404、500 等）
**When** 执行 `kb ingest https://example.com/deleted`
**Then** 输出 IngestionError，包含失败步骤（fetch）、URL、HTTP 状态码和失败原因
**And** 退出码为 1

**Given** 网络请求超时
**When** 抓取耗时超过 10 秒（NFR2）
**Then** 中止请求并输出超时错误，包含 URL 和超时时长
**And** 建议用户检查网络连接或稍后重试

**Given** 网页 HTML 获取成功但正文提取失败（如页面主体为 JavaScript 渲染、无有效正文）
**When** Defuddle 无法提取有效内容
**Then** 保留原始 HTML 并标记状态为提取失败（AR5）
**And** 输出警告信息，说明正文提取失败但已保留原始内容

**Given** 用户尝试入库已存在的相同 URL
**When** 系统检测到该 URL 已存在于知识库中
**Then** 提示用户该内容已入库，显示已有条目信息（Epic 4）
**And** 询问是否覆盖更新或跳过

## Epic 5: 知识组织与使用体验优化

用户可以通过 `kb tag` 为已入库条目手动打标签和修改标签，按标签和来源维度浏览归类知识。同时获得 bash/zsh/fish shell 自动补全，提升日常使用效率。

### Story 5.1: 标签管理（kb tag）

As a 用户,
I want 通过 `kb tag` 为已入库的知识条目添加或修改标签,
So that 我可以对已有知识进行整理分类，方便后续按主题检索.

**Acceptance Criteria:**

**Given** 知识库中已有入库条目（ID 为 3）
**When** 用户执行 `kb tag 3 "架构设计,技术选型"`
**Then** 系统为该条目添加指定标签
**And** 新标签自动创建（若不存在），已有标签复用
**And** 输出更新后的条目信息，展示当前所有标签

**Given** 用户想要移除某个标签
**When** 执行 `kb tag 3 --remove "技术选型"`
**Then** 移除该条目与指定标签的关联
**And** 输出更新后的标签列表

**Given** 用户提供了不存在的条目 ID
**When** 执行 `kb tag 999 "标签"`
**Then** 输出清晰错误提示，说明条目不存在
**And** 退出码为 1

**Given** 用户想查看某个条目的当前标签
**When** 执行 `kb tag 3` 不带标签参数
**Then** 展示该条目的当前标签列表

### Story 5.2: Shell 自动补全

As a 用户,
I want `kb` 命令支持 bash/zsh/fish 的 shell 自动补全,
So that 我在终端输入命令时可以通过 Tab 键快速补全子命令和选项.

**Acceptance Criteria:**

**Given** 用户使用 bash/zsh/fish shell
**When** 安装补全脚本后输入 `kb ` 按 Tab
**Then** 自动补全可用子命令（init, ingest, search, list, tag）

**Given** 用户输入 `kb search --` 按 Tab
**When** 触发选项补全
**Then** 显示可用选项（--tag, --source, --limit, --after, --before, --json）

**Given** 用户需要安装补全脚本
**When** 执行 `kb completion bash`（或 zsh / fish）
**Then** 输出对应 shell 的补全脚本
**And** 提示安装说明（如追加到 `.bashrc` / `.zshrc`）

**Given** 用户请求了当前不支持的 shell 类型
**When** 执行 `kb completion powershell`
**Then** 输出清晰错误提示，说明仅支持 bash、zsh、fish
**And** 退出码为 2

## Epic 6: RAG 问答与智能推理（Growth）

用户可以通过 `kb ask <question>` 用自然语言提问，系统基于知识库召回相关内容生成回答，支持多条结果的摘要、对比和归纳。回答结果可通过 `kb write-back` 回写沉淀为新的知识条目，实现知识复利。

### Story 6.1: 混合召回驱动的 RAG 问答（kb ask）

As a 用户,
I want 通过 `kb ask "..."` 用自然语言提问并得到有依据的回答,
So that 系统不仅能匹配关键词，还能结合语义相关内容进行更可靠的回答生成.

**Acceptance Criteria:**

**Given** 知识库中有相关内容且 LLM API key 已配置
**When** 用户执行 `kb ask "TypeScript 泛型的使用场景有哪些？"`
**Then** 系统通过语义 + 关键词混合召回相关 chunks
**And** 在需要时为已有或新增 chunks 生成 embedding 并存储到本地向量索引
**And** 将召回内容作为上下文提交给 LLM 生成回答
**And** 回答中标注引用来源（标题、来源链接）

**Given** 用户提问涉及多条知识
**When** 召回结果来自多个知识条目
**Then** 系统对多条结果进行摘要、对比和归纳（FR28）
**And** 回答结构清晰，区分不同来源的观点

**Given** 知识库中无相关内容
**When** 召回结果为空或相关度极低
**Then** 明确告知用户"知识库中未找到相关内容"
**And** 不编造无依据的回答

**Given** LLM API 调用失败
**When** 网络错误或 API 返回异常
**Then** 输出清晰错误信息，包含失败原因
**And** 仍然展示原始召回的知识片段供用户参考

**Given** LLM API key 未配置
**When** 用户执行 `kb ask`
**Then** 输出明确提示说明缺少必要配置
**And** 指引用户通过配置文件或环境变量补充 API key

### Story 6.2: 结论回写沉淀（kb write-back）

As a 用户,
I want 将 `kb ask` 的回答结果回写为新的知识条目,
So that 推理产出的高价值结论可以沉淀为可复用的知识，实现知识复利.

**Acceptance Criteria:**

**Given** `kb ask` 刚生成了一个有价值的回答
**When** 用户执行 `kb write-back <answer-id>`（或在 ask 结果后选择回写）
**Then** 系统将回答内容创建为新的 KnowledgeItem
**And** 来源类型标记为 rag-synthesis，关联原始引用的知识条目 ID
**And** 走标准入库流程（chunk → store → index）

**Given** 用户想在回写前编辑内容
**When** 执行 `kb write-back <answer-id> --edit`
**Then** 打开系统默认编辑器让用户修改内容
**And** 修改后的内容作为新知识条目入库

**Given** 用户为回写内容指定标签
**When** 执行 `kb write-back <answer-id> --tag "总结,架构"`
**Then** 回写的知识条目关联指定标签

## Epic 7: Agent 辅助归档（Growth）

用户可以通过 `kb organize --auto` 让 Agent 自动分析未归档内容，基于内容相似性和主题聚类建议标签和分类方案。用户审阅后批量确认或调整归档结果。同时支持 Agent 自动为新入库内容生成标签和描述。

### Story 7.1: Agent 自动归档建议（kb organize --auto）

As a 用户,
I want 通过 `kb organize --auto` 让 Agent 自动分析未归档内容并建议标签和分类,
So that 我不需要逐条手动整理大量零散入库的知识.

**Acceptance Criteria:**

**Given** 知识库中存在未打标签的知识条目
**When** 用户执行 `kb organize --auto`
**Then** Agent 扫描所有未归档（无标签）条目
**And** 基于内容相似性和主题聚类，为每个条目建议标签和分类方案
**And** 以列表形式展示建议结果：条目标题 → 建议标签

**Given** Agent 生成了归档建议
**When** 用户审阅建议列表
**Then** 用户可以逐条确认、修改或跳过
**And** 支持批量确认全部建议（`--yes` 参数）

**Given** 用户确认了部分或全部建议
**When** 确认操作执行
**Then** 系统批量为对应条目添加建议的标签（FR31）
**And** 输出操作结果摘要（已归档 N 条、跳过 M 条）

**Given** 所有条目均已有标签
**When** 执行 `kb organize --auto`
**Then** 提示"所有条目已归档，无需整理"

**Given** LLM API 调用失败
**When** Agent 无法分析内容
**Then** 输出错误信息，建议检查 API key 配置和网络连接

### Story 7.2: 入库时 Agent 自动生成标签与描述

As a 用户,
I want 入库时 Agent 能自动为内容生成标签和描述,
So that 我不需要手动为每条内容想标签，减少入库时的认知负担.

**Acceptance Criteria:**

**Given** 用户入库内容时未提供标签
**When** 执行 `kb ingest <source> --auto-tag`
**Then** Agent 分析入库内容，自动生成建议标签（2-5 个）和简短描述
**And** 展示建议结果，询问用户是否接受
**And** 用户确认后关联标签和描述到知识条目

**Given** 用户同时提供了手动标签和 `--auto-tag`
**When** 入库流程执行
**Then** Agent 生成的标签与手动标签合并（去重）
**And** 展示合并后的标签列表供用户确认

**Given** 用户希望全自动入库（不需要确认）
**When** 执行 `kb ingest <source> --auto-tag --yes`
**Then** Agent 生成标签和描述后直接关联，不等待用户确认

**Given** LLM API 不可用或未配置
**When** 使用 `--auto-tag` 参数
**Then** 输出警告信息，说明自动标签功能不可用
**And** 入库流程正常继续（标签为空），不阻塞入库
