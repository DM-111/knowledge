import { createDatabaseProvider, type DatabaseProvider } from './provider.js';
import { runMigrations, type Migration } from './migrator.js';

export type { DatabaseProvider } from './provider.js';
export { createDatabaseProvider } from './provider.js';
export type { Migration } from './migrator.js';
export { discoverMigrations, getDefaultMigrationsDirectory, runMigrations } from './migrator.js';
export {
  ChunkRepository,
  type CreateChunkInput,
} from './repositories/chunk-repository.js';
export {
  KnowledgeItemRepository,
  type CreateKnowledgeItemInput,
  type KnowledgeItemSummary,
} from './repositories/knowledge-item-repository.js';
export { TagRepository } from './repositories/tag-repository.js';

export interface InitializeStorageOptions {
  dbPath: string;
  migrations?: readonly Migration[];
  migrationsDir?: string;
}

export function initializeStorage(options: InitializeStorageOptions): DatabaseProvider {
  const provider = createDatabaseProvider(options.dbPath);

  try {
    runMigrations(provider, {
      migrations: options.migrations,
      migrationsDir: options.migrationsDir,
    });

    return provider;
  } catch (error) {
    provider.close();
    throw error;
  }
}
