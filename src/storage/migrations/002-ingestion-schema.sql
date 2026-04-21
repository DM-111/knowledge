CREATE TABLE knowledge_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_path TEXT NOT NULL,
  content TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_knowledge_items_source ON knowledge_items (source_type, source_path);

CREATE TABLE chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  knowledge_item_id INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  overlap_start_offset INTEGER NOT NULL DEFAULT 0,
  overlap_end_offset INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (knowledge_item_id) REFERENCES knowledge_items(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_chunks_item_chunk_index ON chunks (knowledge_item_id, chunk_index);
CREATE INDEX idx_chunks_knowledge_item_id ON chunks (knowledge_item_id);

CREATE VIRTUAL TABLE chunks_fts USING fts5(
  content,
  knowledge_item_id UNINDEXED,
  chunk_index UNINDEXED,
  content = 'chunks',
  content_rowid = 'id'
);

CREATE TRIGGER chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts (rowid, content, knowledge_item_id, chunk_index)
  VALUES (new.id, new.content, new.knowledge_item_id, new.chunk_index);
END;

CREATE TRIGGER chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts (chunks_fts, rowid, content, knowledge_item_id, chunk_index)
  VALUES ('delete', old.id, old.content, old.knowledge_item_id, old.chunk_index);
END;

CREATE TRIGGER chunks_au AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_fts (chunks_fts, rowid, content, knowledge_item_id, chunk_index)
  VALUES ('delete', old.id, old.content, old.knowledge_item_id, old.chunk_index);
  INSERT INTO chunks_fts (rowid, content, knowledge_item_id, chunk_index)
  VALUES (new.id, new.content, new.knowledge_item_id, new.chunk_index);
END;
