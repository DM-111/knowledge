ALTER TABLE knowledge_items ADD COLUMN note TEXT;

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
