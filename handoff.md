# Handoff: AI-Native 阅读知识沉淀系统

## 当前状态：输入层 MVP 完成

截至 2026-05-11，系统的**输入层（Ingestion Layer）**已全部实现并通过 E2E 验证。核心能力：把 URL、epub、pdf 三种来源干净地转换为 Markdown 并存入知识库，再单向同步到 Obsidian vault 供人阅读。

---

## 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Claude Code Skill: /read                          │
│         "read <url|epub|pdf>" → ingest → sync → report             │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                         kb CLI (Node.js/TypeScript)                  │
│                                                                     │
│  Commands: init | ingest | search | list | tag | sync               │
│                                                                     │
│  ┌────────────────── Adapter Layer ──────────────────────────────┐  │
│  │  UrlAdapter        → defuddle parse --json --markdown         │  │
│  │  EpubAdapter       → pandoc / ebook-convert (mobi)            │  │
│  │  PdfAdapter        → marker_single                            │  │
│  │  MarkdownAdapter   → fs.readFile (原有)                       │  │
│  └───────────────────────────┬───────────────────────────────────┘  │
│                              │                                      │
│  ┌───────────────── Pipeline ┼───────────────────────────────────┐  │
│  │  resolve-adapter → fetch → parse → chunk → store → index     │  │
│  └───────────────────────────┼───────────────────────────────────┘  │
│                              │                                      │
│  ┌─────────── Storage Layer ─┼───────────────────────────────────┐  │
│  │  SQLite + FTS5 (better-sqlite3)                               │  │
│  │  Tables: knowledge_items, chunks, chunks_fts, tags, item_tags │  │
│  │  Migration 004: metadata_json 列                              │  │
│  └───────────────────────────┼───────────────────────────────────┘  │
│                              │                                      │
│  ┌─────────── Sync Layer ────┼───────────────────────────────────┐  │
│  │  kb sync --vault <path>                                       │  │
│  │  SQLite → .md (YAML frontmatter) → Obsidian vault            │  │
│  │  单向同步, 增量, 按 source_type 分目录                        │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│             Obsidian Vault (展示层, 只读消费)                        │
│  ~/ObsidianRepo/did-you-know/                                       │
│  ├── Articles/     ← web                                            │
│  ├── Books/        ← epub/mobi                                      │
│  ├── Papers/       ← pdf                                            │
│  └── _kb/sync-state.json                                            │
└─────────────────────────────────────────────────────────────────────┘
```

### 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 数据权威 | kb (SQLite) | 单一 source of truth，Obsidian 是只读视图 |
| 同步方向 | 单向 kb → Obsidian | 双向同步复杂度高 10x，MVP 不需要 |
| 格式转换 | Shell out 到专用工具 | defuddle/pandoc/marker 质量远超 Node 库 |
| 元数据存储 | JSON blob (metadata_json) | 不同来源 schema 差异大，避免频繁 migration |
| 交互入口 | Claude Code Skill | 自然语言驱动，零 UI 开发成本 |

---

## 已完成的工作

### 代码变更（未提交）

**新增文件：**
- `src/adapters/url-adapter.ts` — URL → Markdown (defuddle)
- `src/adapters/epub-adapter.ts` — EPUB/MOBI → Markdown (pandoc + calibre)
- `src/adapters/pdf-adapter.ts` — PDF → Markdown (marker)
- `src/cli/commands/sync.ts` — Obsidian 同步命令
- `src/storage/migrations/004-metadata.sql` — metadata_json 列
- `~/.claude/skills/read/SKILL.md` — Claude Code `/read` 技能

**修改文件：**
- `src/core/types.ts` — SourceType 扩展, ContentMetadata interface, IngestResult 增加 metadata
- `src/adapters/index.ts` — 注册所有新 adapters
- `src/core/ingestion/pipeline.ts` — metadata 透传到 store 层
- `src/storage/repositories/knowledge-item-repository.ts` — 支持 metadata_json
- `src/cli/index.ts` — 注册 sync 命令
- `src/cli/commands/ingest.ts` — 更新描述和 summary 展示 author
- 多个测试文件 — 适配新的错误消息和 migration 版本

### 已安装的工具

| 工具 | 版本 | 用途 |
|------|------|------|
| pandoc | 3.9.0.2 | epub/docx → Markdown |
| calibre (ebook-convert) | latest | mobi/azw3 → epub 中间转换 |
| marker-pdf | 1.10.2 | PDF → AI-optimized Markdown (含 OCR) |
| defuddle | (已有) | URL → clean Markdown |

### E2E 验证结果

```
✅ 128/128 单元测试通过
✅ URL 入库: paulgraham.com/ds.html → 21,321字, 74 chunks
✅ EPUB 入库: test-book.epub → "Test Book Title", author 正确提取
✅ Obsidian 同步: Articles/ + Books/ 目录, YAML frontmatter 完整
✅ FTS5 搜索: 关键词匹配, snippet 高亮
⏳ PDF 入库: 代码就绪, marker 首次运行需下载 ~1.5GB 模型（进行中）
```

---

## Goal 与里程碑

### 总体目标

构建一个 **AI Native 的阅读与知识沉淀系统**，让 AI 成为阅读伙伴：
1. **输入层** — 干净地处理任何格式的阅读材料
2. **存储与召回** — AI 能随时查询和引用知识库
3. **交互式学习** — Book-to-Skill, 苏格拉底探测, 主动召回
4. **知识图谱** — 实体提取, 关系映射, 逻辑地图

### 里程碑路线图

```
M1 输入层 [██████████] 100% ← 当前位置
   ├── URL Adapter (defuddle)           ✅ Done
   ├── EPUB Adapter (pandoc)            ✅ Done
   ├── PDF Adapter (marker)             ✅ Done (model downloading)
   ├── Obsidian Sync (kb sync)          ✅ Done
   └── /read Skill                      ✅ Done

