import { resolveIngestionAdapter } from '../../adapters/index.js';
import {
  KnowledgeItemRepository,
  initializeStorage,
  type KnowledgeItemSummary,
} from '../../storage/index.js';

export interface InspectExistingSourceOptions {
  source: string;
  dbPath: string;
}

export async function inspectExistingSource(
  options: InspectExistingSourceOptions,
): Promise<KnowledgeItemSummary | undefined> {
  const adapter = resolveIngestionAdapter(options.source);
  const provider = initializeStorage({ dbPath: options.dbPath });

  try {
    const repository = new KnowledgeItemRepository(provider);
    return repository.findBySource(adapter.sourceType, options.source);
  } finally {
    provider.close();
  }
}
