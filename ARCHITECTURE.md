# Knowledge CLI - Comprehensive Architecture Analysis

**Project Location:** `/Users/dm/MyCode/knowledge/`  
**Total Source Lines:** ~6,136 lines of TypeScript  
**Date:** May 11, 2026

---

## 1. OVERVIEW & PURPOSE

**Knowledge** is a **local-first knowledge service CLI** written in TypeScript/Node.js. It provides a command-line interface for building and searching a local knowledge base stored in SQLite.

### Key Characteristics:
- **Package Name:** `knowledge` (v0.1.0)
- **CLI Command:** `kb`
- **Node Requirements:** ^20.19.0 || >=22.12.0
- **Language:** Chinese UI/documentation with full TypeScript implementation
- **DB Engine:** SQLite3 with FTS5 full-text search
- **Local-First:** All data stored locally, no cloud dependencies

---

## 2. OVERALL ARCHITECTURE

### 2.1 Layered Architecture

```
┌─────────────────────────────────────────┐
│       CLI Layer (commands)               │
│  - init, ingest, search, list, tag      │
├─────────────────────────────────────────┤
│    Core Business Logic Layer             │
│  - Ingestion Pipeline                    │
│  - Search & Filtering                    │
│  - Config Management                     │
├─────────────────────────────────────────┤
│    Storage & Repository Layer            │
│  - DatabaseProvider (better-sqlite3)     │
│  - 4 Repository Classes                  │
│  - Migration System                      │
├─────────────────────────────────────────┤
│    Adapter Layer                         │
│  - IngestionAdapter interface            │
│  - MarkdownAdapter implementation        │
│  - Extensible pattern for future         │
└─────────────────────────────────────────┘
```

### 2.2 Project Structure

```
src/
├── adapters/                    # Source/format handlers
│   ├── index.ts                # Adapter registry
│   └── markdown-adapter.ts      # .md, .markdown, .mdx support
│
├── cli/                         # Command-line interface
│   ├── main.ts                 # Entry point
│   ├── index.ts                # Program setup (commander)
│   ├── shared-options.ts       # Config option flags
│   ├── commands/               # Individual commands
│   │   ├── init.ts             # Configuration setup
│   │   ├── ingest.ts           # Import content
│   │   ├── search.ts           # FTS keyword search
│   │   ├── list.ts             # List items
│   │   ├── tag.ts              # Tag operations
│   │   └── query-options.ts    # Shared query parsing
│   └── formatters/             # Output formatting
│       ├── index.ts
│       ├── plain-formatter.ts
│       ├── tty-formatter.ts
│       ├── json-formatter.ts
│       └── ingest-progress.ts
│
├── config/                      # Configuration system
│   ├── schema.ts               # Config types & paths
│   ├── loader.ts               # Load from YAML
│   ├── writer.ts               # Write to YAML
│   └── index.ts                # Config API
│
├── core/                        # Core business logic
│   ├── types.ts                # Shared type definitions
│   ├── index.ts                # Public API
│   ├── ingestion/              # Content ingestion
│   │   ├── adapter.ts          # Adapter interface
│   │   ├── chunker.ts          # Markdown chunking logic
│   │   ├── pipeline.ts         # Main ingest pipeline
│   │   └── inspect-existing-source.ts  # Duplicate detection
│   └── search/                 # Search functionality
│       ├── index.ts            # Search functions
│       ├── types.ts            # Search type definitions
│       ├── filters.ts          # Filter normalization
│       └── fts-match.ts        # FTS query builder
│
├── storage/                     # Database access layer
│   ├── provider.ts             # better-sqlite3 wrapper
│   ├── migrator.ts             # Migration runner
│   ├── index.ts                # Storage API
│   ├── migrations/             # SQL migration files
│   │   ├── 001-bootstrap.sql
│   │   ├── 002-ingestion-schema.sql
│   │   └── 003-tags-and-note.sql
│   └── repositories/           # Data access objects
│       ├── knowledge-item-repository.ts
│       ├── chunk-repository.ts
│       ├── tag-repository.ts
│       └── search-repository.ts
│
├── errors/                      # Error types
│   └── index.ts                # Custom error classes
│
└── utils/                       # Utilities
    └── index.ts
```

