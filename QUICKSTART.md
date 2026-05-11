# KNOWLEDGE CLI - EXECUTIVE SUMMARY

**Location:** `/Users/dm/MyCode/knowledge/`
**Type:** Local-first knowledge management CLI
**Language:** TypeScript/Node.js
**Total Code:** ~6,136 lines

---

## 🏗️ ARCHITECTURE LAYERS

```
CLI Commands (init, ingest, search, list, tag)
    ↓
Core Business Logic (ingestion pipeline, search, config)
    ↓
Storage Layer (repositories, migrations)
    ↓
SQLite Database (better-sqlite3 + FTS5)
    ↓
Adapter Layer (extensible source handlers)
```

---

## 📁 KEY DIRECTORIES & FILES

### CLI Commands
- **init.ts** - Configuration setup (YAML to ~/.config/kb/config.yaml)
- **ingest.ts** - Markdown file import with duplicate detection
- **search.ts** - Full-text search with filters
- **list.ts** - Browse knowledge base
- **tag.ts** - Tag management

### Core Pipelines
- **pipeline.ts** - Main ingestion flow (6 stages)
- **chunker.ts** - Split markdown by heading + paragraph
- **index.ts (search)** - FTS5 search, ranking, filtering
- **fts-match.ts** - Query builder (tokenize, prefix match)

### Storage
- **provider.ts** - better-sqlite3 wrapper
- **migrator.ts** - Version-controlled schema evolution
- **Repositories** - KnowledgeItem, Chunk, Tag, Search
- **Migrations/** - 001 bootstrap, 002 schema, 003 tags

### Adapters
- **markdown-adapter.ts** - .md/.markdown/.mdx support
- **index.ts** - Adapter registry (extensible pattern)

---

## 🗄️ DATABASE SCHEMA

### Tables:
1. **knowledge_items** - Top-level docs (title, source, content, wordcount)
2. **chunks** - Searchable paragraphs (with offsets & overlap context)
3. **chunks_fts** - FTS5 virtual table (auto-synced by triggers)
4. **tags** - Tag definitions
5. **item_tags** - Junction table

### Key Indexes:
- Unique on (source_type, source_path)
- FTS5 indexing on chunk.content with auto-sync

---

## 🔄 INGESTION PIPELINE (6 Stages)

1. **RESOLVE-ADAPTER** - Select handler by file extension
2. **FETCH** - Read raw file content
3. **PARSE** - Extract title, normalize, count words
4. **CHUNK** - Split into searchable chunks with overlap
5. **STORE** - Transaction: insert item, chunks, tags (handles duplicates)
6. **INDEX** - FTS5 triggers auto-sync

**Chunking:** Markdown paragraphs = chunks. Each chunk includes 1-paragraph overlap for context.

---

## 🔍 SEARCH CAPABILITIES

### Query Processing:
- User input: `"machine learning python"`
- Tokenize on whitespace
- Build: `machine* AND learning* AND python*` (prefix match)
- Execute FTS5 query against chunks_fts
- Rank with BM25 (fallback to rank())
- Return with snippet (20 tokens around hits)

### Filters:
- `--tag <name>` - Exact tag match
- `--source <type>` - Source type (e.g., 'local-markdown')
- `--after / --before` - Date range (ISO 8601)
- `--limit <n>` - Result limit (default 20)

---

## ⚙️ CONFIGURATION

### Config Files:
1. CLI overrides: `--db-path`, `--knowledge-base-path`
2. Env vars: `KB_DB_PATH`, `KB_KNOWLEDGE_BASE_PATH`
3. Project: `./kb.config.yaml`
4. User: `~/.config/kb/config.yaml`
5. Defaults: auto-derive dbPath = ${knowledgeBasePath}/knowledge.db

### Format (YAML):
```yaml
knowledgeBasePath: /path/to/kb
dbPath: /path/to/knowledge.db
```

---

## 📊 CURRENT CAPABILITIES

✅ Implemented:
- Markdown ingestion (.md, .markdown, .mdx)
- FTS5 full-text search
- Tagging system
- CLI: init, ingest, search, list, tag
- Duplicate detection with strategies (replace/skip/error)
- Config management (YAML + env overrides)
- Progress events for long operations
- Error handling with context
- Database migrations (version-controlled)
- Output formatting (TTY, plain, JSON)

❌ Not Yet:
- URL/web ingestion (adapter ready, needs implementation)
- PDF support
- Batch directory import
- Export functions
- Concurrent access
- Edit/update operations
- Item history/versioning

---

## 🔌 EXTENSIBILITY PATTERNS

### Adding New Adapters:
```typescript
// 1. Implement IngestionAdapter interface
export class NewAdapter implements IngestionAdapter {
  readonly sourceType = 'type-name';
  canHandle(source: string): boolean { /* check */ }
  async ingest(source: string): Promise<RawContent> { /* load */ }
}

