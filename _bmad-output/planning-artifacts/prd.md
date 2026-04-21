---

## stepsCompleted:

- step-01-init
- step-02-discovery
- step-02b-vision
- step-02c-executive-summary
- step-03-success
- step-04-journeys
- step-05-domain
- step-06-innovation
- step-07-project-type
- step-08-scoping
- step-09-functional
- step-10-nonfunctional
- step-11-polish
- step-12-complete
inputDocuments:
- /Users/dm/doc/interview-prep/2026-04-17-个人知识中枢项目定义.md
workflowType: 'prd'
documentCounts:
briefs: 0
research: 0
brainstorming: 0
projectDocs: 0
userProvided: 1
classification:
projectType: cli_tool
domain: general
complexity: medium
projectContext: greenfield

# Product Requirements Document - knowledge

**Author:** DM
**Date:** 2026-04-20

## Executive Summary

个人知识中枢是一个面向开发者和知识工作者的本地知识服务，以 CLI 为主入口，解决知识分散在网页、文档、笔记、AI 对话等多处之后"存了但找不回、找回了但用不起来"的问题。系统提供统一的多来源 ingestion pipeline、内容清洗与切分、关键词 + 语义双路检索、基于召回上下文的 RAG 问答与推理，以及结论回写沉淀能力，使已有知识能持续参与新问题的思考。

目标用户是日常在 VS Code、终端和浏览器之间切换、以本地文件和网页为主要知识来源、有明确"知道自己看过但很难复用"痛点的人。

### What Makes This Special

- **输入轻、来源广**：网页链接、本地 Markdown、手动笔记等多种来源通过统一管道低成本入库，不要求用户改变已有工作习惯。
- **文件即知识**：底层存储基于本地文件（Markdown + SQLite），天然兼容 Obsidian 等工具，不做格式锁定，用户可以随时用其他工具消费同一份数据。
- **能力层先行，不是 UI 先行**：第一版刻意不做 Web 界面，把精力集中在 ingestion → retrieval → reasoning → write-back 这条完整链路上。如果需要 UI，Obsidian 已经够好了；这个项目做的是 Obsidian 做不到的事——统一采集、语义召回和 RAG 推理。
- **知识不只是被搜到，而是被用起来**：核心价值不是"全文搜索"，而是让召回的旧知识参与摘要、归纳、对比和下一步推理，把零散信息转化为可复用的结论。

## Project Classification

- **项目类型**：CLI Tool（CLI + 本地知识服务，后续可扩展 MCP Tool）
- **领域**：通用软件 / 个人生产力
- **复杂度**：中等（涉及 ingestion pipeline、内容切分、双路检索、RAG 推理链路，无合规要求）
- **项目阶段**：Greenfield（全新项目）

## Success Criteria

### User Success

- 任意来源的内容（网页链接、本地 Markdown、手动笔记）能通过 CLI 一条命令完成入库，过程无需手动干预清洗和切分。
- 入库后的知识可被检索命中，不会出现"存了但搜不到"的情况。
- 检索结果能按来源、标签、时间等维度过滤和归档整理。

### Business Success

- 本项目为个人项目，不以时间维度衡量进度，而以**里程碑驱动**：
  - **里程碑一**：ingestion → 存储 → 检索 端到端流程跑通，能真实使用。
  - **里程碑二**：语义召回和 RAG 问答可用，检索结果能参与推理和总结。
  - **里程碑三**：结论回写、知识提纯和专题草稿生成等高阶能力。
- 里程碑二及以后的能力是简历亮点和加分项，体现对 RAG、Agent 和 AI harness 的系统理解。

### Technical Success

- 统一 ingestion pipeline 架构稳定，新增来源只需扩展 adapter，不改核心流程。
- 内容清洗和 chunk 切分逻辑正确，元数据（标题、来源、标签、时间）完整提取。
- 全文检索结果准确、响应迅速。
- 代码结构清晰，核心能力层与 CLI 入口分离，为后续接入 MCP Tool 预留扩展空间。

### Measurable Outcomes

- 能成功入库网页和本地 Markdown 两种来源。
- 入库内容可通过关键词检索命中。
- 检索结果包含来源信息和命中摘要。

## User Journeys

### Journey 1：内容入库（核心入库路径）

用户读到一篇有价值的技术文章，打开终端执行 `kb ingest <url>`。系统抓取网页、提取正文、清洗内容、切分 chunks、提取元数据，CLI 实时输出处理进度和结果摘要（标题、来源、字数、切分块数）。处理完成后系统提示是否补充标签或备注，用户可选填 `--tag` 和 `--note`，也可跳过。本地文档同理：`kb ingest ./path/to/doc.md --tag topic`，走统一管道。

