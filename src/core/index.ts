import { initializeStorage, type DatabaseProvider, type Migration } from '../storage/index.js';
export { ingestSource, type IngestSourceOptions } from './ingestion/index.js';
export {
  inspectExistingSource,
  type InspectExistingSourceOptions,
} from './ingestion/inspect-existing-source.js';
export {
  searchByKeyword,
  listKnowledgeItems,
  type SearchByKeywordOptions,
  type SearchHit,
  type SearchResult,
  type ListKnowledgeItemsOptions,
  type KnowledgeListItem,
  type ListKnowledgeItemsResult,
  buildFtsMatchQuery,
  buildSimpleFtsMatchQuery,
} from './search/index.js';

export interface EnsureStorageReadyOptions {
  dbPath: string;
  migrations?: readonly Migration[];
  migrationsDir?: string;
}

export function ensureStorageReady(options: EnsureStorageReadyOptions): DatabaseProvider {
  return initializeStorage(options);
}
