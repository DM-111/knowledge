import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { initializeStorage } from '../../storage/index.js';
import { NotesRepository, type NoteIndexRow } from '../../storage/repositories/notes-repository.js';
import type {
  NoteFile,
  NoteFrontmatter,
  NoteType,
  NoteSource,
  CreateNoteInput,
  UpdateNoteInput,
  ListNotesOptions,
  GenerateNoteOptions,
  GenerateNoteBundle,
  WriteGeneratedNoteInput,
} from './types.js';

// --- Utilities ---

/**
 * Generate a unique note ID: "note-YYYYMMDD-XXX"
 */
export function generateNoteId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = randomBytes(3).toString('hex').slice(0, 3);
  return `note-${date}-${rand}`;
}

/**
 * Sanitize a string for use as filename (keep Chinese, remove special chars).
 */
function sanitizeForPath(text: string): string {
  return text
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

/**
 * Build relative file path for a note.
 * Result: "notes/{bookTitle}/{type}-{slug}.md"
 */
export function buildNoteFilePath(bookTitle: string, type: NoteType, slug: string): string {
  const safeBook = sanitizeForPath(bookTitle);
  const safeSlug = sanitizeForPath(slug);
  return join('notes', safeBook, `${type}-${safeSlug}.md`);
}

/**
 * Parse a note markdown file into frontmatter + content.
 */
export function parseNoteFile(absolutePath: string): NoteFile {
  const raw = readFileSync(absolutePath, 'utf-8');
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!fmMatch) {
    throw new Error(`笔记文件格式错误 (缺少 frontmatter): ${absolutePath}`);
  }

  const frontmatter = parseYamlFrontmatter(fmMatch[1]);
  const content = fmMatch[2].trim();

  return { frontmatter, content, filePath: absolutePath };
}

/**
 * Simple YAML frontmatter parser (supports the fields we use).
 */
function parseYamlFrontmatter(yamlStr: string): NoteFrontmatter {
  const lines = yamlStr.split('\n');
  const result: Record<string, unknown> = {};

  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    let value: unknown = rawValue;

    // Remove surrounding quotes
    if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
      value = rawValue.slice(1, -1);
    }
    // Parse arrays: ["a", "b"]
    else if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      try {
        value = JSON.parse(rawValue);
      } catch {
        value = rawValue;
      }
    }
    // Parse numbers
    else if (/^\d+$/.test(rawValue)) {
      value = parseInt(rawValue, 10);
    }

    result[key] = value;
  }

  return {
    id: String(result.id ?? ''),
    title: String(result.title ?? ''),
    book: String(result.book ?? ''),
    book_id: result.book_id != null ? Number(result.book_id) : undefined,
    chapter: result.chapter ? String(result.chapter) : undefined,
    type: (result.type as NoteType) ?? 'thought',
    tags: Array.isArray(result.tags) ? result.tags : [],
    created_at: String(result.created_at ?? new Date().toISOString()),
    updated_at: String(result.updated_at ?? new Date().toISOString()),
    source: (result.source as NoteSource) ?? 'manual',
    chunk_refs: Array.isArray(result.chunk_refs) ? result.chunk_refs : undefined,
  };
}

/**
 * Serialize frontmatter + content to a markdown string.
 */
function serializeNoteFile(frontmatter: NoteFrontmatter, content: string): string {
  const lines: string[] = ['---'];

  lines.push(`id: "${frontmatter.id}"`);
  lines.push(`title: "${frontmatter.title}"`);
  lines.push(`book: "${frontmatter.book}"`);
  if (frontmatter.book_id != null) lines.push(`book_id: ${frontmatter.book_id}`);
  if (frontmatter.chapter) lines.push(`chapter: "${frontmatter.chapter}"`);
  lines.push(`type: "${frontmatter.type}"`);
  lines.push(`tags: ${JSON.stringify(frontmatter.tags)}`);
  lines.push(`created_at: "${frontmatter.created_at}"`);
  lines.push(`updated_at: "${frontmatter.updated_at}"`);
  lines.push(`source: "${frontmatter.source}"`);
  if (frontmatter.chunk_refs && frontmatter.chunk_refs.length > 0) {
    lines.push(`chunk_refs: ${JSON.stringify(frontmatter.chunk_refs)}`);
  }

  lines.push('---');
  lines.push('');
  lines.push(content);

  return lines.join('\n');
}