标签和描述可作为非必填参数由用户手动补充，也可由 Agent 自动生成，实现闭环。

### Journey 2：检索找回（确定性检索）

一周后用户做技术选型，记得看过相关内容但忘了细节。终端输入 `kb search "关键词"`，系统返回匹配的知识片段列表，每条包含标题、来源、命中摘要和入库时间。结果过多时加过滤：`kb search "关键词" --tag topic --source web --limit 5`，快速定位目标。

### Journey 3：入库异常处理（错误路径）

用户给了一个失效链接，系统尝试抓取后 CLI 明确报错：抓取失败、HTTP 状态码、失败原因。本地文件格式无法解析时同样输出清晰错误信息，说明哪一步失败、文件路径和具体原因。所有失败情况不静默吞掉，用户看到错误后自行决定重试或跳过。

### Journey 4：Agent 辅助归档整理

用户入库大量零散内容后，调用 Agent 能力（如 `kb organize --auto`）。Agent 扫描未归档条目，基于内容相似性和主题聚类，自动建议标签、分类和归档方案。用户审阅确认或调整后批量完成归档。

### Journey Requirements Summary


| 能力领域               | Journey 1 | Journey 2 | Journey 3 | Journey 4 |
| ------------------ | --------- | --------- | --------- | --------- |
| Ingestion Pipeline | ✓         |           |           |           |
| 内容清洗与切分            | ✓         |           |           |           |
| 元数据提取              | ✓         |           |           |           |
| CLI 交互式输入          | ✓         |           |           |           |
| 过程可观测性             | ✓         |           | ✓         |           |
| 全文检索               |           | ✓         |           |           |
| 元数据过滤              |           | ✓         |           |           |
| 错误处理与报告            |           |           | ✓         |           |
| Agent 集成           |           |           |           | ✓         |
| 批量操作               |           |           |           | ✓         |


## Innovation & Novel Patterns

### Detected Innovation Areas

**1. Capability-First 架构：面向技术用户的务实选择**

在 AI-First 时代，UI 不再是产品的核心竞争力。市面上已有 Obsidian、Notion 等优秀的知识展示和编辑工具。与其重复造轮子，不如专注做它们没有集成的能力——统一 ingestion、语义召回和 RAG 推理。需要 UI 时直接复用已有产品，把精力放在个人定制化的能力层上。

**2. 知识复利：从"记下来"到"滚动增值"**

传统知识管理止步于存储和搜索，隐含的假设是"记下来就够了"。但学习是一个滚动过程——接触新事物产生新体悟，新体悟又需要和旧知识碰撞。write-back 机制让每一次检索和推理的产出都能沉淀为新的高价值知识单元，形成知识复利：用得越多，知识库越有价值，后续推理质量越高。

**3. 可组合基础设施：为 Agent 时代做准备**

以 CLI + 本地服务的形态构建，天然可被 Agent、MCP Tool、脚本和其他工具调用。这不是一个封闭的 App，而是一块可组合的知识基础设施。随着 Agent 能力持续增强、成本持续下降，这种可被 Agent 消费的知识底座会越来越有价值。

### Validation Approach

- MVP 阶段验证核心链路（ingest → search）是否真正解决"存了找不回"的问题
- Growth 阶段验证 RAG 问答和 write-back 是否真正产生知识复利效应
- 通过自身日常使用持续验证和迭代

### Risk Mitigation

- 能力层做好了但实际使用频率低 → 从真实痛点出发，自己是第一个用户
- 检索质量不够导致 RAG 回答不可靠 → 先做稳全文检索，语义召回作为增强层逐步引入
- 知识复利效果需要长期积累才能体现 → MVP 先保证基础检索价值，复利是长期加分项

## CLI Tool Specific Requirements

### Command Structure

核心命令体系：


| 命令                   | 用途             | 阶段     |
| -------------------- | -------------- | ------ |
| `kb ingest <source>` | 入库（URL / 本地路径） | MVP    |
| `kb search <query>`  | 关键词检索          | MVP    |
| `kb list`            | 列出已入库内容        | MVP    |
| `kb tag <id> <tags>` | 手动打标签          | MVP    |
| `kb ask <question>`  | RAG 问答         | Growth |
| `kb organize --auto` | Agent 辅助归档     | Growth |
| `kb write-back <id>` | 结论回写沉淀         | Growth |


所有命令支持交互式模式：缺少必要参数时引导用户逐步输入，而非直接报错退出。同时支持参数一次给全以适配脚本和 Agent 调用场景。