// 2. Register in src/adapters/index.ts
INGESTION_ADAPTERS.push(new NewAdapter());
```

### Adding New Commands:
```typescript
// 1. Create command function
export function createNewCommand(): Command {
  return new Command('newcmd').action(async () => { /* impl */ });
}

// 2. Register in src/cli/index.ts
program.addCommand(createNewCommand());
```

---

## 📦 KEY DEPENDENCIES

- **commander** - CLI framework
- **better-sqlite3** - SQLite wrapper (sync, fast)
- **yaml** - Config parsing
- **@inquirer/prompts** - Interactive prompts
- **execa** - Subprocess execution

---

## 🚀 COMMANDS REFERENCE

```bash
kb init
# Interactive setup → saves ~/.config/kb/config.yaml

kb ingest /path/file.md --tag python,ai --note "notes"
# Import markdown, optionally tag and annotate

kb search "machine learning" --limit 50 --tag ai
# Full-text search with filters

kb list --tag python --json
# Browse items, machine-readable output

kb tag [operations...]
# Manage tags on items
```

---

## 📋 CRITICAL FILES TO UNDERSTAND

**Flow:**
- `/src/cli/main.ts` - Entry point
- `/src/cli/index.ts` - Command setup (commander)
- `/src/core/ingestion/pipeline.ts` - Ingest orchestration
- `/src/core/search/index.ts` - Search orchestration

**Data Model:**
- `/src/storage/migrations/002-ingestion-schema.sql` - Schema
- `/src/core/types.ts` - TypeScript interfaces

**Extension Points:**
- `/src/adapters/` - Adding sources
- `/src/cli/commands/` - Adding commands
- `/src/core/search/filters.ts` - Adding filters

---

## 🏷️ MIGRATION SYSTEM

**Pattern:** Numbered SQL files with strict validation

```
001-bootstrap.sql       (v1) - Intentionally empty
002-ingestion-schema.sql (v2) - Core tables + FTS5
003-tags-and-note.sql   (v3) - Tags & annotations
```

**Validation:**
- Version must be continuous (no gaps)
- No duplicates
- Schema version ≤ code version

---

## 💾 ARCHITECTURE DECISIONS

**Why SQLite + FTS5?**
- Local-first, no network
- Single dependency (better-sqlite3)
- Built-in full-text search
- ACID transactional
- Schema versioning

**Why Chunk-Based?**
- Precise search hits
- Context overlap for readability
- Memory efficient
- Per-chunk ranking (BM25)

**Why Prefix Matching?**
- Works with Chinese/mixed text
- User-friendly (no special syntax)
- Forgiving (partial matches work)
- Native FTS5 wildcard support

---

## 🎯 NEXT DEVELOPMENT PRIORITIES

1. **URL Adapter** - Fetch & parse web content
2. **Batch Import** - `kb ingest-dir path/`
3. **Export** - Save to markdown/JSON
4. **Edit Operations** - Update existing items
5. **Advanced Filters** - Word count, modification time

---

## 📈 CODE METRICS

| Metric | Value |
|--------|-------|
| Main Source Files | 41 TS files |
| SQL Migrations | 3 files |
| Total Lines | ~6,136 |
| Core Logic | ~2,500 |
| CLI/Commands | ~1,500 |
| Storage Layer | ~1,200 |
| Test Coverage | Multiple test files |

---

## ✨ UNIQUE FEATURES

1. **Chunk Overlap** - Context for search results
2. **Auto-Sync FTS** - Triggers keep search index current
3. **Multi-Level Config** - CLI → ENV → project → user
4. **Progress Events** - Real-time ingestion feedback
5. **Duplicate Strategies** - Choose action on conflicts
6. **Snippet Highlighting** - 【marked】 hit regions
7. **Type-Safe** - Full TypeScript with strict mode

