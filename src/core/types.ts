export type SourceType = 'local-markdown' | 'web' | 'epub' | 'pdf';

export interface ContentMetadata {
  // Universal
  author?: string;
  publishedDate?: string;
  language?: string;
  description?: string;
  // Web-specific
  domain?: string;
  url?: string;
  siteName?: string;
  // Book-specific
  isbn?: string;
  publisher?: string;
  chapters?: number;
  // PDF-specific
  pageCount?: number;
}

export interface ProgressEvent {
  step: string;
  status: 'start' | 'progress' | 'complete' | 'error';
  detail?: string;
  metadata?: Record<string, unknown>;
}

export interface RawContent {
  title: string;
  sourceType: SourceType;
  sourcePath: string;
  markdown: string;
  createdAt: string;
  metadata?: ContentMetadata;
}

export interface KnowledgeItem {
  id: number;
  title: string;
  sourceType: SourceType;
  sourcePath: string;
  content: string;
  wordCount: number;
  createdAt: string;
  note?: string;
}

export interface ChunkDraft {
  heading?: string;
  content: string;
  overlap?: string;
  startOffset: number;
  endOffset: number;
  overlapStartOffset: number;
  overlapEndOffset: number;
}

export interface Chunk {
  id: number;
  knowledgeItemId: number;
  chunkIndex: number;
  content: string;
  startOffset: number;
  endOffset: number;
  overlapStartOffset: number;
  overlapEndOffset: number;
}

export interface IngestResult {
  title: string;
  sourcePath: string;
  wordCount: number;
  chunkCount: number;
  knowledgeItemId: number;
  tags: string[];
  note?: string;
  metadata?: ContentMetadata;
}
