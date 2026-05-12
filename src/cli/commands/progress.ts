import { Command } from 'commander';
import { getProgress, updateProgress, addBookmark, getReadingReport } from '../../core/learning/progress-tracker.js';
import { ensureConfigForCommand } from './init.js';
import { addConfigOptions, getConfigOverrides, type ConfigOptionValues } from '../shared-options.js';

export function createProgressCommand(): Command {
  const cmd = new Command('progress')
    .description('阅读进度追踪')
    .argument('[item-id]', '知识条目 ID');

  addConfigOptions(cmd);

  cmd
    .option('--set <chunk-index>', '更新阅读位置到指定 chunk 索引')
    .option('--complete', '标记为已读完')
    .option('--bookmark', '在当前位置添加书签')
    .option('--label <text>', '书签标签')
    .option('--note <text>', '书签备注')
    .option('--reading', '仅显示正在阅读的条目')
    .option('--json', '输出 JSON')
    .action(async (itemIdArg: string | undefined, options: ProgressCommandOptions) => {
      const config = await ensureConfigForCommand({
        commandName: 'progress',
        overrides: getConfigOverrides(options),
      });

      const itemId = itemIdArg ? parseInt(itemIdArg, 10) : undefined;

      // No item ID → show reading report
      if (!itemId) {
        const report = getReadingReport(config.dbPath);
        if (options.json) {
          process.stdout.write(JSON.stringify(report, null, 2) + '\n');
        } else {
          printReadingReport(report);
        }
        return;
      }

      // --set: update progress
      if (options.set) {
        const chunkIndex = parseInt(options.set, 10);
        const result = updateProgress({
          dbPath: config.dbPath,
          itemId,
          chunkIndex,
          status: options.complete ? 'completed' : undefined,
        });
        if (options.json) {
          process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        } else {
          process.stdout.write(`✅ 进度已更新: ${result.itemTitle} — ${result.percentage}% (段 ${result.currentChunkIndex}/${result.totalChunks})\n`);
        }
        return;
      }

      // --complete: mark as completed
      if (options.complete) {
        const progress = getProgress({ dbPath: config.dbPath, itemId });
        const chunkIndex = progress?.totalChunks ?? 0;
        const result = updateProgress({
          dbPath: config.dbPath,
          itemId,
          chunkIndex,
          status: 'completed',
        });
        if (options.json) {
          process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        } else {
          process.stdout.write(`✅ 已标记完成: ${result.itemTitle}\n`);
        }
        return;
      }

      // --bookmark: add bookmark
      if (options.bookmark) {
        const progress = getProgress({ dbPath: config.dbPath, itemId });
        const chunkIndex = progress?.currentChunkIndex ?? 0;
        const { bookmarkId } = addBookmark({
          dbPath: config.dbPath,
          itemId,
          chunkIndex,
          label: options.label,
          note: options.note,
        });
        process.stdout.write(`📌 书签已添加 (#${bookmarkId}): 段 ${chunkIndex}${options.label ? ` — ${options.label}` : ''}\n`);
        return;
      }

      // Default: show progress for item
      const progress = getProgress({ dbPath: config.dbPath, itemId });
      if (!progress) {
        process.stderr.write(`未找到条目 #${itemId}\n`);
        process.exitCode = 1;
        return;
      }

      if (options.json) {
        process.stdout.write(JSON.stringify(progress, null, 2) + '\n');
      } else {
        printItemProgress(progress);
      }
    });

  return cmd;
}

interface ProgressCommandOptions extends ConfigOptionValues {
  set?: string;
  complete?: boolean;
  bookmark?: boolean;
  label?: string;
  note?: string;
  reading?: boolean;
  json?: boolean;
}

function printItemProgress(p: {
  itemTitle: string;
  percentage: number;
  currentChunkIndex: number;
  totalChunks: number;
  status: string;
  startedAt?: string;
  lastReadAt?: string;
  completedAt?: string;
  bookmarks: Array<{ chunkIndex: number; label: string | null; note: string | null }>;
}): void {
  const bar = renderBar(p.percentage);
  process.stdout.write(`${p.itemTitle}\n`);
  process.stdout.write(`  ${bar} ${p.percentage}% (段 ${p.currentChunkIndex}/${p.totalChunks})\n`);
  process.stdout.write(`  状态: ${p.status}\n`);
  if (p.startedAt) process.stdout.write(`  开始: ${p.startedAt.split('T')[0]}\n`);
  if (p.lastReadAt) process.stdout.write(`  上次: ${p.lastReadAt.split('T')[0]}\n`);
  if (p.completedAt) process.stdout.write(`  完成: ${p.completedAt.split('T')[0]}\n`);
  if (p.bookmarks.length > 0) {
    process.stdout.write(`  书签:\n`);
    for (const bm of p.bookmarks) {
      process.stdout.write(`    📌 段 ${bm.chunkIndex}${bm.label ? ` — ${bm.label}` : ''}${bm.note ? ` (${bm.note})` : ''}\n`);
    }
  }
}

function printReadingReport(report: { inProgress: Array<{ itemTitle: string; percentage: number }>; completed: Array<{ itemTitle: string; completedAt?: string }>; totalItemsRead: number; totalWordsRead: number }): void {
  process.stdout.write(`📊 阅读报告\n`);
  process.stdout.write(`已读完: ${report.totalItemsRead} 篇 | 总字数: ${report.totalWordsRead.toLocaleString()}\n\n`);

  if (report.inProgress.length > 0) {
    process.stdout.write(`📚 正在阅读:\n`);
    for (const item of report.inProgress) {
      process.stdout.write(`  ${renderBar(item.percentage)} ${item.percentage}% — ${item.itemTitle}\n`);
    }
    process.stdout.write('\n');
  }

  if (report.completed.length > 0) {
    process.stdout.write(`✅ 近期完成:\n`);
    for (const item of report.completed) {
      process.stdout.write(`  ${item.itemTitle} (${item.completedAt?.split('T')[0] ?? ''})\n`);
    }
  }

  if (report.inProgress.length === 0 && report.completed.length === 0) {
    process.stdout.write('还没有阅读记录。\n');
  }
}

function renderBar(percentage: number): string {
  const filled = Math.round(percentage / 10);
  const empty = 10 - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}
