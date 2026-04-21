import type { ProgressEvent, RawContent, SourceType } from '../types.js';

export interface IngestOptions {
  onProgress?: (event: ProgressEvent) => void;
  signal?: AbortSignal;
}

export interface IngestionAdapter {
  readonly sourceType: SourceType;
  canHandle(source: string): boolean;
  ingest(source: string, options?: IngestOptions): Promise<RawContent>;
}
