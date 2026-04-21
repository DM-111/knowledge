export type SourceType = 'local-markdown' | 'web';

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
}

export interface KnowledgeItem {
  id: number;
  title: string;
  sourceType: SourceType;
  sourcePath: string;
  content: string;
  wordCount: number;
  createdAt: string;
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
}
