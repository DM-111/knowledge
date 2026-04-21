# Sprint Change Proposal

**Date:** 2026-04-20
**Project:** knowledge
**Mode:** Batch
**Trigger:** 按 implementation readiness 报告中的 2 个 major 问题进行纠偏

## 1. Issue Summary

### Problem Statement

当前问题不是需求变化，也不是技术路线失败，而是**实施拆分方式与既定规划原则不完全一致**：

1. `Epic 1 / Story 1.2` 把 `knowledge_items`、`chunks`、`tags`、`item_tags`、`chunks_fts` 等未来能力所需的数据库对象一次性前置创建，破坏了“每个故事只引入当前用户价值所必需结构”的渐进式交付原则。
2. `Epic 6 / Story 6.1` 以 embedding 与向量存储为中心，更像技术基础设施切片，而不是用户可直接感知的能力切片，导致 Growth 阶段第一个故事的独立用户价值不够明确。

### Discovery Context

问题是在 `implementation-readiness-report-2026-04-20.md` 的 Epic Quality Review 中识别出来的。该评估确认：

- PRD、Architecture、Epics 三份核心文档都存在
- PRD -> Epic 的 FR 覆盖率为 100%
- 项目总体方向成立，问题集中在 Story 级拆分质量

### Evidence

- 证据 1：`Story 1.2` 当前验收标准明确要求 `001-init-schema.sql` 一次性创建 `knowledge_items`、`chunks`、`tags`、`item_tags`、`chunks_fts`
- 证据 2：`architecture.md` 当前实现顺序与示意目录同样把“初始 schema”表述为早期一次性落地
- 证据 3：`Story 6.1` 当前标题就是“语义向量召回基础设施”，而 `Story 6.2` 才是用户实际调用的 `kb ask`

## 2. Impact Analysis

### Epic Impact

#### Epic 1: 项目初始化与基础配置

- **状态**：仍然有效，无需重定义
- **影响**：需要收窄 `Story 1.2` 的范围，把它从“完整业务 schema 初始化”改为“迁移引擎 + 最小初始化”
- **结果**：Epic 1 仍可完成，且完成后更符合渐进式交付原则

#### Epic 6: RAG 问答与智能推理（Growth）

- **状态**：仍然有效，无需重定义
- **影响**：需要把当前 `Story 6.1` 的技术基础设施内容合并进用户可感知的 `kb ask` 故事中
- **结果**：Epic 6 的第一个故事将变成真正可展示的用户能力切片

#### 其他 Epics

- `Epic 2`、`Epic 3`、`Epic 4`、`Epic 5`、`Epic 7` 不需要结构级调整
- 不需要新增 Epic
- 不需要删除 Epic
- 不需要调整 Epic 顺序

### Artifact Conflicts

#### PRD

- **结论**：无冲突，不需要修改
- **原因**：PRD 只规定能力目标、范围边界、FR/NFR，并未强制“数据库一次性建完”或“向量基础设施必须独立成 story”

#### Architecture

- **结论**：需要小幅修订
- **原因**：
  - 当前 `Data Architecture` 与 `Implementation Sequence` 对“初始 schema”的表述过于整体化
  - 需要明确迁移是**按能力逐步引入**，而不是在 `001` 里把所有后续表都提前建好

#### Epics & Stories

- **结论**：需要重点修订
- **原因**：
  - `Story 1.2` 需要重写验收标准
  - `Epic 6` 的故事结构需要重组

#### UX

- **结论**：无影响
- **原因**：当前项目没有独立图形界面设计文档，本次纠偏也不涉及 UI/UX 交互变更

### Technical Impact

- 不影响产品目标与 MVP 边界
- 不影响既定技术栈
- 不影响 FR 覆盖关系
- 会提升后续实现的可执行性、故事独立性和迁移策略一致性

## 3. Recommended Approach

### Option Evaluation

#### Option 1: Direct Adjustment

- **Viable:** Yes
- **Effort:** Low
- **Risk:** Low
- **Assessment:** 只需修改规划文档，不需回滚任何已完成实现，也不需要改变 MVP 目标

#### Option 2: Potential Rollback

