-- M3: Interactive Learning tables

-- Quiz sessions: tracks quiz attempts per knowledge item
CREATE TABLE quiz_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  knowledge_item_id INTEGER NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  level TEXT NOT NULL DEFAULT 'recall',
  total_questions INTEGER NOT NULL DEFAULT 0,
  correct_answers INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (knowledge_item_id) REFERENCES knowledge_items(id) ON DELETE CASCADE
);

CREATE INDEX idx_quiz_sessions_item ON quiz_sessions (knowledge_item_id);

-- Quiz answers: individual Q&A within a session
CREATE TABLE quiz_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  chunk_id INTEGER,
  question TEXT NOT NULL,
  expected_answer TEXT NOT NULL,
  user_answer TEXT,
  is_correct INTEGER,
  feedback TEXT,
  level TEXT NOT NULL,
  answered_at TEXT,
  FOREIGN KEY (session_id) REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE SET NULL
);

CREATE INDEX idx_quiz_answers_session ON quiz_answers (session_id);

-- Mastery scores: per-item or per-tag mastery using EMA
CREATE TABLE mastery_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  knowledge_item_id INTEGER,
  tag_id INTEGER,
  score REAL NOT NULL DEFAULT 0.0,
  total_attempts INTEGER NOT NULL DEFAULT 0,
  correct_attempts INTEGER NOT NULL DEFAULT 0,
  last_assessed_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (knowledge_item_id) REFERENCES knowledge_items(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_mastery_item ON mastery_scores (knowledge_item_id) WHERE tag_id IS NULL AND knowledge_item_id IS NOT NULL;
CREATE UNIQUE INDEX idx_mastery_tag ON mastery_scores (tag_id) WHERE knowledge_item_id IS NULL AND tag_id IS NOT NULL;

-- Reading progress: per-item reading state
CREATE TABLE reading_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  knowledge_item_id INTEGER NOT NULL UNIQUE,
  current_chunk_index INTEGER NOT NULL DEFAULT 0,
  total_chunks INTEGER NOT NULL,
  percentage REAL NOT NULL DEFAULT 0.0,
  status TEXT NOT NULL DEFAULT 'not_started',
  started_at TEXT,
  completed_at TEXT,
  last_read_at TEXT,
  FOREIGN KEY (knowledge_item_id) REFERENCES knowledge_items(id) ON DELETE CASCADE
);

CREATE INDEX idx_reading_progress_status ON reading_progress (status);

-- Bookmarks within content
CREATE TABLE bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  knowledge_item_id INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  label TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (knowledge_item_id) REFERENCES knowledge_items(id) ON DELETE CASCADE
);

CREATE INDEX idx_bookmarks_item ON bookmarks (knowledge_item_id);

-- Generated skills: track skill files produced from knowledge items
CREATE TABLE generated_skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  knowledge_item_id INTEGER NOT NULL,
  skill_name TEXT NOT NULL,
  skill_path TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (knowledge_item_id) REFERENCES knowledge_items(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_generated_skills_name ON generated_skills (skill_name);
CREATE INDEX idx_generated_skills_item ON generated_skills (knowledge_item_id);
