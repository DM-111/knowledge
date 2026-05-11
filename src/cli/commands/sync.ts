import { Command } from 'commander';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify as yamlStringify } from 'yaml';
import {
  initializeStorage,
  KnowledgeItemRepository,
  TagRepository,
} from '../../storage/index.js';
import { ensureConfigForCommand } from './init.js';
import { addConfigOptions, getConfigOverrides, type ConfigOptionValues } from '../shared-options.js';

export interface SyncCommandOptions extends ConfigOptionValues {
  vault: string;
  force?: boolean;
  since?: string;
}

interface SyncState {
  lastSyncedAt: string;
  syncedItemIds: number[];
}

interface SyncableItem {
  id: number;
  title: string;
  sourceType: string;
  sourcePath: string;
  content: string;
  createdAt: string;
  note: string | null;
  metadataJson: string | null;
  tags: string[];
}

const SOURCE_TYPE_FOLDERS: Record<string, string> = {
  web: 'Articles',
  epub: 'Books',
  pdf: 'Papers',
  'local-markdown': 'Notes',
};

export function createSyncCommand(): Command {
  return addConfigOptions(
    new Command('sync')
      .requiredOption('--vault <path>', 'Obsidian vault 目录路径')
      .option('--force', '强制全量同步，忽略增量状态')
      .option('--since <date>', '仅同步该日期之后入库的条目（ISO 格式）')
      .description('将知识库同步到 Obsidian vault')
      .action(async (...args: unknown[]) => {
        const command = args[args.length - 1] as Command;
        const options = command.optsWithGlobals<SyncCommandOptions>();
        await runSyncCommand(options);
      }),
  );
}

export async function runSyncCommand(
  options: SyncCommandOptions,
  dependencies: { ensureConfig?: typeof ensureConfigForCommand; writeOut?: (chunk: string) => void } = {},
): Promise<void> {
  const ensureConfig = dependencies.ensureConfig ?? ensureConfigForCommand;
  const writeOut = dependencies.writeOut ?? ((chunk: string) => process.stdout.write(chunk));

  const config = await ensureConfig({
    commandName: 'sync',
    overrides: getConfigOverrides(options),
  });

  const vaultPath = options.vault;
  const provider = initializeStorage({ dbPath: config.dbPath });

  try {
    const knowledgeItemRepo = new KnowledgeItemRepository(provider);
    const tagRepo = new TagRepository(provider);
    const db = provider.getConnection();

    // Load sync state
    const syncState = options.force ? null : await loadSyncState(vaultPath);
    const sinceDate = options.since || syncState?.lastSyncedAt;

    // Query all items (with optional since filter)
    const items = queryAllItems(db, sinceDate);

    if (items.length === 0) {
      writeOut('没有需要同步的条目。\n');
      return;
    }

    // Get tags for all items
    const itemIds = items.map((item) => item.id);
    const tagsByItemId = tagRepo.listTagsByKnowledgeItemIds(itemIds);

    // Ensure vault directories exist
    const folders = new Set(Object.values(SOURCE_TYPE_FOLDERS));
    for (const folder of folders) {
      await mkdir(join(vaultPath, folder), { recursive: true });
    }
    await mkdir(join(vaultPath, '_kb'), { recursive: true });

    // Sync each item
    let syncedCount = 0;
    for (const item of items) {
      const tags = tagsByItemId.get(item.id) ?? [];
      const syncableItem: SyncableItem = { ...item, tags };
      const filePath = resolveVaultFilePath(syncableItem, vaultPath);
      const fileContent = buildMarkdownFile(syncableItem);

      await mkdir(join(filePath, '..'), { recursive: true });
      await writeFile(filePath, fileContent, 'utf8');
      syncedCount++;
    }

    // Save sync state
    await saveSyncState(vaultPath, {
      lastSyncedAt: new Date().toISOString(),
      syncedItemIds: itemIds,
    });

    writeOut(`已同步 ${syncedCount} 个条目到 ${vaultPath}\n`);
  } finally {
    provider.close();
  }
}

function queryAllItems(
  db: import('better-sqlite3').Database,
  sinceDate?: string | null,
): Array<Omit<SyncableItem, 'tags'>> {
  const whereClause = sinceDate ? 'WHERE created_at >= ?' : '';
  const params = sinceDate ? [sinceDate] : [];

  const rows = db
    .prepare(
      `SELECT id, title, source_type, source_path, content, created_at, note, metadata_json
       FROM knowledge_items
       ${whereClause}
       ORDER BY created_at ASC`,
    )
    .all(...params) as Array<{
    id: number;
    title: string;
    source_type: string;
    source_path: string;
    content: string;
    created_at: string;
    note: string | null;
    metadata_json: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    sourceType: row.source_type,
    sourcePath: row.source_path,
    content: row.content,
    createdAt: row.created_at,
    note: row.note,
    metadataJson: row.metadata_json,
  }));
}

function resolveVaultFilePath(item: SyncableItem, vaultPath: string): string {
  const folder = SOURCE_TYPE_FOLDERS[item.sourceType] || 'Notes';
  const slug = slugify(item.title);
  return join(vaultPath, folder, `${slug}.md`);
}

function buildMarkdownFile(item: SyncableItem): string {
  const frontmatter: Record<string, unknown> = {
    title: item.title,
    kb_id: item.id,
    source_type: item.sourceType,
    source: item.sourcePath,
    ingested_at: item.createdAt,
  };

  // Parse and merge metadata
  if (item.metadataJson) {
    try {
      const metadata = JSON.parse(item.metadataJson);
      if (metadata.author) frontmatter.author = metadata.author;
      if (metadata.publishedDate) frontmatter.published = metadata.publishedDate;
      if (metadata.domain) frontmatter.domain = metadata.domain;
      if (metadata.language) frontmatter.language = metadata.language;
    } catch {
      // Ignore invalid JSON
    }
  }

  if (item.tags.length > 0) {
    frontmatter.tags = item.tags;
  }

  if (item.note) {
    frontmatter.note = item.note;
  }

  const yamlContent = yamlStringify(frontmatter, { lineWidth: 0 });
  return `---\n${yamlContent}---\n\n${item.content}\n`;
}

function slugify(title: string): string {
  return title
    // Replace special characters that aren't valid in filenames
    .replace(/[/\\:*?"<>|]/g, '')
    // Replace whitespace with hyphens
    .replace(/\s+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, '')
    // Limit length
    .slice(0, 100)
    // Ensure non-empty
    || 'untitled';
}

async function loadSyncState(vaultPath: string): Promise<SyncState | null> {
  try {
    const statePath = join(vaultPath, '_kb', 'sync-state.json');
    const content = await readFile(statePath, 'utf8');
    return JSON.parse(content) as SyncState;
  } catch {
    return null;
  }
}

async function saveSyncState(vaultPath: string, state: SyncState): Promise<void> {
  const statePath = join(vaultPath, '_kb', 'sync-state.json');
  await mkdir(join(vaultPath, '_kb'), { recursive: true });
  await writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
}
