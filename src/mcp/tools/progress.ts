import { z } from 'zod';
import { getProgress, updateProgress, addBookmark, getReadingReport } from '../../core/learning/progress-tracker.js';
import { resolveDbPath } from '../resolve-db.js';

export const progressToolSchema = {
  action: z.enum(['get', 'update', 'bookmark', 'report'])
    .describe('get=查看某条目的阅读进度; update=更新阅读位置; bookmark=添加书签; report=总体阅读报告'),
  item_id: z.number().optional().describe('知识条目ID（get/update/bookmark时必填）'),
  chunk_index: z.number().optional().describe('当前阅读到的chunk索引（update/bookmark时使用）'),
  status: z.enum(['reading', 'completed']).optional().describe('阅读状态（update时可选）'),
  label: z.string().optional().describe('书签标签（bookmark时可选）'),
  note: z.string().optional().describe('书签备注（bookmark时可选）'),
};

export const progressToolName = 'kb_progress';
export const progressToolDescription =
  '阅读进度追踪。记录阅读位置、管理书签、查看阅读报告。支持断点续读——下次阅读时自动定位到上次位置。';

export async function progressToolHandler(args: {
  action: string;
  item_id?: number;
  chunk_index?: number;
  status?: string;
  label?: string;
  note?: string;
}) {
  const dbPath = resolveDbPath();
  const { action, item_id, chunk_index, status, label, note } = args;

  switch (action) {
    case 'get': {
      if (!item_id) {
        return { content: [{ type: 'text' as const, text: '错误: get 操作需要 item_id' }], isError: true };
      }
      const progress = getProgress({ dbPath, itemId: item_id });
      if (!progress) {
        return { content: [{ type: 'text' as const, text: `未找到条目 #${item_id}` }], isError: true };
      }

      const statusEmoji = { not_started: '📖', reading: '📚', completed: '✅' }[progress.status] ?? '❓';
      const progressBar = renderProgressBar(progress.percentage);

      let text = `## ${statusEmoji} ${progress.itemTitle}\n\n`;
      text += `**进度**: ${progressBar} ${progress.percentage}%\n`;
      text += `**位置**: 第 ${progress.currentChunkIndex} / ${progress.totalChunks} 段\n`;
      text += `**状态**: ${progress.status}\n`;
      if (progress.startedAt) text += `**开始**: ${progress.startedAt}\n`;
      if (progress.lastReadAt) text += `**上次阅读**: ${progress.lastReadAt}\n`;
      if (progress.completedAt) text += `**完成**: ${progress.completedAt}\n`;

      if (progress.bookmarks.length > 0) {
        text += `\n### 书签 (${progress.bookmarks.length})\n`;
        for (const bm of progress.bookmarks) {
          text += `- 📌 段 ${bm.chunkIndex}`;
          if (bm.label) text += ` — ${bm.label}`;
          if (bm.note) text += ` (${bm.note})`;
          text += '\n';
        }
      }

      return { content: [{ type: 'text' as const, text }] };
    }

    case 'update': {
      if (!item_id) {
        return { content: [{ type: 'text' as const, text: '错误: update 操作需要 item_id' }], isError: true };
      }
      if (chunk_index === undefined) {
        return { content: [{ type: 'text' as const, text: '错误: update 操作需要 chunk_index' }], isError: true };
      }

      const result = updateProgress({
        dbPath,
        itemId: item_id,
        chunkIndex: chunk_index,
        status: status as 'reading' | 'completed' | undefined,
      });

      const progressBar = renderProgressBar(result.percentage);
      const text = `✅ 进度已更新: ${result.itemTitle}\n${progressBar} ${result.percentage}% (段 ${result.currentChunkIndex}/${result.totalChunks})`;
      return { content: [{ type: 'text' as const, text }] };
    }

    case 'bookmark': {
      if (!item_id) {
        return { content: [{ type: 'text' as const, text: '错误: bookmark 操作需要 item_id' }], isError: true };
      }
      if (chunk_index === undefined) {
        return { content: [{ type: 'text' as const, text: '错误: bookmark 操作需要 chunk_index' }], isError: true };
      }

      const { bookmarkId } = addBookmark({
        dbPath,
        itemId: item_id,
        chunkIndex: chunk_index,
        label,
        note,
      });

      const text = `📌 书签已添加 (#${bookmarkId}): 条目 ${item_id} 的第 ${chunk_index} 段${label ? ` — ${label}` : ''}`;
      return { content: [{ type: 'text' as const, text }] };
    }

    case 'report': {
      const report = getReadingReport(dbPath);

      let text = '## 📊 阅读报告\n\n';
      text += `**已读完**: ${report.totalItemsRead} 篇\n`;
      text += `**总字数**: ${report.totalWordsRead.toLocaleString()} 字\n\n`;

      if (report.inProgress.length > 0) {
        text += '### 📚 正在阅读\n';
        for (const item of report.inProgress) {
          const bar = renderProgressBar(item.percentage);
          text += `- ${item.itemTitle}: ${bar} ${item.percentage}%\n`;
        }
        text += '\n';
      }

      if (report.completed.length > 0) {
        text += '### ✅ 近期完成\n';
        for (const item of report.completed) {
          text += `- ${item.itemTitle} (${item.completedAt?.split('T')[0] ?? ''})\n`;
        }
      }

      if (report.inProgress.length === 0 && report.completed.length === 0) {
        text += '还没有阅读记录。使用 `kb_progress action=update` 开始追踪阅读进度。\n';
      }

      return { content: [{ type: 'text' as const, text }] };
    }

    default:
      return { content: [{ type: 'text' as const, text: `未知操作: ${action}` }], isError: true };
  }
}

function renderProgressBar(percentage: number): string {
  const filled = Math.round(percentage / 10);
  const empty = 10 - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}
