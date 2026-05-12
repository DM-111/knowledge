import { Command } from 'commander';
import { initializeStorage, VectorRepository } from '../../storage/index.js';
import { getTokenizer } from '../../core/tokenizer/index.js';
import { getEmbeddingProvider, disposeEmbeddingProvider } from '../../core/embedding/index.js';
import { ensureConfigForCommand } from './init.js';
import { addConfigOptions, getConfigOverrides, type ConfigOptionValues } from '../shared-options.js';

export interface ReindexCommandOptions extends ConfigOptionValues {
  phase?: string;
  batchSize?: string;
}

export function createReindexCommand(): Command {
  const command = new Command('reindex')
    .description('为已有内容重建索引（分词/向量）')
    .option('--phase <phase>', '重建阶段: fts | vectors | all', 'fts')
    .option('--batch-size <n>', 'Embedding 批处理大小', '32')
    .action(async (options: ReindexCommandOptions) => {
      await runReindexCommand(options);
    });

  return addConfigOptions(command);
}

export async function runReindexCommand(
  options: ReindexCommandOptions,
  dependencies: { writeOut?: (chunk: string) => void } = {},
): Promise<void> {
  const writeOut = dependencies.writeOut ?? ((c: string) => process.stdout.write(c));
  const phase = options.phase ?? 'fts';
  const batchSize = parseInt(options.batchSize ?? '32', 10) || 32;

  const config = await ensureConfigForCommand({
    commandName: 'reindex',
    overrides: getConfigOverrides(options),
  });

  if (phase === 'fts' || phase === 'all') {
    await reindexFts(config.dbPath, writeOut);
  }

  if (phase === 'vectors' || phase === 'all') {
    await reindexVectors(config.dbPath, batchSize, writeOut);
  }
}

async function reindexFts(dbPath: string, writeOut: (chunk: string) => void): Promise<void> {
  const tokenizer = await getTokenizer();
  const provider = initializeStorage({ dbPath });

  try {
    const db = provider.getConnection();

    const chunks = db
      .prepare('SELECT id, content FROM chunks')
      .all() as Array<{ id: number; content: string }>;

    writeOut(`正在为 ${chunks.length} 个 chunk 生成分词索引...\n`);

    const updateStmt = db.prepare('UPDATE chunks SET content_segmented = ? WHERE id = ?');

    provider.transaction(() => {
      for (const chunk of chunks) {
        const { segmented } = tokenizer.segment(chunk.content);
        updateStmt.run(segmented, chunk.id);
      }
    });

    // 重建 FTS 索引
    provider.transaction((txDb) => {
      txDb.exec('DELETE FROM chunks_fts');
      txDb.exec(`
        INSERT INTO chunks_fts (rowid, content_segmented, knowledge_item_id, chunk_index)
          SELECT c.id, COALESCE(c.content_segmented, c.content), c.knowledge_item_id, c.chunk_index
          FROM chunks c
      `);
    });

    writeOut(`完成: 已为 ${chunks.length} 个 chunk 重建分词索引\n`);
  } finally {
    provider.close();
  }
}

async function reindexVectors(dbPath: string, batchSize: number, writeOut: (chunk: string) => void): Promise<void> {
  const provider = initializeStorage({ dbPath });

  if (!provider.vectorSearchEnabled) {
    writeOut('sqlite-vec 扩展不可用，无法生成向量索引\n');
    provider.close();
    return;
  }

  try {
    const embeddingProvider = await getEmbeddingProvider();
    const vecRepo = new VectorRepository(provider);
    const db = provider.getConnection();

    let processed = 0;

    while (true) {
      const chunkIds = vecRepo.getUnembeddedChunkIds(batchSize, db);
      if (chunkIds.length === 0) break;

      const placeholders = chunkIds.map(() => '?').join(',');
      const chunks = db
        .prepare(`SELECT id, content FROM chunks WHERE id IN (${placeholders})`)
        .all(...chunkIds) as Array<{ id: number; content: string }>;

      const texts = chunks.map((c) => c.content);
      const embeddings = await embeddingProvider.embed(texts);

      provider.transaction((txDb) => {
        vecRepo.insertMany(
          chunks.map((c, i) => ({ chunkId: c.id, embedding: embeddings[i] })),
          txDb,
        );
        vecRepo.markAsEmbedded(
          chunks.map((c) => c.id),
          1,
          txDb,
        );
      });

      processed += chunks.length;
      writeOut(`\r已生成 ${processed} 个 chunk 的 embedding...`);
    }

    writeOut(`\n完成: 已为 ${processed} 个 chunk 生成向量索引\n`);
    await disposeEmbeddingProvider();
  } catch (error) {
    writeOut(`向量索引生成失败: ${error instanceof Error ? error.message : String(error)}\n`);
  } finally {
    provider.close();
  }
}