- **Viable:** No
- **Effort:** Medium
- **Risk:** Unnecessary
- **Assessment:** 当前问题发生在规划层，而不是已交付实现层，没有值得回滚的已完成 story

#### Option 3: PRD MVP Review

- **Viable:** No
- **Effort:** High
- **Risk:** Unnecessary
- **Assessment:** MVP 目标仍然成立，问题不在需求范围，而在故事拆分

### Selected Approach

**Option 1: Direct Adjustment**

### Rationale

这是一次典型的**规划纠偏**，不是产品转向。最稳妥的路径是：

1. 保持 PRD 与 Epic 框架不变
2. 修正 `Story 1.2` 的数据库引入时机
3. 把 `Epic 6` 的首个故事改成用户结果导向的垂直切片
4. 同步修正 `architecture.md` 中与之冲突的实现顺序描述

这样既保留了当前文档的大部分高质量内容，也能消除 readiness 报告指出的结构性问题。

## 4. Detailed Change Proposals

### A. Stories / Epics Changes

#### Proposal A1

**Artifact:** `epics.md`  
**Story:** `Story 1.2`  
**Section:** 标题 + 验收标准

**OLD:**

```md
### Story 1.2: 数据库基础设施与 Schema 迁移

As a 用户,
I want 工具首次运行时自动创建和初始化数据库,
So that 我不需要手动设置数据库即可开始使用.

**Acceptance Criteria:**

**Given** 用户首次使用工具
**When** 任何需要数据库的命令被执行
**Then** 系统在配置路径下自动创建 SQLite 数据库文件
**And** 通过 PRAGMA user_version 检测并顺序执行所有未应用的迁移脚本

**Given** 初始 schema 迁移（001-init-schema.sql）执行
**When** 迁移完成
**Then** 数据库包含 knowledge_items、chunks、tags、item_tags 表和 chunks_fts FTS5 虚拟表
**And** 所有表具有正确的字段、约束（NOT NULL、UNIQUE、FOREIGN KEY）和索引

**Given** 迁移脚本执行过程中发生错误
**When** 某个迁移失败
**Then** 该迁移的事务被回滚，数据库保持上一个已知好的状态
**And** 抛出 StorageError 包含失败的迁移版本号和原因

**Given** DatabaseProvider 接口
**When** 在测试环境中使用
**Then** 可以注入 `:memory:` 数据库实例，不依赖文件系统
```

**NEW:**

```md
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
```

**Rationale:** 让数据库基础设施保持“可用但不过度前置”，把 schema 引入时机重新对齐到具体用户能力首次落地的故事。

#### Proposal A2

**Artifact:** `epics.md`  
**Section:** `Epic 6` 故事结构

**OLD:**

```md
### Story 6.1: 语义向量召回基础设施
### Story 6.2: RAG 问答（kb ask）
### Story 6.3: 结论回写沉淀（kb write-back）
```

**NEW:**

```md
### Story 6.1: 混合召回驱动的 RAG 问答（kb ask）
### Story 6.2: 结论回写沉淀（kb write-back）
```

**Rationale:** 把 embedding / 向量存储从独立“技术基础设施故事”变为 `kb ask` 的内部实现细节，使 Epic 6 的第一个故事直接交付用户可见价值。

#### Proposal A3

**Artifact:** `epics.md`  
**Story:** `Epic 6 / 新 Story 6.1`  
**Section:** 完整故事替换

**OLD:**

```md
### Story 6.1: 语义向量召回基础设施

As a 用户,
I want 系统能通过语义理解召回与我的问题相关的知识片段,
So that 不仅精确匹配关键词的内容能被找到，语义相关的内容也能被召回.

**Acceptance Criteria:**

**Given** 知识库中已有入库内容
**When** 系统为已有 chunks 生成 embedding 向量
**Then** 向量存储在本地（sqlite-vec 或独立向量库，具体方案延迟决策）
**And** 新入库内容在 ingestion pipeline 中自动生成 embedding

**Given** 用户提问一个语义相关但未包含精确关键词的问题
**When** 系统执行语义召回
**Then** 返回语义相似度最高的 chunks 列表
**And** 可与 FTS5 关键词检索结果合并（混合召回）

**Given** LLM API key 配置
**When** 配置管理加载
**Then** API key 通过配置文件或环境变量管理（NFR12），不硬编码
**And** 未配置 API key 时给出明确错误提示
```