---

## 3. ENTRY POINT & CLI SETUP

**File:** `/Users/dm/MyCode/knowledge/src/cli/main.ts`

```typescript
#!/usr/bin/env node
import { handleCliError, run } from './index.js';

run().catch((error: unknown) => {
  handleCliError(error, { json: process.argv.includes('--json') });
});
```

**Main CLI:** `/Users/dm/MyCode/knowledge/src/cli/index.ts`

Uses **commander.js** library for command parsing:

```typescript
export function createProgram(options: CreateProgramOptions = {}): Command {
  const program = new Command();
  program
    .name('kb')
    .description('本地知识服务 CLI')
    .showHelpAfterError()
    .showSuggestionAfterError(!options.json);
  
  program.addCommand(createInitCommand());
  program.addCommand(createIngestCommand());
  program.addCommand(createSearchCommand());
  program.addCommand(createListCommand());
  program.addCommand(createTagCommand());
  
  return program;
}
```

**Binary Entry:** `package.json` specifies `"bin": { "kb": "./bin/kb.js" }`

---

## 4. COMMANDS & CAPABILITIES

### 4.1 `kb init` - Initialize Configuration

**File:** `/Users/dm/MyCode/knowledge/src/cli/commands/init.ts`

**Purpose:** Interactive setup of knowledge base location and database path.

**Flow:**
1. Check for existing config at `~/.config/kb/config.yaml`
2. If interactive: prompt user for paths
3. Create database with migrations
4. Write config to user home directory

**Config Storage:**
- User config: `~/.config/kb/config.yaml`
- Project config: `./kb.config.yaml` (if present)
- Environment override: `KB_MIGRATIONS_DIR` etc.
- CLI override: `--db-path`, `--knowledge-base-path`

**Config Schema:**
```typescript
interface Config {
  knowledgeBasePath?: string;
  dbPath?: string;
}
```

---

### 4.2 `kb ingest [source]` - Import Content

**File:** `/Users/dm/MyCode/knowledge/src/cli/commands/ingest.ts`

**Purpose:** Add markdown files to knowledge base.

**Options:**
```
--tag <tags>          Comma-separated tags
--note <note>         Ingest note/annotation
--db-path <path>      Override database location
--knowledge-base-path <path>  Override knowledge base path
```

**Duplicate Handling:**
- Detection: Checks if source (by file path) already exists
- Interactive mode: Prompts user to replace or skip
- Non-interactive: Defaults to skip
- Strategies: 'error' (default interactive), 'replace', 'skip'

**Process Flow:**
1. Check config exists
2. Inspect for existing source
3. If duplicate (interactive): prompt user for action
4. Call ingestion pipeline
5. Display results with metadata

---

### 4.3 `kb search [query]` - Full-Text Search

**File:** `/Users/dm/MyCode/knowledge/src/cli/commands/search.ts`

**Purpose:** Search across all ingested content using FTS5.

**Options:**
```
--limit <n>           Max results (default: 20)
--json                JSON output format
--tag <name>          Filter by exact tag
--source <type>       Filter by source (e.g., 'local-markdown')
--after <date>        Include items created >= date
--before <date>       Include items created <= date
--db-path <path>      Override database location
```

**Query Processing:**
- User input tokenized on whitespace
- Terms combined with AND operator
- Supports prefix matching (auto-appends `*` unless present)
- Rejects FTS special chars: `"'():^+\-{}[]`
- Reserved tokens: AND, OR, NOT, NEAR

**Ranking:**
- Attempts BM25 ranking if available
- Falls back to rank ordering
- Returns snippet with highlighted matches

---

### 4.4 `kb list` - Browse Knowledge Base

**File:** `/Users/dm/MyCode/knowledge/src/cli/commands/list.ts`

**Purpose:** List all ingested knowledge items with optional filters.

**Options:**
```
--limit <n>           Max items to show
--json                JSON output
--tag <name>          Filter by tag
--source <type>       Filter by source
--after <date>        Created >= date
--before <date>       Created <= date
```

**Output:** Lists titles, source types, tags, creation dates.

