-- M4: Reading Notes - file-based notes with DB index
-- Notes are stored as standalone Markdown files; this table indexes them for search.

CREATE TABLE reading_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id TEXT NOT NULL,                  -- unique stable identifier (e.g. "note-20260511-a3f")
  knowledge_item_id INTEGER,             -- linked book (nullable for orphan notes)
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'thought',  -- concept | chapter | summary | thought
  file_path TEXT NOT NULL,               -- relative path from knowledgeBasePath (e.g. "notes/苏菲的世界/concept-苏格拉底.md")
  chapter TEXT,                          -- chapter name/identifier
  tags_json TEXT,                        -- JSON array of tag strings
  source TEXT NOT NULL DEFAULT 'manual', -- auto | manual | mixed
  chunk_refs_json TEXT,                  -- JSON array of chunk indices referenced
  content_preview TEXT,                  -- first ~200 chars for quick display
  word_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (knowledge_item_id) REFERENCES knowledge_items(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX idx_reading_notes_note_id ON reading_notes (note_id);
CREATE UNIQUE INDEX idx_reading_notes_file_path ON reading_notes (file_path);
CREATE INDEX idx_reading_notes_item ON reading_notes (knowledge_item_id);
CREATE INDEX idx_reading_notes_type ON reading_notes (type);
CREATE INDEX idx_reading_notes_created ON reading_notes (created_at);

-- FTS5 for note content search (shadowless: content synced via triggers)
CREATE VIRTUAL TABLE notes_fts USING fts5(
  title,
  content_preview,
  tags_text,
  content='reading_notes',
  content_rowid='id',
  tokenize='unicode61'
);

-- Sync triggers: keep FTS in sync with reading_notes table
CREATE TRIGGER reading_notes_ai AFTER INSERT ON reading_notes BEGIN
  INSERT INTO notes_fts (rowid, title, content_preview, tags_text)
  VALUES (
    new.id,
    new.title,
    new.content_preview,
    COALESCE(REPLACE(REPLACE(REPLACE(new.tags_json, '["', ''), '"]', ''), '","', ' '), '')
  );
END;

CREATE TRIGGER reading_notes_ad AFTER DELETE ON reading_notes BEGIN
  INSERT INTO notes_fts (notes_fts, rowid, title, content_preview, tags_text)
  VALUES (
    'delete',
    old.id,
    old.title,
    old.content_preview,
    COALESCE(REPLACE(REPLACE(REPLACE(old.tags_json, '["', ''), '"]', ''), '","', ' '), '')
  );
END;

CREATE TRIGGER reading_notes_au AFTER UPDATE ON reading_notes BEGIN
  INSERT INTO notes_fts (notes_fts, rowid, title, content_preview, tags_text)
  VALUES (
    'delete',
    old.id,
    old.title,
    old.content_preview,
    COALESCE(REPLACE(REPLACE(REPLACE(old.tags_json, '["', ''), '"]', ''), '","', ' '), '')
  );
  INSERT INTO notes_fts (rowid, title, content_preview, tags_text)
  VALUES (
    new.id,
    new.title,
    new.content_preview,
    COALESCE(REPLACE(REPLACE(REPLACE(new.tags_json, '["', ''), '"]', ''), '","', ' '), '')
  );
END;