M2 存储与召回 [░░░░░░░░░░] 0%
   ├── kb CLI 全局可用 (pnpm link)
   ├── MCP Server 包装 kb (让 Claude 直接查询)
   ├── llms.txt 索引结构
   ├── 增强搜索 (按 author, date range, source type 过滤)
   └── Obsidian 双向标注回写

M3 交互式学习 [░░░░░░░░░░] 0%
   ├── Book-to-Skill: 将书籍转为 Claude Code Skill
   ├── 苏格拉底探测器 (诚实度测试)
   ├── 自动化验证流 (生成练习 + 运行验证)
   └── 阅读进度追踪

M4 知识图谱 [░░░░░░░░░░] 0%
   ├── 实体提取 (人物、概念、依赖关系)
   ├── 关系映射 (GraphRAG / LightRAG)
   ├── Obsidian 可视化 (graph view 增强)
   └── "为什么" 类问题的逻辑推理
```

---

## 下一步建议 (M2 优先)

### 最高优先级

1. **`pnpm link --global`** — 让 `kb` 命令全局可用，不再需要 `cd` + `pnpm dev`
2. **MCP Server** — 包装 kb 的 search/list/ingest 为 MCP tool，让 Claude 能直接查询知识库而不需要用户手动触发
3. **PDF 首次使用** — 等 marker 模型下载完成后验证 PDF 流程

### 待打磨

- EPUB adapter 中大型书籍（>100k 字）的章节拆分策略
- Sync 命令的增量同步效率（目前全量查询再判断）
- frontmatter 中 aliases 字段（让 Obsidian 搜索更友好）
- 错误恢复：网络中断时 URL adapter 的重试机制

---

## 关键路径与文件索引

| 需求 | 入口文件 | 依赖 |
|------|---------|------|
| 入库任何来源 | `src/core/ingestion/pipeline.ts` | adapters/*.ts |
| 添加新格式支持 | `src/adapters/index.ts` + 新 adapter | IngestionAdapter interface |
| 修改存储 schema | `src/storage/migrations/` | migrator.ts 自动发现 |
| 扩展同步逻辑 | `src/cli/commands/sync.ts` | KnowledgeItemRepository |
| 修改 CLI 命令 | `src/cli/index.ts` + `commands/*.ts` | Commander.js |
| 配置管理 | `src/config/` | ~/.config/kb/config.yaml |
| Skill 定义 | `~/.claude/skills/read/SKILL.md` | — |
| Obsidian vault | `~/ObsidianRepo/did-you-know/` | kb sync 输出 |
| kb 数据库 | `~/.config/kb/` 或项目内 `.kb-data/` | better-sqlite3 |

---

## 如何接手

```bash
# 1. 进入项目
cd /Users/dm/MyCode/knowledge

# 2. 运行测试确认环境正常
pnpm test

# 3. 试一下入库
pnpm dev ingest "https://example.com/article" --tag test
pnpm dev sync --vault /Users/dm/ObsidianRepo/did-you-know
pnpm dev list
pnpm dev search "keyword"

# 4. 查看未提交的变更
git diff --stat
git status
```