---

### 4.5 `kb tag` - Tag Management

**File:** `/Users/dm/MyCode/knowledge/src/cli/commands/tag.ts`

**Purpose:** Manage tags on knowledge items.

*(Implementation details in tag.ts)*

---

## 5. ADAPTERS & SOURCE TYPES

### 5.1 Adapter Pattern

**File:** `/Users/dm/MyCode/knowledge/src/core/ingestion/adapter.ts`

```typescript
export interface IngestionAdapter {
  readonly sourceType: SourceType;
  canHandle(source: string): boolean;
  ingest(source: string, options?: IngestOptions): Promise<RawContent>;
}
```

### 5.2 Markdown Adapter

**File:** `/Users/dm/MyCode/knowledge/src/adapters/markdown-adapter.ts`

**Supported Extensions:** `.md`, `.markdown`, `.mdx`

**Processing:**
1. **Title Extraction:** 
   - Scans for first H1-H6 heading (`# ` pattern)
   - Falls back to filename if no heading found

2. **Normalization:**
   - Converts CRLF → LF
   - Trims leading/trailing whitespace

3. **Output:** Returns `RawContent` with markdown field

### 5.3 Adapter Registry

**File:** `/Users/dm/MyCode/knowledge/src/adapters/index.ts`

```typescript
export function resolveIngestionAdapter(source: string): IngestionAdapter {
  const adapter = INGESTION_ADAPTERS.find((candidate) => 
    candidate.canHandle(source)
  );
  if (!adapter) {
    throw new IngestionError('不支持的文件类型', { ... });
  }
  return adapter;
}
```

**Future Extensibility:**
- Add web adapter for URLs
- Add PDF adapter
- Add API/clipboard adapter
- Pattern: Add to `INGESTION_ADAPTERS` array in `/src/adapters/index.ts`

---

## 6. INGESTION PIPELINE

**File:** `/Users/dm/MyCode/knowledge/src/core/ingestion/pipeline.ts`

### 6.1 Main Function

```typescript
export async function ingestSource(
  options: IngestSourceOptions
): Promise<IngestResult>
```

### 6.2 Pipeline Stages

```
1. RESOLVE-ADAPTER
   └─ Select adapter based on file type

2. FETCH
   └─ Read raw content from source

3. PARSE
   └─ Extract title
   └─ Normalize Markdown
   └─ Calculate word count
   └─ Validate non-empty

4. CHUNK
   └─ Split content by heading + paragraph
   └─ Add overlap context (1 paragraph)
   └─ Generate offsets

5. STORE
   └─ Transaction: Create knowledge_item
   └─ Create chunks
   └─ Create/link tags
   └─ Handle duplicates (replace/skip/error)

6. INDEX
   └─ FTS5 triggers auto-sync chunks
```

### 6.3 Chunking Strategy

**File:** `/Users/dm/MyCode/knowledge/src/core/ingestion/chunker.ts`

**Algorithm:**
- Splits content by lines
- Groups lines into paragraphs (empty line = boundary)
- Detects headings (lines matching `^#{1,6}\s+`)
- Each paragraph = one chunk
- Overlap = last N paragraphs from previous chunks

**Chunk Data Structure:**
```typescript
interface ChunkDraft {
  heading?: string;           // Associated heading
  content: string;            // Chunk text
  overlap?: string;           // Previous chunk context
  startOffset: number;        // Position in original
  endOffset: number;
  overlapStartOffset: number;
  overlapEndOffset: number;
}
```

### 6.4 Progress Events

**File:** `/Users/dm/MyCode/knowledge/src/core/types.ts`

```typescript
interface ProgressEvent {
  step: string;        // 'resolve-adapter', 'fetch', 'parse', 'chunk', 'store', 'index'
  status: 'start' | 'progress' | 'complete' | 'error';
  detail?: string;     // Human-readable message
  metadata?: Record<string, unknown>;
}
```

Used for real-time progress rendering in interactive mode.

---

## 7. SQLite SCHEMA & STORAGE LAYER

### 7.1 Database Provider

**File:** `/Users/dm/MyCode/knowledge/src/storage/provider.ts`

