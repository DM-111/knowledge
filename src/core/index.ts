import { initializeStorage, type DatabaseProvider, type Migration } from '../storage/index.js';
export { ingestSource, type IngestSourceOptions } from './ingestion/index.js';
export {
  inspectExistingSource,
  type InspectExistingSourceOptions,
} from './ingestion/inspect-existing-source.js';

export interface EnsureStorageReadyOptions {
  dbPath: string;
  migrations?: readonly Migration[];
  migrationsDir?: string;
}

export function ensureStorageReady(options: EnsureStorageReadyOptions): DatabaseProvider {
  return initializeStorage(options);
}
