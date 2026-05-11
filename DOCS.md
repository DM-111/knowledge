# Knowledge CLI - Documentation Index

Welcome! This folder contains comprehensive documentation of the Knowledge CLI architecture and capabilities.

---

## 📚 Documentation Files

### 1. **QUICKSTART.md** ⭐ START HERE
**Purpose:** Executive summary for quick understanding  
**Best for:** Getting oriented, understanding capabilities at a glance  
**Length:** ~7 KB  
**Contains:**
- Architecture layers overview
- Key directories and files
- Database schema summary
- Ingestion pipeline (6 stages)
- Search capabilities
- Configuration system
- Current capabilities checklist
- Extensibility patterns

### 2. **ARCHITECTURE.md** 📖 DEEP DIVE
**Purpose:** Comprehensive technical reference  
**Best for:** Understanding implementation details, extending the system  
**Length:** ~31 KB (21 sections)  
**Contains:**
- Complete project structure
- Entry point & CLI setup
- All 5 commands (init, ingest, search, list, tag)
- Adapter pattern & implementation
- Full ingestion pipeline (6 stages)
- SQLite schema (3 migrations, 5 tables)
- All 4 repository classes
- Search functionality (FTS5, ranking, filters)
- Configuration system (priority ordering)
- Output formatting (TTY, plain, JSON)
- Error handling
- Extension points for developers
- Testing & build setup
- Architectural decisions & rationale

### 3. **ARCHITECTURE_DIAGRAMS.md** 🎨 VISUAL REFERENCE
**Purpose:** Visual representations of key flows and relationships  
**Best for:** Understanding data flow, debugging, onboarding  
**Length:** ~15 KB (10 diagrams)  
**Contains:**
- Ingestion pipeline flow (6 stages)
- Database schema relationships
- Search execution flow
- Adapter pattern extensibility
- Configuration resolution priority
- Chunk overlap visualization
- Command dispatch flow
- Migration versioning
- Error handling flow
- Type hierarchy

### 4. **DOCS.md** (this file)
**Purpose:** Navigation and usage guide  
**Best for:** Finding what you need, understanding file organization

---

## 🗺️ Quick Navigation

### I want to...

**...understand the project quickly**
→ Read `QUICKSTART.md` (7 KB, 5 min)

**...understand how ingestion works**
→ `ARCHITECTURE.md` §6 + `ARCHITECTURE_DIAGRAMS.md` §1

**...understand how search works**
→ `ARCHITECTURE.md` §9 + `ARCHITECTURE_DIAGRAMS.md` §3

**...understand the database**
→ `ARCHITECTURE.md` §7 + `ARCHITECTURE_DIAGRAMS.md` §2

**...add a new file format**
→ `ARCHITECTURE.md` §14.1 + source: `src/adapters/`

**...add a new command**
→ `ARCHITECTURE.md` §14.2 + source: `src/cli/commands/`

**...add a new search filter**
→ `ARCHITECTURE.md` §14.3 + source: `src/core/search/filters.ts`

**...understand configuration**
→ `ARCHITECTURE.md` §10 + `ARCHITECTURE_DIAGRAMS.md` §5

**...understand the error system**
→ `ARCHITECTURE.md` §12 + `ARCHITECTURE_DIAGRAMS.md` §9

**...see all commands**
→ `ARCHITECTURE.md` §4 or `QUICKSTART.md`

**...understand the type system**
→ `ARCHITECTURE_DIAGRAMS.md` §10

---

## 📊 File Statistics

| File | Size | Time to Read | Focus |
|------|------|--------------|-------|
| QUICKSTART.md | 7.3 KB | 5 min | Overview |
| ARCHITECTURE.md | 31 KB | 20 min | Implementation |
| ARCHITECTURE_DIAGRAMS.md | 15 KB | 10 min | Visuals |
| Total | ~53 KB | ~35 min | Complete |

---

## 🏗️ Architecture at a Glance

```
CLI → Core Logic → Storage → SQLite + FTS5
                    ↑
               Adapters
```

**5 Commands:** init, ingest, search, list, tag  
**6 Ingestion Stages:** Resolve → Fetch → Parse → Chunk → Store → Index  
**5 Database Tables:** knowledge_items, chunks, chunks_fts, tags, item_tags  
**Extensible:** Adapters, commands, filters, formatters  

---

## 🔑 Key Files in Source Code

### Must-Read for Understanding Flow:
- `/src/cli/main.ts` - Entry point (8 lines!)
- `/src/cli/index.ts` - Command registration
- `/src/core/ingestion/pipeline.ts` - Ingest orchestration (333 lines)
- `/src/core/search/index.ts` - Search orchestration (143 lines)
- `/src/storage/provider.ts` - DB abstraction

### Must-Read for Understanding Data:
- `/src/storage/migrations/002-ingestion-schema.sql` - Schema definition
- `/src/core/types.ts` - Type definitions
- `/src/adapters/markdown-adapter.ts` - Adapter pattern example

### Extension Points:
- `/src/adapters/index.ts` - Register new adapters here
- `/src/cli/commands/` - Add new commands here
- `/src/core/search/filters.ts` - Add new filters here

---

## 💡 Key Concepts

### Adapters
Plugin architecture for content sources. Each adapter:
- Checks if it can handle a source (by filename, URL pattern, etc.)
- Reads the source and returns `RawContent`
- Can be chained together