```typescript
interface DatabaseProvider {
  readonly dbPath: string;
  getConnection(): Database;
  transaction<T>(handler: (db: Database) => T): T;
  getUserVersion(): number;
  setUserVersion(version: number): void;
  close(): void;
}
```

- Uses **better-sqlite3** for synchronous SQLite access
- Foreign keys enabled: `PRAGMA foreign_keys = ON`
- User version tracks schema migrations

### 7.2 Migration System

**File:** `/Users/dm/MyCode/knowledge/src/storage/migrator.ts`

**Pattern:** Numbered SQL files with strict validation

```
Migrations:
  001-bootstrap.sql           (v1)
  002-ingestion-schema.sql    (v2)
  003-tags-and-note.sql       (v3)
```

**Naming Convention:** `NNN-description.sql`
- Leading zeros required (zero-padded to 3 digits)
- Description in kebab-case

**Validation:**
- Version continuity check (no gaps)
- No duplicate versions
- Schema version ≤ current code version

### 7.3 Schema (Migration 002)

**Tables:**

#### `knowledge_items`
```sql
CREATE TABLE knowledge_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,           -- 'local-markdown', 'web', etc.
  source_path TEXT NOT NULL,           -- File path or URL
  content TEXT NOT NULL,               -- Full normalized markdown
  word_count INTEGER NOT NULL,         -- Character count
  created_at TEXT NOT NULL             -- ISO 8601 timestamp
);

CREATE UNIQUE INDEX idx_knowledge_items_source 
  ON knowledge_items (source_type, source_path);
```

#### `chunks`
```sql
CREATE TABLE chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  knowledge_item_id INTEGER NOT NULL,  -- FK to knowledge_items
  chunk_index INTEGER NOT NULL,        -- 0-indexed position
  content TEXT NOT NULL,               -- Chunk text with overlap
  start_offset INTEGER NOT NULL,       -- Position in original
  end_offset INTEGER NOT NULL,
  overlap_start_offset INTEGER DEFAULT 0,
  overlap_end_offset INTEGER DEFAULT 0,
  FOREIGN KEY (knowledge_item_id) 
    REFERENCES knowledge_items(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_chunks_item_chunk_index
  ON chunks (knowledge_item_id, chunk_index);
CREATE INDEX idx_chunks_knowledge_item_id
  ON chunks (knowledge_item_id);
```

#### `chunks_fts` (FTS5 Virtual Table)
```sql
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  content,
  knowledge_item_id UNINDEXED,    -- Don't index metadata
  chunk_index UNINDEXED,
  content = 'chunks',             -- Shadow table
  content_rowid = 'id'            -- Sync with rowid
);

-- Automatic sync triggers
CREATE TRIGGER chunks_ai AFTER INSERT ON chunks ...
CREATE TRIGGER chunks_ad AFTER DELETE ON chunks ...
CREATE TRIGGER chunks_au AFTER UPDATE ON chunks ...
```

### 7.4 Schema (Migration 003)

**New Columns:**
```sql
ALTER TABLE knowledge_items ADD COLUMN note TEXT;
```

**New Tables:**
```sql
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_tags_name ON tags (name);

CREATE TABLE item_tags (
  knowledge_item_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (knowledge_item_id, tag_id),
  FOREIGN KEY (knowledge_item_id) REFERENCES knowledge_items(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
CREATE INDEX idx_item_tags_tag_id ON item_tags (tag_id);
```

---

## 8. REPOSITORIES (Data Access Layer)

### 8.1 KnowledgeItemRepository

**File:** `/Users/dm/MyCode/knowledge/src/storage/repositories/knowledge-item-repository.ts`

**Methods:**
- `create(input)`: Insert new knowledge item
- `findBySource(sourceType, sourcePath)`: Find by unique source
- `deleteById(id)`: Remove item (cascades to chunks/tags)
- `list(options)`: Query with filters
- `count(options)`: Total count with filters

**Filter Options:**
```typescript
interface ListKnowledgeItemsQueryOptions {
  limit?: number;
  tag?: string;
  source?: string;
  createdAfter?: string;
  createdBefore?: string;
}
```

### 8.2 ChunkRepository