**NEW:**

```md
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
**Then** 明确告知用户“知识库中未找到相关内容”
**And** 不编造无依据的回答

**Given** LLM API 调用失败
**When** 网络错误或 API 返回异常
**Then** 输出清晰错误信息，包含失败原因
**And** 仍然展示原始召回的知识片段供用户参考

**Given** LLM API key 未配置
**When** 用户执行 `kb ask`
**Then** 输出明确提示说明缺少必要配置
**And** 指引用户通过配置文件或环境变量补充 API key
```

**Rationale:** 让 Story 6.1 成为真正的“端到端用户能力”，同时不丢失原先关于 embedding / 本地向量存储的技术要求。

#### Proposal A4

**Artifact:** `epics.md`  
**Story:** `Story 6.3`  
**Section:** 编号调整

**OLD:**

```md
### Story 6.3: 结论回写沉淀（kb write-back）
```

**NEW:**

```md
### Story 6.2: 结论回写沉淀（kb write-back）
```

**Rationale:** 在移除独立基础设施故事后，保持 Epic 6 编号连续，避免后续 Story 引用与 sprint 状态追踪出现歧义。

### B. Architecture Changes

#### Proposal B1

**Artifact:** `architecture.md`  
**Section:** `Data Architecture / Schema 迁移策略`

**OLD:**

```md
- 使用 SQLite 内置的 `PRAGMA user_version` 跟踪数据库 schema 版本
- 每个版本对应一个编号的 SQL 迁移脚本（`migrations/001-init.sql`、`002-add-xxx.sql`）
- 应用启动时自动检测当前版本并顺序执行未应用的迁移
- 每个迁移在事务中执行，失败则回滚
- 不引入额外迁移库——FTS5 虚拟表的创建和修改不走常规 DDL，自动化工具无法正确处理
```

**NEW:**

```md
- 使用 SQLite 内置的 `PRAGMA user_version` 跟踪数据库 schema 版本
- 每个版本对应一个编号的 SQL 迁移脚本（如 `migrations/001-bootstrap.sql`、`002-add-xxx.sql`）
- 迁移脚本按能力渐进引入：某类数据库对象只在其首次被对应用户能力需要时加入，不在初始迁移中预建所有后续表
- 应用启动时自动检测当前版本并顺序执行未应用的迁移
- 每个迁移在事务中执行，失败则回滚
- 不引入额外迁移库——FTS5 虚拟表的创建和修改不走常规 DDL，自动化工具无法正确处理
```

**Rationale:** 把“渐进式 schema 演进”上升为显式架构规则，避免实现时再次回到一次性建模。

#### Proposal B2

**Artifact:** `architecture.md`  
**Section:** `Implementation Sequence`

**OLD:**

```md
1. 项目初始化（目录结构、配置文件、基础骨架）
2. DatabaseProvider 接口 + Schema 迁移基础设施 + 初始 schema
3. 配置管理模块（分层配置加载）
4. Ingestion Pipeline 核心（adapter 接口 + Markdown adapter）
5. 内容处理（Defuddle 网页提取 + chunk 切分）
6. 存储层（KnowledgeItem + Chunk + Tag CRUD）
7. FTS5 全文检索
8. CLI 命令实现（ingest、search、list、tag）
```

**NEW:**

```md
1. 项目初始化（目录结构、配置文件、基础骨架）
2. DatabaseProvider 接口 + Schema 迁移引擎 + 最小 bootstrap schema
3. 配置管理模块（分层配置加载）
4. Ingestion Pipeline 核心（adapter 接口 + Markdown adapter）及首个入库能力所需 schema
5. 内容处理（Defuddle 网页提取 + chunk 切分）
6. 存储层与标签能力（按故事逐步引入 KnowledgeItem / Chunk / Tag 相关 schema 与 CRUD）
7. FTS5 全文检索（在搜索能力首次实现时引入 `chunks_fts` 迁移）
8. CLI 命令实现（ingest、search、list、tag）
```

**Rationale:** 让实施顺序与修订后的 stories 保持一致，明确哪些 schema 在何时进入系统。