**Current:** MarkdownAdapter (.md, .markdown, .mdx)  
**Potential:** UrlAdapter (https://...), PdfAdapter, ClipboardAdapter

### Chunking
Markdown is split into searchable paragraphs with overlap for context:
- Each paragraph becomes a chunk
- Previous paragraph added as overlap
- Maintains heading information
- Stores character offsets for reference

### FTS5 (Full-Text Search)
SQLite's built-in full-text search:
- Inverted index on chunk content
- BM25 ranking algorithm
- Prefix matching: "machine" matches "machine learning"
- Auto-synced via triggers

### Configuration
Multi-level resolution (highest to lowest priority):
1. CLI flags
2. Environment variables
3. Project config (./kb.config.yaml)
4. User config (~/.config/kb/config.yaml)
5. Defaults

### Migrations
Version-controlled schema evolution:
- Numbered files: `001-name.sql`, `002-name.sql`, etc.
- Validated for continuity
- Tracked in SQLite user_version
- Currently at v3

---

## 🚀 Quick Start Commands

```bash
# Setup
cd /Users/dm/MyCode/knowledge
pnpm install
pnpm build

# Development
pnpm dev

# Run CLI
kb init
kb ingest /path/to/file.md --tag ai
kb search "machine learning"
kb list --json

# Testing
pnpm test

# Type checking
pnpm typecheck
```

---

## 📈 Project Statistics

- **Source Lines:** ~6,136 TypeScript
- **Source Files:** 41 TS + 3 SQL migrations
- **Core Logic:** ~2,500 lines
- **CLI/Commands:** ~1,500 lines
- **Storage Layer:** ~1,200 lines
- **Tests:** Multiple test files (vitest)
- **Dependencies:** 5 packages (minimal!)

---

## ✅ Implemented Features

- ✅ Markdown ingestion (.md, .markdown, .mdx)
- ✅ FTS5 full-text search with BM25 ranking
- ✅ Tagging system
- ✅ 5 CLI commands (init, ingest, search, list, tag)
- ✅ Duplicate detection with strategies
- ✅ Configuration management (YAML + env overrides)
- ✅ Progress events for long operations
- ✅ Multiple output formats (TTY, plain, JSON)
- ✅ Database migrations (version-controlled)
- ✅ Comprehensive error handling
- ✅ Full TypeScript with strict mode

---

## 📋 Not Yet Implemented

- ❌ URL/web ingestion (architecture ready)
- ❌ PDF support
- ❌ Batch directory import
- ❌ Export functions
- ❌ Edit/update operations
- ❌ Item versioning/history
- ❌ Concurrent multi-writer support

---

## 🎯 Next Development Priorities

1. **URL Adapter** - Fetch & parse web content
2. **Batch Import** - `kb ingest-dir /path`
3. **Export** - Save to markdown/JSON/CSV
4. **Edit Operations** - Update existing items
5. **Advanced Filters** - Word count, modification time

---

## 🔗 Related Documentation

In the project root:
- `README.md` - Project overview
- `package.json` - Dependencies, scripts
- `tsconfig.json` - TypeScript config
- `vitest.config.ts` - Test config

---

## 📞 Quick Reference

### Configuration Paths
- User config: `~/.config/kb/config.yaml`
- Project config: `./kb.config.yaml`
- Database: Defaults to `${knowledgeBasePath}/knowledge.db`

### Database Location
- Default: `~/.local/share/knowledge/knowledge.db` (derived from default kb path)
- Custom: Set via config, env var, or CLI flag

### CLI Help
```bash
kb --help          # Show all commands
kb init --help     # Help for specific command
kb search --help   # List search options
```

---

## 🎓 Learning Path

**New to the project?**
1. Read QUICKSTART.md (5 min)
2. Look at ARCHITECTURE_DIAGRAMS.md (10 min)
3. Skim ARCHITECTURE.md sections 1-5 (10 min)
4. Try commands: `kb init`, `kb ingest`, `kb search`
5. Read deeper sections as needed

**Want to extend it?**
1. Read QUICKSTART.md §"Extensibility Patterns"
2. Read ARCHITECTURE.md §14 "Extension Points"
3. Look at existing adapter/command for pattern
4. Check ARCHITECTURE_DIAGRAMS.md for flow understanding
5. Write code, add tests, create PR

**Debugging an issue?**
1. Check error message for "step" and "source"
2. Look up that step in ARCHITECTURE.md
3. Check relevant flow in ARCHITECTURE_DIAGRAMS.md
4. Review source code with path from §"Critical Files"
5. Check tests for usage examples

---

## 📝 Notes for Developers

### TypeScript
- Strict mode enabled
- All types properly defined
- No `any` used
- Tests in same directory: `*.test.ts`

### Database
- Single-file SQLite
- Foreign keys enforced
- Transactions used for consistency
- FTS5 auto-synced via triggers

### Error Handling
- Custom error types: IngestionError, SearchError, ConfigError, StorageError
- Each includes context: step, source, cause
- Proper error codes for CLI exit

### Testing
```bash
pnpm test          # Run all tests
pnpm test --watch  # Watch mode
```

---

## 🤝 Contributing

When adding features:
1. Follow existing patterns
2. Add types for all inputs/outputs
3. Include error handling with context
4. Add tests for new functionality
5. Update docs if adding new capabilities

---

## 📄 License & Attribution

Project: Knowledge CLI  
Version: 0.1.0  
Status: Development  

---

**Last Updated:** May 11, 2026  
**Docs Version:** 1.0

For latest docs, see ARCHITECTURE.md and QUICKSTART.md in project root.