**File:** `/Users/dm/MyCode/knowledge/src/storage/repositories/chunk-repository.ts`

**Methods:**
- `createMany(knowledgeItemId, chunks)`: Batch insert chunks

### 8.3 TagRepository

**File:** `/Users/dm/MyCode/knowledge/src/storage/repositories/tag-repository.ts`

**Methods:**
- `ensureTagIds(names)`: Create or fetch tag IDs (upsert)
- `linkTagsToItem(itemId, tagIds)`: Create associations
- `listTagsByKnowledgeItemIds(itemIds)`: Fetch tags for items

### 8.4 SearchRepository

**File:** `/Users/dm/MyCode/knowledge/src/storage/repositories/search-repository.ts`

**Methods:**
- `searchByFtsQuery(ftsQuery, options)`: FTS5 search with ranking
- `countByFtsQuery(ftsQuery, options)`: Result count

**Ranking Strategy:**
1. Try BM25 ranking (if supported)
2. Fall back to FTS5 rank()
3. Generate snippets with context

**Snippet Generation:**
```
Open marker:  【
Close marker: 】
Ellipsis:     …
Context:      20 tokens around hit
```

---

## 9. SEARCH FUNCTIONALITY

### 9.1 Search Function

**File:** `/Users/dm/MyCode/knowledge/src/core/search/index.ts`

```typescript
export function searchByKeyword(
  options: SearchByKeywordOptions
): SearchResult {
  // 1. Build FTS match query
  // 2. Initialize storage
  // 3. Execute search + count
  // 4. Map results with error handling
}
```

### 9.2 Query Builder

**File:** `/Users/dm/MyCode/knowledge/src/core/search/fts-match.ts`

**Input:** `"TypeScript 泛型"` (raw user query)

**Process:**
1. Tokenize on whitespace (Unicode-aware)
2. Validate each term:
   - Remove special chars: `"'():^+-{}[]`
   - Reject reserved tokens: AND, OR, NOT, NEAR
   - Allow trailing wildcard `*`
3. Add prefix match: `term*` (unless already ends with `*`)
4. Combine: `term1* AND term2* AND ...`

**Output:** `"TypeScript* AND 泛型*"`

**Notes:**
- No phrase matching (quotes) due to Chinese mixed-text issues
- Prefix matching is default strategy
- FTS5 uses unicode61 tokenizer

### 9.3 Search Types

**File:** `/Users/dm/MyCode/knowledge/src/core/search/types.ts`

```typescript
interface SearchByKeywordOptions extends SearchFilterOptions {
  query: string;
  limit: number;
  dbPath: string;
}

interface SearchResult {
  items: SearchHit[];
  total: number;
}

interface SearchHit {
  chunkId: number;
  title: string;
  sourcePath: string;
  createdAt: string;
  hitSnippet: string;  // With 【】 markers
}
```

### 9.4 Filter Normalization

**File:** `/Users/dm/MyCode/knowledge/src/core/search/filters.ts`

Validates and normalizes:
- Date formats (YYYY-MM-DD, ISO 8601)
- Tag names
- Source type enum validation
- Time range logic

---

## 10. CONFIGURATION SYSTEM

### 10.1 Config API

**File:** `/Users/dm/MyCode/knowledge/src/config/index.ts`

```typescript
export interface Config {
  knowledgeBasePath?: string;
  dbPath?: string;
}

export interface LoadedConfig {
  config: Readonly<Config>;
  sources: Readonly<ConfigSources>;  // Tracks origin of each field
  paths: Readonly<ConfigPaths>;
}
```

### 10.2 Config Sources (Priority Order)

1. **CLI Options** (highest priority)
   - `--db-path`, `--knowledge-base-path`

2. **Environment Variables**
   - `KB_DB_PATH`, `KB_KNOWLEDGE_BASE_PATH`

3. **Project Config**
   - `./kb.config.yaml`

4. **User Config** (lowest priority)
   - `~/.config/kb/config.yaml`

5. **Defaults** (if derivable)
   - `dbPath = ${knowledgeBasePath}/knowledge.db`

### 10.3 Config Format (YAML)