#### Proposal B3

**Artifact:** `architecture.md`  
**Section:** 目录结构示意中的迁移文件注释

**OLD:**

```md
│   │   │   └── 001-init-schema.sql   # 初始 schema（knowledge_items、chunks、tags、chunks_fts）
```

**NEW:**

```md
│   │   │   └── 001-bootstrap.sql     # 最小 bootstrap schema（迁移基础设施 + 最早需要的数据结构）
```

**Rationale:** 避免目录示意再次向实现者传达“一次性把所有核心表建完”的错误信号。

### C. PRD Changes

**Recommendation:** 不修改 `prd.md`

**Reasoning:** 本次问题不涉及产品目标、MVP 边界、FR/NFR 改写，PRD 继续作为稳定上游即可。

### D. UX Changes

**Recommendation:** 无变更

**Reasoning:** 当前没有独立 UX 文档，且本次纠偏不涉及新的 UI/交互需求。

## 5. PRD MVP Impact and Action Plan

### MVP Impact

- **MVP 是否受影响：** 否
- **范围是否缩减：** 否
- **核心目标是否改变：** 否

本次只是把规划文档从“可实施”提升为“更稳妥、更符合渐进式交付原则”，不会改变 ingest -> store -> search 的 MVP 闭环目标。

### High-Level Action Plan

1. 更新 `epics.md`
2. 更新 `architecture.md`
3. 如使用 sprint 跟踪文件，同步调整 Epic 6 的 story 编号与引用
4. 重新运行 `bmad-check-implementation-readiness`

### Dependencies and Sequencing

1. 先修 `epics.md`
2. 再修 `architecture.md`
3. 最后更新 sprint 状态追踪文件（如果存在）

## 6. Implementation Handoff

### Scope Classification

**Moderate**

原因：不需要重做 PRD 或架构方向，但需要对 backlog / story 结构进行明确整理，并同步修正文档间一致性。

### Recommended Handoff

- **Product Owner / Developer**
  - 负责根据本提案修订 `epics.md`
  - 确认 Story 边界、编号与验收标准
- **Architect / Developer**
  - 负责同步修订 `architecture.md`
  - 确保实施顺序与迁移策略表述一致

### Success Criteria

- `Story 1.2` 不再前置创建全部业务 schema
- `Epic 6` 的首个故事直接交付用户可见能力
- `architecture.md` 明确采用按能力渐进引入 schema 的实施方式
- 重新运行 readiness 检查后，不再出现这两个 major 问题

### Approval and Routing

- **User Approval:** Approved (`yes`)
- **Final Scope Classification:** Moderate
- **Route To:** Product Owner / Developer + Architect / Developer
- **Routing Decision:** 先修订 `epics.md`，再同步修订 `architecture.md`，完成后重新运行 `bmad-check-implementation-readiness`

## 7. Checklist Execution Summary

### Section 1: Understand the Trigger and Context

- `1.1` [x] Done
- `1.2` [x] Done
- `1.3` [x] Done

### Section 2: Epic Impact Assessment

- `2.1` [x] Done
- `2.2` [x] Done
- `2.3` [x] Done
- `2.4` [x] Done
- `2.5` [x] Done

### Section 3: Artifact Conflict and Impact Analysis

- `3.1` [x] Done
- `3.2` [x] Done
- `3.3` [N/A] Skip
- `3.4` [!] Action-needed — 若存在 sprint 状态追踪文件，需要在批准后同步更新 story 编号/引用

### Section 4: Path Forward Evaluation

- `4.1` [x] Viable
- `4.2` [x] Not viable
- `4.3` [x] Not viable
- `4.4` [x] Done

### Section 5: Sprint Change Proposal Components

- `5.1` [x] Done
- `5.2` [x] Done
- `5.3` [x] Done
- `5.4` [x] Done
- `5.5` [x] Done

### Section 6: Final Review and Handoff

- `6.1` [x] Done
- `6.2` [x] Done
- `6.3` [x] Done — 用户已明确批准提案
- `6.4` [N/A] Skip — 未发现 `sprint-status.yaml` / `sprint-status.yml`
- `6.5` [x] Done — 已确认 handoff 路径与执行顺序