### Output Formats

- **用户终端**：默认人类友好的富文本输出（彩色高亮、表格、摘要截断），使用 chalk/ink 等终端渲染库
- **管道/脚本**：检测到 stdout 非 TTY 时自动切换为纯文本输出
- **程序化调用**：支持 `--json` flag 输出结构化 JSON，便于其他工具或 Agent 消费
- **MCP 调用**（Future）：通过服务层接口直接返回结构化数据

### Config Schema

采用分层配置策略（优先级从高到低）：

1. **CLI 参数**：`--db-path`, `--api-key` 等，最高优先级
2. **环境变量**：`KB_DB_PATH`, `KB_API_KEY` 等，适配 CI/自动化场景
3. **项目配置文件**：当前目录下的 `kb.config.yaml`，项目级配置
4. **用户配置文件**：`~/.config/kb/config.yaml`，全局默认值

核心配置项：知识库存储路径、SQLite 数据库路径、LLM API key（Growth 阶段）、默认标签规则。

首次运行执行 `kb init` 交互式引导完成初始化配置。

### Scripting Support

- 所有命令支持非交互模式（参数完整时跳过引导）
- `--json` 输出确保可被 `jq` 等工具解析
- 退出码规范：0 成功，1 一般错误，2 参数错误
- 后续 MCP Tool 暴露时，CLI 命令与服务层接口一一对应

### Shell Completion

提供 bash/zsh/fish 自动补全脚本，支持：

- 子命令补全（`kb <Tab>` → `ingest`, `search`, `list`, ...）
- 选项补全（`kb search --<Tab>` → `--tag`, `--source`, `--limit`, ...）

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP 方式：** Problem-Solving MVP — 最短路径跑通 ingest → store → search 闭环，验证核心链路能否真正解决"存了找不回"的问题。个人项目，自己是第一个用户，无需市场验证，聚焦于技术可行性和实际使用价值。

**资源情况：** 单人开发，按里程碑推进，无时间压力。

### MVP Feature Set（Phase 1）

**支持的用户旅程：**

- Journey 1（入库）：完整支持
- Journey 2（检索）：完整支持
- Journey 3（错误处理）：完整支持
- Journey 4（Agent 归档）：不在 MVP 范围

**Must-Have 能力：**

- `kb init`：交互式初始化配置
- `kb ingest <url|path>`：网页 / 本地 Markdown 入库，交互式标签补充
- `kb search <query>`：全文检索 + 元数据过滤
- `kb list`：列出已入库内容
- `kb tag`：手动打标签
- 统一 ingestion pipeline（adapter 模式）
- 内容清洗、chunk 切分、元数据提取
- SQLite 存储 + FTS5 全文索引
- 分层配置（CLI 参数 > 环境变量 > 配置文件）
- 处理过程可观测（进度输出、错误报告）

### Post-MVP Features

**Phase 2（Growth）：**

- 语义向量召回（embedding 索引）
- `kb ask` RAG 问答
- 多条知识摘要、对比、归纳
- `kb write-back` 结论回写
- `kb organize --auto` Agent 辅助归档
- 知识提纯和专题草稿生成

**Phase 3（Vision）：**

- MCP Tool 暴露
- AI 对话记录自动入库
- 知识图谱和关联推荐

### Risk Mitigation Strategy

**技术风险：**


| 风险                     | 严重度 | 原因                           | 缓解策略                                                                           |
| ---------------------- | --- | ---------------------------- | ------------------------------------------------------------------------------ |
| 网页正文提取质量不稳定            | 高   | 不同网站 HTML 结构差异大，广告、导航、侧栏混入正文 | 使用成熟的正文提取库（如 Readability / Defuddle），不自己造轮子；对提取失败的情况保留原始 HTML 并标记状态，允许后续重试     |
| Chunk 切分策略影响检索质量       | 中   | 切太大召回不精准，切太小丢失上下文            | 先用简单的段落/标题级切分，保留 chunk 间的重叠窗口；MVP 阶段不追求完美，后续根据实际检索效果迭代                         |
| SQLite FTS5 中文分词能力有限   | 中   | FTS5 默认分词器对中文支持差，影响中文检索质量    | 调研 jieba 等中文分词方案与 FTS5 的集成方式；MVP 可先用 simple tokenizer 跑通，标记为已知限制               |
| ingestion pipeline 扩展性 | 低   | 初期只有两种来源，但架构需要预留扩展空间         | 从一开始用 adapter 模式设计，每种来源一个 adapter，统一接口；MVP 只实现 web 和 local-markdown 两个 adapter |


**产品风险：**