```yaml
knowledgeBasePath: /path/to/knowledge-base
dbPath: /path/to/knowledge.db
```

### 10.4 Config Loader

**File:** `/Users/dm/MyCode/knowledge/src/config/loader.ts`

- Merges config from multiple sources
- Tracks which source provided each field
- Supports CLI overrides
- Validates paths exist/creatable

### 10.5 Config Writer

**File:** `/Users/dm/MyCode/knowledge/src/config/writer.ts`

- Writes to user config path
- Serializes to YAML
- Creates directories if needed

---

## 11. OUTPUT FORMATTING

### 11.1 Format Modes

**File:** `/Users/dm/MyCode/knowledge/src/cli/formatters/index.ts`

**Modes:**
- `plain`: Simple text, no colors
- `tty`: Rich output with colors (when stdout is TTY)
- `json`: Structured JSON output

**Resolver Logic:**
```typescript
function resolveOutputMode(options: {
  json?: boolean;
  stdoutIsTTY?: boolean;
}): OutputMode {
  if (options.json) return 'json';
  if (options.stdoutIsTTY) return 'tty';
  return 'plain';
}
```

### 11.2 Formatters

**TTY Formatter:** `/Users/dm/MyCode/knowledge/src/cli/formatters/tty-formatter.ts`
- Colors, bold, dimmed text
- Human-friendly layout

**JSON Formatter:** `/Users/dm/MyCode/knowledge/src/cli/formatters/json-formatter.ts`
- Structured output
- Script-friendly

**Plain Formatter:** `/Users/dm/MyCode/knowledge/src/cli/formatters/plain-formatter.ts`
- No formatting
- Log-friendly

### 11.3 Progress Rendering

**File:** `/Users/dm/MyCode/knowledge/src/cli/formatters/ingest-progress.ts`

Real-time progress during ingest:
- Shows current step
- Displays detail message
- Error reporting
- Completion summary

---

## 12. ERROR HANDLING

### 12.1 Error Classes

**File:** `/Users/dm/MyCode/knowledge/src/errors/index.ts`

```typescript
class IngestionError extends Error {
  constructor(message: string, context: {
    step: string;
    source: string;
    cause?: unknown;
    exitCode?: number;
  })
}

class SearchError extends Error { ... }
class ConfigError extends Error { ... }
class StorageError extends Error { ... }
```

### 12.2 Error Rendering

**File:** `/Users/dm/MyCode/knowledge/src/cli/formatters/index.ts`

```typescript
export function renderCliError(error: unknown, options?: { json?: boolean }): {
  text: string;
  exitCode: number;
  shouldWrite: boolean;
}
```

- Formats errors for output
- Includes step information
- Distinguishes error types
- JSON vs. plain rendering

---

## 13. EXISTING CAPABILITIES SUMMARY

### Implemented Features:

| Feature | Status | Implementation |
|---------|--------|-----------------|
| Configuration | ✅ Implemented | YAML config, CLI overrides, env vars |
| Markdown Ingestion | ✅ Implemented | .md/.markdown/.mdx, title extraction, chunking |
| FTS5 Search | ✅ Implemented | Prefix matching, BM25 ranking, snippets |
| Tagging | ✅ Implemented | Tag creation, linking, filtering |
| CLI Commands | ✅ Implemented | init, ingest, search, list, tag |
| Duplicate Detection | ✅ Implemented | Source-based detection with strategies |
| Progress Events | ✅ Implemented | Real-time ingest progress |
| Output Formatting | ✅ Implemented | TTY, plain, JSON formats |
| Database Migrations | ✅ Implemented | Version-tracked, validated schema |
| Error Handling | ✅ Implemented | Custom error types with context |

### Not Yet Implemented:

| Feature | Status | Notes |
|---------|--------|-------|
| Web/URL Ingestion | ❌ Adapter ready | SourceType='web' defined, awaiting adapter |
| PDF Ingestion | ❌ No adapter | Pattern: create PdfAdapter |
| Clipboard Source | ❌ No adapter | Could add stdin-based import |
| Update/Edit Items | ❌ No command | Would need update pipeline |
| Batch Operations | ❌ No command | Could add batch import dir |
| Export Functions | ❌ No export | Could export to markdown/JSON |
| Advanced Filtering | ❌ Limited | Currently: tag, source, date range only |
| Diff/History | ❌ No tracking | No versioning of items |
| Full-Text Indexing | ✅ Built-in | FTS5 with auto-sync triggers |
| Concurrent Access | ⚠️ SQLite locks | Single-writer limitation |

