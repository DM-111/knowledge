# Knowledge CLI - Architecture Diagrams & Visual Guide

---

## 1. DATA FLOW - Ingestion Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│ User runs: kb ingest /path/to/file.md --tag ai,python           │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 1: RESOLVE-ADAPTER                                         │
│ ├─ Check file extension (.md, .markdown, .mdx)                  │
│ ├─ Select MarkdownAdapter                                       │
│ └─ Return IngestionAdapter implementation                       │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 2: FETCH                                                   │
│ ├─ Read file from filesystem                                    │
│ ├─ Handle encoding (UTF-8)                                      │
│ └─ Create RawContent { title, sourceType, sourcePath, markdown }│
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 3: PARSE                                                   │
│ ├─ Extract title: Find first H1-H6 or use filename              │
│ ├─ Normalize: CRLF→LF, trim                                     │
│ ├─ Count words: Remove whitespace, get length                   │
│ └─ Validate: Non-empty markdown                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 4: CHUNK                                                   │
│ ├─ Split on: headings (^#{1,6}) + paragraph breaks              │
│ ├─ Create ChunkDraft[]                                           │
│ ├─ Add overlap: last 1 paragraph from previous chunks            │
│ └─ Calculate offsets: startOffset, endOffset                     │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 5: STORE (Transaction)                                    │
│ ├─ Check for duplicate: (source_type, source_path)              │
│ │   ├─ If exists & replace: DELETE old                          │
│ │   ├─ If exists & skip: THROW                                  │
│ │   └─ If exists & error: THROW                                 │
│ ├─ INSERT knowledge_item                                        │
│ ├─ INSERT chunks[] (with overlap merged)                        │
│ ├─ UPSERT tags[]                                                │
│ └─ INSERT item_tags[] junctions                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 6: INDEX (Auto via Triggers)                              │
│ ├─ chunks_ai trigger: INSERT into chunks_fts                    │
│ ├─ FTS5 index: (content, knowledge_item_id, chunk_index)        │
│ └─ Ready for search                                             │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
                    ✅ SUCCESS
            IngestResult { title, sourcePath,
                           wordCount, chunkCount, tags }
```

---

## 2. DATABASE SCHEMA - Table Relationships

```
┌─────────────────────────────────┐
│      knowledge_items            │
├─────────────────────────────────┤
│ id (PK)                         │
│ title TEXT                      │
│ source_type TEXT ──┐            │
│ source_path TEXT   │ (UNIQUE)   │
│ content TEXT       │            │
│ word_count INT     │            │
│ created_at TEXT    │            │
│ note TEXT          │            │
└──────────┬──────────────────────┘
           │ 1
           │ (FK)
           ▼ N
┌─────────────────────────────────┐       ┌──────────────────────┐
│      chunks                     │───┐   │   chunks_fts         │
├─────────────────────────────────┤   └──▶├──────────────────────┤
│ id (PK)                         │       │ rowid                │
│ knowledge_item_id (FK)  ────────┼─┐     │ content TEXT         │
│ chunk_index INT                 │ │     │ knowledge_item_id    │
│ content TEXT            ────────┼─┼────▶│ chunk_index          │
│ start_offset INT                │ │     │ (Virtual FTS5 Table) │
│ end_offset INT                  │ │     └──────────────────────┘
│ overlap_start_offset INT        │ │
│ overlap_end_offset INT          │ │     [Auto-synced by triggers]
└─────────────────────────────────┘ │
                                     │
                                     └─────────────────────────────┐
                                         Indexed for full-text    │
                                         search with BM25 ranking  │

           ┌────────────────────────────────────────────────┐
           │ item_tags (Junction)                           │
           ├────────────────────────────────────────────────┤
           │ knowledge_item_id (FK) ──────────┐             │
           │ tag_id (FK)             ──────┐  │             │
           │ PRIMARY KEY (item, tag)        │  │             │
           └────────────────────────────────┼──┼─────────────┘
                                            │  │
                    ┌───────────────────────┘  │
                    │                          │
                    ▼                          ▼
           ┌────────────────────┐   ┌──────────────────────┐
           │ knowledge_items    │   │ tags                 │
           │ (many items        │   ├──────────────────────┤
           │  can have          │   │ id (PK)              │
           │  one tag)          │   │ name TEXT (UNIQUE)   │
           └────────────────────┘   └──────────────────────┘
                                     (one tag can apply
                                      to many items)
```

---

## 3. SEARCH FLOW

```
User Input: "machine learning"
       │
       ▼
┌─────────────────────────────────────┐
│ buildFtsMatchQuery()                │
├─────────────────────────────────────┤
│ 1. Tokenize on whitespace           │
│    → ["machine", "learning"]        │
│ 2. Validate each term               │
│    → reject FTS special chars       │
│    → reject reserved words          │
│ 3. Add prefix matching              │
│    → ["machine*", "learning*"]      │
│ 4. Combine with AND                 │
│    → "machine* AND learning*"       │
└────────────────┬──────────────────────┘
                 │ FTS Match Query
                 ▼
┌─────────────────────────────────────────────────┐
│ SearchRepository.searchByFtsQuery()             │
├─────────────────────────────────────────────────┤
│ SELECT c.id, k.title, k.source_path,            │
│        k.created_at,                            │
│        snippet(chunks_fts, ...) AS hitSnippet   │
│ FROM chunks_fts                                 │
│ INNER JOIN chunks c ON c.id = rowid             │
│ INNER JOIN knowledge_items k ON k.id = fts_id   │
│ WHERE chunks_fts MATCH @ftsMatch                │
│   AND k.source_type = @source (if filter)       │
│   AND k.created_at >= @after (if filter)        │
│   AND EXISTS subquery for tags (if filter)      │
│ ORDER BY bm25(chunks_fts) ASC                   │
│ LIMIT @limit                                    │
└────────────────┬──────────────────────────────────┘
                 │ SearchRow[]
                 ▼
┌─────────────────────────────────────┐
│ mapRowToHit()                       │
├─────────────────────────────────────┤
│ Convert DB row → SearchHit:         │
│ {                                   │
│   chunkId: 123,                     │
│   title: "ML Basics",               │
│   sourcePath: "docs/ml.md",         │
│   createdAt: "2026-05-01T...",      │
│   hitSnippet: "...【machine】 【learning】..."│
│ }                                   │
└────────────────┬──────────────────────┘
                 │
                 ▼
         SearchResult {
           items: SearchHit[],
           total: count
         }
```

---

## 4. ADAPTER PATTERN - Extensibility

```
┌─────────────────────────────────────────────────────────────┐
│ IngestionAdapter Interface                                   │
├─────────────────────────────────────────────────────────────┤
│ + readonly sourceType: SourceType                            │
│ + canHandle(source: string): boolean                         │
│ + ingest(source: string, options?): Promise<RawContent>     │
└─────────────┬──────────────────────┬───────────────┬─────────┘
              │                      │               │
         ┌────▼────┐           ┌─────▼─────┐  ┌─────▼─────┐
         │Markdown │           │  URL      │  │   PDF     │
         │Adapter  │           │ Adapter   │  │  Adapter  │
         ├─────────┤           ├───────────┤  ├───────────┤
         │✅ .md   │           │❌ Not yet │  │❌ Not yet │
         │✅ .mdx  │           │           │  │           │
         │✅ Title │           │ canHandle │  │ canHandle │
         │  extract│           │  https:// │  │ *.pdf     │
         └─────────┘           └───────────┘  └───────────┘
              │
              │ Registered in
              │ src/adapters/index.ts
              ▼
         INGESTION_ADAPTERS[]
              │
              ├─ MarkdownAdapter
              ├─ (Future) UrlAdapter
              └─ (Future) PdfAdapter

    resolveIngestionAdapter(source)
         returns first adapter where
         canHandle(source) === true
```

---

## 5. CONFIGURATION RESOLUTION

```
┌────────────────────────────────────────────────────────────────┐
│ Config Resolution (Priority Order)                             │
└────────────────────────────────────────────────────────────────┘

HIGHEST PRIORITY:
┌──────────────────────────────────┐
│ 1. CLI Flags                     │
│ kb ingest --db-path /custom/db   │
│ kb ingest --knowledge-base-path /kb
└──────────────────────────────────┘
          │ No, check next...
          ▼
┌──────────────────────────────────┐
│ 2. Environment Variables          │
│ export KB_DB_PATH=/custom/db      │
│ export KB_KNOWLEDGE_BASE_PATH=/kb │
└──────────────────────────────────┘
          │ No, check next...
          ▼
┌──────────────────────────────────┐
│ 3. Project Config                │
│ ./kb.config.yaml                 │
│ (in current working directory)   │
└──────────────────────────────────┘
          │ No, check next...
          ▼
┌──────────────────────────────────┐
│ 4. User Config                   │
│ ~/.config/kb/config.yaml         │
│ (in home directory)              │
└──────────────────────────────────┘
          │ No, use default...
          ▼
┌──────────────────────────────────┐
│ 5. Derived Default                │
│ dbPath = ${knowledgeBasePath}/   │
│          knowledge.db             │
└──────────────────────────────────┘
LOWEST PRIORITY:
          │
          ▼ Final Config
      ✅ READY
```

---

## 6. CHUNK OVERLAP VISUALIZATION

```
Original Markdown:
┌─────────────────────────────────────────┐
│ # Heading 1                             │
│ Paragraph A content...                  │
│                                         │
│ ## Heading 1.1                          │
│ Paragraph B content...                  │
│                                         │
│ Paragraph C content...                  │
│                                         │
│ ## Heading 1.2                          │
│ Paragraph D content...                  │
└─────────────────────────────────────────┘

After Chunking (with 1-paragraph overlap):

Chunk 0:
┌────────────────────┐
│ Paragraph A        │  ← chunk content
│ (no overlap, first)│
└────────────────────┘

Chunk 1:
┌────────────────────┐
│ Paragraph A        │  ← overlap (context)
├────────────────────┤
│ Paragraph B        │  ← chunk content
└────────────────────┘

Chunk 2:
┌────────────────────┐
│ Paragraph B        │  ← overlap (context)
├────────────────────┤
│ Paragraph C        │  ← chunk content
└────────────────────┘

Chunk 3:
┌────────────────────┐
│ Paragraph C        │  ← overlap (context)
├────────────────────┤
│ Paragraph D        │  ← chunk content
└────────────────────┘

Benefits:
✅ Search hits have surrounding context
✅ Maintains section continuity
✅ Better readability in results
```

---

## 7. COMMAND DISPATCH FLOW

```
kb ingest file.md --tag ai,python
     │
     ▼
┌──────────────────────────────┐
│ main.ts (entry point)        │
│ process.argv = [file.md, ...]│
└────────────┬─────────────────┘
             │
             ▼
┌──────────────────────────────────┐
│ run() in index.ts                │
│ createProgram() with commander   │
└────────────────┬─────────────────┘
                 │
                 ▼
┌──────────────────────────────────┐
│ Program.parseAsync()             │
│ Matches "ingest" command         │
└────────────────┬─────────────────┘
                 │
                 ▼
┌──────────────────────────────────┐
│ createIngestCommand() handler    │
│ .action(async (...args) => {...})│
└────────────────┬─────────────────┘
                 │
                 ▼
┌──────────────────────────────────┐
│ runIngestCommand(source, options)│
│ source = "file.md"               │
│ options.tag = "ai,python"        │
└────────────────┬─────────────────┘
                 │
                 ▼
┌──────────────────────────────────┐
│ ensureConfigForCommand()         │
│ Load & validate config           │
└────────────────┬─────────────────┘
                 │
                 ▼
┌──────────────────────────────────┐
│ inspectExistingSource()          │
│ Check for duplicate              │
└────────────────┬─────────────────┘
                 │
                 ▼
┌──────────────────────────────────┐
│ ingestSource()                   │
│ Run 6-stage pipeline             │
└────────────────┬─────────────────┘
                 │
                 ▼
            ✅ IngestResult
         Display summary
```

---

## 8. MIGRATION VERSIONING

```
Schema Evolution Timeline:

Time 0 (v0.0.0)
│
├─ 001-bootstrap.sql (v1)
│  └─ Creates database marker
│     user_version = 1
│
├─ 002-ingestion-schema.sql (v2)
│  └─ CREATE TABLE knowledge_items
│     CREATE TABLE chunks
│     CREATE VIRTUAL TABLE chunks_fts
│     CREATE TRIGGER chunks_ai/ad/au
│     user_version = 2
│
└─ 003-tags-and-note.sql (v3)
   └─ ALTER TABLE knowledge_items ADD note
      CREATE TABLE tags
      CREATE TABLE item_tags
      user_version = 3

Running kb with existing DB:
1. Check PRAGMA user_version
   → If 0: run migrations 1,2,3
   → If 2: run migration 3 only
   → If 3: no migrations (current)
   → If 4+: ERROR (code too old)
```

---

## 9. ERROR HANDLING FLOW

```
User Action
│
▼
┌──────────────────────────────────┐
│ Try {                            │
│   Execute command                │
│ }                                │
└──────────────────────────────────┘
│
├─ Success ──────────────────────────▶ Output result
│
└─ Error
   │
   ▼
   ┌──────────────────────────────────┐
   │ Catch error                      │
   ├──────────────────────────────────┤
   │ Is it a custom error?            │
   │ (IngestionError, SearchError,    │
   │  ConfigError, StorageError)      │
   └──────────────┬───────────────────┘
                  │
        ┌─────────┴──────────┐
        │ YES                │ NO
        ▼                    ▼
   ┌──────────────┐    ┌──────────────┐
   │ Extract      │    │ Generic      │
   │ context:     │    │ error wrap   │
   │ - step       │    │ with exit    │
   │ - source     │    │ code 1       │
   │ - exitCode   │    └──────────────┘
   └────────┬─────┘            │
            │                  │
            └──────────┬───────┘
                       │
                       ▼
         ┌────────────────────────────┐
         │ renderCliError()           │
         ├────────────────────────────┤
         │ Format based on:           │
         │ - options.json             │
         │ - error type               │
         │ Return:                    │
         │ { text, exitCode, write? } │
         └────────────┬───────────────┘
                      │
                      ▼
            ┌────────────────────┐
            │ Write to stderr    │
            │ Exit with code     │
            └────────────────────┘
```

---

## 10. TYPE HIERARCHY

```
RawContent (from adapter)
├─ title: string
├─ sourceType: 'local-markdown' | 'web'
├─ sourcePath: string
├─ markdown: string
└─ createdAt: ISO8601

    ▼ (after chunking)

ChunkDraft[]
├─ heading?: string
├─ content: string
├─ overlap?: string
├─ startOffset: number
├─ endOffset: number
├─ overlapStartOffset: number
└─ overlapEndOffset: number

    ▼ (stored in DB)

KnowledgeItem
├─ id: number
├─ title: string
├─ sourceType: string
├─ sourcePath: string
├─ content: string (full markdown)
├─ wordCount: number
├─ createdAt: string
└─ note?: string

Chunk
├─ id: number
├─ knowledgeItemId: number
├─ chunkIndex: number
├─ content: string (with overlap)
├─ startOffset: number
├─ endOffset: number
├─ overlapStartOffset: number
└─ overlapEndOffset: number

    ▼ (indexed in FTS)

chunks_fts (virtual)
├─ rowid ─────────────────────────▶ chunks.id
├─ content (indexed)
├─ knowledge_item_id (UNINDEXED)
└─ chunk_index (UNINDEXED)

    ▼ (returned from search)

SearchHit
├─ chunkId: number
├─ title: string
├─ sourcePath: string
├─ createdAt: string
└─ hitSnippet: string (【marker】ed)
```

---

## END OF DIAGRAMS

These visual guides complement the architecture documentation. For detailed implementation, see ARCHITECTURE.md and source files.