- 能力层做好了但实际使用频率低 → 从真实痛点出发，自己是第一个用户
- 知识复利效果需要长期积累才能体现 → MVP 先保证基础检索价值，复利是长期加分项

**资源风险：**

- 单人开发，不存在团队协调问题
- 范围蔓延 → 严格按 MVP 边界开发，Growth 功能记录到 backlog 而非立即实现

## Functional Requirements

### 知识入库（Ingestion）

- FR1: 用户可以通过 URL 将网页内容入库到知识库
- FR2: 用户可以通过本地文件路径将 Markdown 文档入库到知识库
- FR3: 系统可以自动抓取网页并提取正文内容，过滤导航、广告等无关元素
- FR4: 系统可以对入库内容执行清洗、标准化处理
- FR5: 系统可以将入库内容按段落/标题级别切分为 chunks
- FR6: 系统可以自动提取入库内容的元数据（标题、来源类型、来源地址、入库时间）
- FR7: 用户可以在入库时选填标签和备注信息
- FR8: 系统在缺少必要参数时可以交互式引导用户补充输入
- FR9: 系统可以通过 adapter 模式支持不同类型的内容来源扩展

### 知识检索（Retrieval）

- FR10: 用户可以通过关键词检索知识库中的内容
- FR11: 用户可以按标签、来源类型、时间范围过滤检索结果
- FR12: 系统可以在检索结果中展示标题、来源、命中摘要和入库时间
- FR13: 用户可以控制检索结果的数量（limit）
- FR14: 用户可以列出所有已入库的知识条目

### 知识组织（Organization）

- FR15: 用户可以为已入库的知识条目手动添加或修改标签
- FR16: 用户可以按标签、来源等维度浏览和归类知识条目

### 过程可观测性（Observability）

- FR17: 系统在入库过程中可以实时输出处理进度和结果摘要
- FR18: 系统在遇到错误时可以输出清晰的错误信息（失败步骤、原因、上下文）
- FR19: 系统对所有失败情况不静默吞掉，确保用户知晓处理状态

### 配置管理（Configuration）

- FR20: 用户可以通过交互式引导完成首次初始化配置
- FR21: 系统支持分层配置（CLI 参数 > 环境变量 > 项目配置文件 > 用户配置文件）
- FR22: 用户可以配置知识库存储路径和数据库路径

### 输出与集成（Output & Integration）

- FR23: 系统可以根据终端环境自动选择输出格式（TTY 富文本 / 非 TTY 纯文本）
- FR24: 用户可以通过 `--json` 参数获取结构化 JSON 输出
- FR25: 系统使用规范化退出码（0 成功，1 一般错误，2 参数错误）
- FR26: 系统提供 bash/zsh/fish shell 自动补全

### RAG 问答与推理（Growth 阶段）

- FR27: 用户可以通过自然语言提问，系统基于知识库召回内容生成回答
- FR28: 系统可以对多条召回结果进行摘要、对比和归纳
- FR29: 用户可以将回答结果回写沉淀为新的知识条目

### Agent 辅助（Growth 阶段）

- FR30: 系统可以通过 Agent 自动分析未归档内容并建议标签和分类方案
- FR31: 用户可以审阅 Agent 建议后批量确认或调整归档结果
- FR32: 系统可以通过 Agent 自动为入库内容生成标签和描述

## Non-Functional Requirements

### Performance

- 单条内容入库（本地 Markdown）应在 3 秒内完成（不含网络抓取时间）
- 网页抓取入库应在 10 秒内完成（取决于网络条件，超时应明确提示）
- 关键词检索应在 1 秒内返回结果（知识库 10,000 条以内）
- CLI 启动到可交互应在 500ms 以内，避免明显的启动延迟

### Data Integrity

- 入库过程中断（如 Ctrl+C）不应导致数据库处于不一致状态（使用事务保护）
- 知识库数据存储在用户可控的本地路径，不依赖外部服务
- chunk 切分后保留与原始 KnowledgeItem 的关联关系，确保溯源完整
- SQLite 数据库和本地文件应可独立备份和恢复

### Maintainability

- 核心能力层（ingestion、retrieval、storage）与 CLI 入口层解耦，便于后续接入 MCP 等新入口
- adapter 模式设计，新增内容来源不需修改核心流程代码
- 代码结构支持单人持续迭代，模块边界清晰、依赖方向单一

### Security

- LLM API key 等敏感配置不硬编码，通过配置文件或环境变量管理
- 配置文件权限建议设为用户只读（0600）
- 本地数据不上传到任何外部服务（除 Growth 阶段调用 LLM API 时的请求内容）