---

## 14. EXTENSION POINTS

### 14.1 Adding New Adapters

**Pattern:**

```typescript
// src/adapters/url-adapter.ts
import type { IngestionAdapter } from '../core/ingestion/adapter.js';

export class UrlAdapter implements IngestionAdapter {
  readonly sourceType = 'web';
  
  canHandle(source: string): boolean {
    return source.startsWith('http://') || source.startsWith('https://');
  }
  
  async ingest(source: string, options?: IngestOptions): Promise<RawContent> {
    // Fetch URL, extract title, return RawContent
  }
}

// src/adapters/index.ts - register
const INGESTION_ADAPTERS = [
  new MarkdownAdapter(),
  new UrlAdapter(),  // Add here
];
```

### 14.2 Adding New Commands

**Pattern:**

```typescript
// src/cli/commands/export.ts
export function createExportCommand(): Command {
  return new Command('export')
    .argument('[target]', 'Export destination')
    .description('Export knowledge items')
    .action(async (...args) => {
      // Implementation
    });
}

// src/cli/index.ts - register
program.addCommand(createExportCommand());
```

### 14.3 Extending Search Filters

**Pattern:**

```typescript
// src/core/search/filters.ts - extend SearchFilterOptions
interface SearchFilterOptions {
  // Current:
  tag?: string;
  source?: string;
  createdAfter?: string;
  createdBefore?: string;
  
  // Add new:
  modifiedAfter?: string;
  wordCountMin?: number;
  wordCountMax?: number;
}

// Update search repositories to handle new filters
```

---

## 15. TESTING & BUILD

### 15.1 Testing

**Framework:** Vitest

```bash
pnpm test
```

Test files: `**/*.test.ts` throughout src/

### 15.2 Build

**Tool:** tsup (bundler)

```bash
pnpm build
```

Creates dist/ with compiled JS + migrations copied

**Entry Points:**
- `dist/cli/main.js` - CLI executable
- `dist/core/index.js` - Programmatic API
- `dist/storage/migrations/` - Migration files

### 15.3 Development

```bash
pnpm dev           # Run via tsx with hot-reload
pnpm typecheck     # TypeScript validation
pnpm build         # Production build
```

### 15.4 Installation

```bash
pnpm build
pnpm link --global
kb --help
```

---

## 16. KEY ARCHITECTURAL DECISIONS

### 16.1 Why SQLite + FTS5?

✅ **Local-first:** No network required  
✅ **Minimal deps:** Single better-sqlite3 package  
✅ **Full-text search:** Built-in FTS5 module  
✅ **Transactional:** ACID guarantees  
✅ **Schema evolution:** Migration system  

### 16.2 Why Chunk-Based Storage?

✅ **Search precision:** Hits point to specific sections  
✅ **Context:** Overlap provides surrounding context  
✅ **Memory efficient:** Large files don't load entirely  
✅ **Ranking:** BM25 per-chunk, not per-document  

### 16.3 Why Prefix Matching?

✅ **Chinese/mixed text:** Quote-based phrases fail  
✅ **Forgiving:** "Type" matches "TypeScript"  
✅ **Predictable:** No special syntax needed  
✅ **FTS5 optimized:** Native wildcard support  

### 16.4 Why Commander.js?

✅ **Lightweight:** Minimal dependency  
✅ **Composable:** Commands & options modular  
✅ **Help generation:** Auto-generated docs  
✅ **Error handling:** Built-in validation  

### 16.5 Why YAML Config?

✅ **Human-readable:** Easy manual editing  
✅ **Standard:** Well-supported in Node.js  
✅ **Nested:** Extensible for future config  

---

## 17. CRITICAL FILES TO UNDERSTAND