/**
 * Write a note file to disk.
 */
export function writeNoteFile(absolutePath: string, frontmatter: NoteFrontmatter, content: string): void {
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, serializeNoteFile(frontmatter, content), 'utf-8');
}

/**
 * Build content body with optional blockquotes.
 */
function buildNoteContent(content: string, quotedText?: string[]): string {
  if (!quotedText || quotedText.length === 0) return content;

  const quotes = quotedText
    .map((q) => q.split('\n').map((line) => `> ${line}`).join('\n'))
    .join('\n\n');

  // If content already has a "原文引用" section, don't add another
  if (content.includes('## 原文引用')) return content;

  return `${content}\n\n## 原文引用\n\n${quotes}`;
}

// --- CRUD Operations ---

export interface CreateNoteOptions {
  dbPath: string;
  knowledgeBasePath: string;
  input: CreateNoteInput;
}

export function createNote(options: CreateNoteOptions): NoteIndexRow {
  const { dbPath, knowledgeBasePath, input } = options;
  const provider = initializeStorage({ dbPath });

  try {
    const db = provider.getConnection();

    // Resolve book title
    let bookTitle = input.bookTitle ?? '';
    if (input.bookId && !bookTitle) {
      const item = db
        .prepare('SELECT title FROM knowledge_items WHERE id = ?')
        .get(input.bookId) as { title: string } | undefined;
      if (item) bookTitle = item.title;
    }
    if (!bookTitle) bookTitle = '未分类';

    // Generate ID and file path
    const noteId = generateNoteId();
    const slug = sanitizeForPath(input.title);
    const relativeFilePath = buildNoteFilePath(bookTitle, input.type, slug);
    const absolutePath = join(knowledgeBasePath, relativeFilePath);

    // Build content with quotes
    const fullContent = buildNoteContent(input.content, input.quotedText);

    // Build frontmatter
    const now = new Date().toISOString();
    const frontmatter: NoteFrontmatter = {
      id: noteId,
      title: input.title,
      book: bookTitle,
      book_id: input.bookId,
      chapter: input.chapter,
      type: input.type,
      tags: input.tags ?? [],
      created_at: now,
      updated_at: now,
      source: input.source ?? 'manual',
      chunk_refs: input.chunkRefs,
    };

    // Write file to disk
    writeNoteFile(absolutePath, frontmatter, fullContent);

    // Index in database
    const repo = new NotesRepository(provider);
    const contentPreview = fullContent.slice(0, 200);
    const wordCount = fullContent.length;

    repo.create({
      noteId,
      knowledgeItemId: input.bookId ?? null,
      title: input.title,
      type: input.type,
      filePath: relativeFilePath,
      chapter: input.chapter ?? null,
      tagsJson: JSON.stringify(input.tags ?? []),
      source: input.source ?? 'manual',
      chunkRefsJson: JSON.stringify(input.chunkRefs ?? []),
      contentPreview,
      wordCount,
    }, db);

    return repo.findByNoteId(noteId, db)!;
  } finally {
    provider.close();
  }
}

export interface GetNoteOptions {
  dbPath: string;
  knowledgeBasePath: string;
  noteId: string;
}

export function getNote(options: GetNoteOptions): NoteFile | null {
  const { dbPath, knowledgeBasePath, noteId } = options;
  const provider = initializeStorage({ dbPath });

  try {
    const db = provider.getConnection();
    const repo = new NotesRepository(provider);
    const row = repo.findByNoteId(noteId, db);
    if (!row) return null;

    const absolutePath = join(knowledgeBasePath, row.filePath);
    if (!existsSync(absolutePath)) return null;

    return parseNoteFile(absolutePath);
  } finally {
    provider.close();
  }
}

