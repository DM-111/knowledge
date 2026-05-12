import type Database from 'better-sqlite3';
import type { DatabaseProvider } from '../provider.js';

// --- Types ---

export type NoteType = 'concept' | 'chapter' | 'summary' | 'thought';
export type NoteSource = 'auto' | 'manual' | 'mixed';

export interface NoteIndexRow {
  id: number;
  noteId: string;
  knowledgeItemId: number | null;
  title: string;
  type: NoteType;
  filePath: string;
  chapter: string | null;
  tags: string[];
  source: NoteSource;
  chunkRefs: number[];
  contentPreview: string;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNoteRowInput {
  noteId: string;
  knowledgeItemId: number | null;
  title: string;
  type: NoteType;
  filePath: string;
  chapter: string | null;
  tagsJson: string;
  source: NoteSource;
  chunkRefsJson: string;
  contentPreview: string;
  wordCount: number;
}

export interface UpdateNoteRowInput {
  noteId: string;
  title?: string;
  type?: NoteType;
  chapter?: string | null;
  tagsJson?: string;
  source?: NoteSource;
  chunkRefsJson?: string;
  contentPreview?: string;
  wordCount?: number;
}

export interface ListNotesQueryOptions {
  knowledgeItemId?: number;
  type?: NoteType;
  tag?: string;
  source?: NoteSource;
  limit?: number;
  offset?: number;
}

// --- Raw DB row ---

interface RawNoteRow {
  id: number;
  note_id: string;
  knowledge_item_id: number | null;
  title: string;
  type: string;
  file_path: string;
  chapter: string | null;
  tags_json: string | null;
  source: string;
  chunk_refs_json: string | null;
  content_preview: string | null;
  word_count: number;
  created_at: string;
  updated_at: string;
}

// --- Repository ---

export class NotesRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  create(
    input: CreateNoteRowInput,
    db: Database.Database = this.provider.getConnection(),
  ): number {
    const result = db
      .prepare(
        `INSERT INTO reading_notes
           (note_id, knowledge_item_id, title, type, file_path, chapter,
            tags_json, source, chunk_refs_json, content_preview, word_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.noteId,
        input.knowledgeItemId,
        input.title,
        input.type,
        input.filePath,
        input.chapter,
        input.tagsJson,
        input.source,
        input.chunkRefsJson,
        input.contentPreview,
        input.wordCount,
      );

    return Number(result.lastInsertRowid);
  }

  update(
    input: UpdateNoteRowInput,
    db: Database.Database = this.provider.getConnection(),
  ): void {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (input.title !== undefined) {
      sets.push('title = ?');
      params.push(input.title);
    }
    if (input.type !== undefined) {
      sets.push('type = ?');
      params.push(input.type);
    }
    if (input.chapter !== undefined) {
      sets.push('chapter = ?');
      params.push(input.chapter);
    }
    if (input.tagsJson !== undefined) {
      sets.push('tags_json = ?');
      params.push(input.tagsJson);
    }
    if (input.source !== undefined) {
      sets.push('source = ?');
      params.push(input.source);
    }
    if (input.chunkRefsJson !== undefined) {
      sets.push('chunk_refs_json = ?');
      params.push(input.chunkRefsJson);
    }
    if (input.contentPreview !== undefined) {
      sets.push('content_preview = ?');
      params.push(input.contentPreview);
    }
    if (input.wordCount !== undefined) {
      sets.push('word_count = ?');
      params.push(input.wordCount);
    }

    if (sets.length === 0) return;

    sets.push("updated_at = datetime('now')");
    params.push(input.noteId);

    db.prepare(`UPDATE reading_notes SET ${sets.join(', ')} WHERE note_id = ?`).run(...params);
  }

  delete(
    noteId: string,
    db: Database.Database = this.provider.getConnection(),
  ): void {
    db.prepare('DELETE FROM reading_notes WHERE note_id = ?').run(noteId);
  }

  findByNoteId(
    noteId: string,
    db: Database.Database = this.provider.getConnection(),
  ): NoteIndexRow | undefined {
    const row = db
      .prepare(
        `SELECT id, note_id, knowledge_item_id, title, type, file_path, chapter,
                tags_json, source, chunk_refs_json, content_preview, word_count,
                created_at, updated_at
         FROM reading_notes WHERE note_id = ?`,
      )
      .get(noteId) as RawNoteRow | undefined;

    return row ? this.mapRow(row) : undefined;
  }

  findByFilePath(
    filePath: string,
    db: Database.Database = this.provider.getConnection(),
  ): NoteIndexRow | undefined {
    const row = db
      .prepare(
        `SELECT id, note_id, knowledge_item_id, title, type, file_path, chapter,
                tags_json, source, chunk_refs_json, content_preview, word_count,
                created_at, updated_at
         FROM reading_notes WHERE file_path = ?`,
      )
      .get(filePath) as RawNoteRow | undefined;

    return row ? this.mapRow(row) : undefined;
  }

  listByBook(
    knowledgeItemId: number,
    db: Database.Database = this.provider.getConnection(),
  ): NoteIndexRow[] {
    const rows = db
      .prepare(
        `SELECT id, note_id, knowledge_item_id, title, type, file_path, chapter,
                tags_json, source, chunk_refs_json, content_preview, word_count,
                created_at, updated_at
         FROM reading_notes WHERE knowledge_item_id = ?
         ORDER BY created_at DESC`,
      )
      .all(knowledgeItemId) as RawNoteRow[];

    return rows.map((r) => this.mapRow(r));
  }

  list(
    options: ListNotesQueryOptions,
    db: Database.Database = this.provider.getConnection(),
  ): NoteIndexRow[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.knowledgeItemId !== undefined) {
      conditions.push('knowledge_item_id = ?');
      params.push(options.knowledgeItemId);
    }
    if (options.type) {
      conditions.push('type = ?');
      params.push(options.type);
    }
    if (options.source) {
      conditions.push('source = ?');
      params.push(options.source);
    }
    if (options.tag) {
      conditions.push("tags_json LIKE ?");
      params.push(`%"${options.tag}"%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;

    const rows = db
      .prepare(
        `SELECT id, note_id, knowledge_item_id, title, type, file_path, chapter,
                tags_json, source, chunk_refs_json, content_preview, word_count,
                created_at, updated_at
         FROM reading_notes ${where}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as RawNoteRow[];

    return rows.map((r) => this.mapRow(r));
  }

  count(
    options: Omit<ListNotesQueryOptions, 'limit' | 'offset'>,
    db: Database.Database = this.provider.getConnection(),
  ): number {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.knowledgeItemId !== undefined) {
      conditions.push('knowledge_item_id = ?');
      params.push(options.knowledgeItemId);
    }
    if (options.type) {
      conditions.push('type = ?');
      params.push(options.type);
    }
    if (options.source) {
      conditions.push('source = ?');
      params.push(options.source);
    }
    if (options.tag) {
      conditions.push("tags_json LIKE ?");
      params.push(`%"${options.tag}"%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const row = db
      .prepare(`SELECT COUNT(*) as cnt FROM reading_notes ${where}`)
      .get(...params) as { cnt: number };

    return row.cnt;
  }

  searchByFts(
    query: string,
    limit = 20,
    db: Database.Database = this.provider.getConnection(),
  ): NoteIndexRow[] {
    const rows = db
      .prepare(
        `SELECT rn.id, rn.note_id, rn.knowledge_item_id, rn.title, rn.type,
                rn.file_path, rn.chapter, rn.tags_json, rn.source,
                rn.chunk_refs_json, rn.content_preview, rn.word_count,
                rn.created_at, rn.updated_at
         FROM notes_fts
         JOIN reading_notes rn ON notes_fts.rowid = rn.id
         WHERE notes_fts MATCH ?
         ORDER BY rank
         LIMIT ?`,
      )
      .all(query, limit) as RawNoteRow[];

    return rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: RawNoteRow): NoteIndexRow {
    return {
      id: row.id,
      noteId: row.note_id,
      knowledgeItemId: row.knowledge_item_id,
      title: row.title,
      type: row.type as NoteType,
      filePath: row.file_path,
      chapter: row.chapter,
      tags: row.tags_json ? (JSON.parse(row.tags_json) as string[]) : [],
      source: row.source as NoteSource,
      chunkRefs: row.chunk_refs_json ? (JSON.parse(row.chunk_refs_json) as number[]) : [],
      contentPreview: row.content_preview ?? '',
      wordCount: row.word_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