**For understanding overall flow:**
1. `/src/cli/main.ts` - Entry point
2. `/src/cli/index.ts` - Command registration
3. `/src/core/ingestion/pipeline.ts` - Ingest logic
4. `/src/core/search/index.ts` - Search logic
5. `/src/storage/provider.ts` - DB layer

**For understanding data model:**
1. `/src/storage/migrations/002-ingestion-schema.sql` - Schema
2. `/src/storage/repositories/*.ts` - Data access
3. `/src/core/types.ts` - Type definitions

**For extending:**
1. `/src/adapters/index.ts` - How to add adapters
2. `/src/adapters/markdown-adapter.ts` - Adapter pattern
3. `/src/cli/commands/ingest.ts` - Command pattern
4. `/src/core/search/filters.ts` - Filter pattern

---

## 18. CONFIGURATION PATH RESOLUTION

**Determines db location in this order:**

```
1. CLI flag: --db-path
2. ENV var: KB_DB_PATH
3. Project config: ./kb.config.yaml → dbPath
4. User config: ~/.config/kb/config.yaml → dbPath
5. Derived: ${knowledgeBasePath}/knowledge.db
```

**Same for knowledgeBasePath:**

```
1. CLI flag: --knowledge-base-path
2. ENV var: KB_KNOWLEDGE_BASE_PATH
3. Project config: ./kb.config.yaml → knowledgeBasePath
4. User config: ~/.config/kb/config.yaml → knowledgeBasePath
5. Interactive prompt during init
```

---

## 19. WORD COUNT & CODE METRICS

| Metric | Value |
|--------|-------|
| Total Source Lines | ~6,136 |
| Main Files | 41 TS files + 3 SQL migrations |
| Core Logic | ~2,500 lines |
| CLI/Commands | ~1,500 lines |
| Storage/Repos | ~1,200 lines |
| Tests | Multiple test files |
| Dependencies | 5 (commander, better-sqlite3, yaml, inquirer, execa) |

---

## 20. NEXT STEPS FOR DEVELOPMENT

**If adding URL ingestion:**
1. Create `UrlAdapter` implementing `IngestionAdapter`
2. Add fetch logic (handle redirects, timeouts)
3. Implement title extraction from HTML
4. Register in `src/adapters/index.ts`

**If adding batch import:**
1. Create `batchIngest` function in core
2. Add `kb ingest-dir` command
3. Parallel processing with error recovery
4. Progress aggregation

**If adding export:**
1. Create `ExportCommand` in CLI
2. Add repository methods for data export
3. Support formats: markdown, JSON, CSV
4. Handle file I/O safely

**If adding persistence/history:**
1. Extend schema with version table
2. Track created_at → updated_at separately
3. Add soft-delete support
4. Update search to exclude deleted items

---

## 21. COMMAND EXAMPLES

### Init
```bash
kb init
# Interactive setup

kb init --knowledge-base-path=/data/kb
# With override
```

### Ingest
```bash
kb ingest /path/to/file.md
# Basic ingest

kb ingest /path/to/file.md --tag python,ai --note "Research notes"
# With metadata

KB_DB_PATH=/custom/path.db kb ingest file.md
# With env var
```

### Search
```bash
kb search "machine learning"
# Interactive mode shows formatted results

kb search "TypeScript" --limit 50 --json
# JSON output

kb search "neural" --tag ai --after 2026-01-01 --before 2026-05-01
# With filters
```

### List
```bash
kb list
# All items

kb list --tag python --limit 10
# Filtered

kb list --json
# Machine-readable
```

---

## CONCLUSION

**Knowledge CLI** is a well-architected, extensible local knowledge management system with:

- **Clean layering:** CLI → Core → Storage → Database
- **Adapter pattern:** Ready for multiple source types
- **Robust ingestion:** Chunking, progress tracking, duplicate handling
- **Powerful search:** FTS5 with ranking, filters, snippets
- **Configuration:** Multi-level overrides, environment support
- **Error handling:** Typed errors with context
- **Testing ready:** Test files throughout codebase

**Primary use case:** Local markdown-to-SQLite knowledge base with full-text search.

**Extension potential:** URL sources, PDF ingestion, batch operations, export formats, history tracking.