export interface UpdateNoteOptions {
  dbPath: string;
  knowledgeBasePath: string;
  input: UpdateNoteInput;
}

export function updateNote(options: UpdateNoteOptions): NoteIndexRow {
  const { dbPath, knowledgeBasePath, input } = options;
  const provider = initializeStorage({ dbPath });

  try {
    const db = provider.getConnection();
    const repo = new NotesRepository(provider);
    const existing = repo.findByNoteId(input.noteId, db);

    if (!existing) {
      throw new Error(`笔记不存在: ${input.noteId}`);
    }

    const absolutePath = join(knowledgeBasePath, existing.filePath);

    // Read current file
    let noteFile: NoteFile;
    if (existsSync(absolutePath)) {
      noteFile = parseNoteFile(absolutePath);
    } else {
      throw new Error(`笔记文件不存在: ${absolutePath}`);
    }

    // Merge changes
    const updatedFrontmatter = { ...noteFile.frontmatter };
    if (input.title) updatedFrontmatter.title = input.title;
    if (input.chapter) updatedFrontmatter.chapter = input.chapter;
    if (input.type) updatedFrontmatter.type = input.type;
    if (input.tags) updatedFrontmatter.tags = input.tags;
    updatedFrontmatter.updated_at = new Date().toISOString();

    // Handle content
    let newContent = noteFile.content;
    if (input.content !== undefined) {
      newContent = input.content;
    }
    if (input.appendContent) {
      newContent = `${newContent}\n\n${input.appendContent}`;
    }

    // Detect mixed source
    if (updatedFrontmatter.source === 'auto' && (input.content || input.appendContent)) {
      updatedFrontmatter.source = 'mixed';
    }

    // Write updated file
    writeNoteFile(absolutePath, updatedFrontmatter, newContent);

    // Update DB index
    const contentPreview = newContent.slice(0, 200);
    repo.update({
      noteId: input.noteId,
      title: input.title,
      type: input.type,
      chapter: input.chapter ?? undefined,
      tagsJson: input.tags ? JSON.stringify(input.tags) : undefined,
      source: updatedFrontmatter.source,
      contentPreview,
      wordCount: newContent.length,
    }, db);

    return repo.findByNoteId(input.noteId, db)!;
  } finally {
    provider.close();
  }
}

export interface DeleteNoteOptions {
  dbPath: string;
  knowledgeBasePath: string;
  noteId: string;
}

export function deleteNote(options: DeleteNoteOptions): void {
  const { dbPath, knowledgeBasePath, noteId } = options;
  const provider = initializeStorage({ dbPath });

  try {
    const db = provider.getConnection();
    const repo = new NotesRepository(provider);
    const existing = repo.findByNoteId(noteId, db);

    if (!existing) {
      throw new Error(`笔记不存在: ${noteId}`);
    }

    // Delete file
    const absolutePath = join(knowledgeBasePath, existing.filePath);
    if (existsSync(absolutePath)) {
      unlinkSync(absolutePath);
    }

    // Delete from DB
    repo.delete(noteId, db);
  } finally {
    provider.close();
  }
}

export interface ListNotesManagerOptions {
  dbPath: string;
  options: ListNotesOptions;
}

export function listNotes(managerOpts: ListNotesManagerOptions): { notes: NoteIndexRow[]; total: number } {
  const { dbPath, options } = managerOpts;
  const provider = initializeStorage({ dbPath });

  try {
    const db = provider.getConnection();
    const repo = new NotesRepository(provider);

    // If there's a FTS query, use searchByFts
    if (options.query) {
      const ftsQuery = options.query.endsWith('*') ? options.query : `${options.query}*`;
      const notes = repo.searchByFts(ftsQuery, options.limit ?? 20, db);
      return { notes, total: notes.length };
    }

    // Otherwise use list with filters
    const notes = repo.list({
      knowledgeItemId: options.bookId,
      type: options.type,
      tag: options.tag,
      source: options.source,
      limit: options.limit,
      offset: options.offset,
    }, db);

    const total = repo.count({
      knowledgeItemId: options.bookId,
      type: options.type,
      tag: options.tag,
      source: options.source,
    }, db);

    return { notes, total };
  } finally {
    provider.close();
  }
}

