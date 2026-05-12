export type NoteType = 'concept' | 'chapter' | 'summary' | 'thought';
export type NoteSource = 'auto' | 'manual' | 'mixed';

/**
 * YAML frontmatter for a note .md file.
 */
export interface NoteFrontmatter {
  id: string;
  title: string;
  book: string;
  book_id?: number;
  chapter?: string;
  type: NoteType;
  tags: string[];
  created_at: string;
  updated_at: string;
  source: NoteSource;
  chunk_refs?: number[];
}

/**
 * Parsed note file (frontmatter + body).
 */
export interface NoteFile {
  frontmatter: NoteFrontmatter;
  content: string;
  filePath: string;
}

/**
 * Input for creating a new reading note.
 */
export interface CreateNoteInput {
  title: string;
  bookId?: number;
  bookTitle?: string;
  chapter?: string;
  type: NoteType;
  tags?: string[];
  source?: NoteSource;
  chunkRefs?: number[];
  content: string;
  quotedText?: string[];
}

/**
 * Input for updating an existing reading note.
 */
export interface UpdateNoteInput {
  noteId: string;
  title?: string;
  chapter?: string;
  type?: NoteType;
  tags?: string[];
  content?: string;
  appendContent?: string;
}

/**
 * Options for listing notes.
 */
export interface ListNotesOptions {
  bookId?: number;
  type?: NoteType;
  tag?: string;
  source?: NoteSource;
  query?: string;
  limit?: number;
  offset?: number;
}

/**
 * Options for generating notes from book content.
 */
export interface GenerateNoteOptions {
  dbPath: string;
  itemId: number;
  type: NoteType;
  chunkIndices?: number[];
  chapter?: string;
  maxChunks?: number;
}

/**
 * Bundle returned by prepareNoteGeneration for LLM to analyze.
 */
export interface GenerateNoteBundle {
  itemId: number;
  bookTitle: string;
  type: NoteType;
  chapter?: string;
  chunks: Array<{ index: number; content: string }>;
  totalChunks: number;
  existingNotes: Array<{ title: string; type: NoteType }>;
}

/**
 * Input for writing an auto-generated note.
 */
export interface WriteGeneratedNoteInput {
  dbPath: string;
  knowledgeBasePath: string;
  itemId: number;
  title: string;
  type: NoteType;
  chapter?: string;
  tags: string[];
  content: string;
  chunkRefs: number[];
  quotedText: string[];
}