// --- Auto-Generation ---

export function prepareNoteGeneration(options: GenerateNoteOptions): GenerateNoteBundle {
  const { dbPath, itemId, type, chunkIndices, chapter, maxChunks = 30 } = options;
  const provider = initializeStorage({ dbPath });

  try {
    const db = provider.getConnection();

    // Get book info
    const item = db
      .prepare('SELECT id, title FROM knowledge_items WHERE id = ?')
      .get(itemId) as { id: number; title: string } | undefined;

    if (!item) {
      throw new Error(`知识条目 #${itemId} 不存在`);
    }

    // Get chunks (optionally filtered by indices)
    let chunks: Array<{ chunk_index: number; content: string }>;

    if (chunkIndices && chunkIndices.length > 0) {
      const placeholders = chunkIndices.map(() => '?').join(',');
      chunks = db
        .prepare(
          `SELECT chunk_index, content FROM chunks
           WHERE knowledge_item_id = ? AND chunk_index IN (${placeholders})
           ORDER BY chunk_index ASC`,
        )
        .all(itemId, ...chunkIndices) as Array<{ chunk_index: number; content: string }>;
    } else {
      // Get all chunks, then sample representative ones
      const allChunks = db
        .prepare(
          'SELECT chunk_index, content FROM chunks WHERE knowledge_item_id = ? ORDER BY chunk_index ASC',
        )
        .all(itemId) as Array<{ chunk_index: number; content: string }>;

      chunks = selectRepresentativeChunks(allChunks, maxChunks);
    }

    // Get total chunk count
    const countRow = db
      .prepare('SELECT COUNT(*) as cnt FROM chunks WHERE knowledge_item_id = ?')
      .get(itemId) as { cnt: number };

    // Get existing notes for this book (for dedup context)
    const repo = new NotesRepository(provider);
    const existingNotes = repo.listByBook(itemId, db);

    return {
      itemId: item.id,
      bookTitle: item.title,
      type,
      chapter,
      chunks: chunks.map((c) => ({ index: c.chunk_index, content: c.content })),
      totalChunks: countRow.cnt,
      existingNotes: existingNotes.map((n) => ({ title: n.title, type: n.type })),
    };
  } finally {
    provider.close();
  }
}

export function writeGeneratedNote(input: WriteGeneratedNoteInput): NoteIndexRow {
  return createNote({
    dbPath: input.dbPath,
    knowledgeBasePath: input.knowledgeBasePath,
    input: {
      title: input.title,
      bookId: input.itemId,
      chapter: input.chapter,
      type: input.type,
      tags: input.tags,
      source: 'auto',
      chunkRefs: input.chunkRefs,
      content: input.content,
      quotedText: input.quotedText,
    },
  });
}

// --- Helpers ---

function selectRepresentativeChunks(
  chunks: Array<{ chunk_index: number; content: string }>,
  maxCount: number,
): Array<{ chunk_index: number; content: string }> {
  if (chunks.length <= maxCount) return chunks;

  const selected: Array<{ chunk_index: number; content: string }> = [];
  selected.push(chunks[0]);

  const middleCount = maxCount - 2;
  const step = (chunks.length - 2) / (middleCount + 1);

  for (let i = 1; i <= middleCount; i++) {
    const idx = Math.round(i * step);
    if (idx > 0 && idx < chunks.length - 1) {
      selected.push(chunks[idx]);
    }
  }

  selected.push(chunks[chunks.length - 1]);

  const seen = new Set<number>();
  return selected
    .filter((c) => {
      if (seen.has(c.chunk_index)) return false;
      seen.add(c.chunk_index);
      return true;
    })
    .sort((a, b) => a.chunk_index - b.chunk_index);
}
