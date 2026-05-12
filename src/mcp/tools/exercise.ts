import { z } from 'zod';
import { prepareExerciseContent, updateMastery, getMasteryDashboard } from '../../core/learning/exercise-engine.js';
import type { ExerciseType } from '../../core/learning/exercise-engine.js';
import { resolveDbPath } from '../resolve-db.js';

export const exerciseToolSchema = {
  action: z.enum(['generate', 'submit', 'mastery'])
    .describe('generate=生成练习内容; submit=提交评分并更新掌握度; mastery=查看掌握度面板'),
  item_id: z.number().optional().describe('知识条目ID（generate/submit时）'),
  tag: z.string().optional().describe('按标签生成跨条目练习（generate时可选）'),
  exercise_type: z.enum(['fill_blank', 'code_challenge', 'scenario_analysis', 'mixed']).optional()
    .default('mixed').describe('练习类型: fill_blank=填空, code_challenge=代码挑战, scenario_analysis=场景分析, mixed=混合'),
  count: z.number().optional().default(3).describe('练习题数（generate时）'),
  score: z.number().optional().describe('本次练习得分 0.0-1.0（submit时必填）'),
  tag_name: z.string().optional().describe('标签名称（submit时按标签更新掌握度）'),
};

export const exerciseToolName = 'kb_exercise';
export const exerciseToolDescription =
  '自动化验证流。生成结构化练习（填空、代码挑战、场景分析），评分后自动更新掌握度。掌握度使用指数移动平均（EMA）追踪学习进展。';

const typeLabels: Record<ExerciseType | 'mixed', string> = {
  fill_blank: '填空',
  code_challenge: '代码挑战',
  scenario_analysis: '场景分析',
  mixed: '混合',
};

export async function exerciseToolHandler(args: {
  action: string;
  item_id?: number;
  tag?: string;
  exercise_type?: string;
  count?: number;
  score?: number;
  tag_name?: string;
}) {
  const dbPath = resolveDbPath();
  const { action } = args;

  switch (action) {
    case 'generate': {
      if (!args.item_id && !args.tag) {
        return { content: [{ type: 'text' as const, text: '错误: generate 需要 item_id 或 tag' }], isError: true };
      }

      const exerciseType = (args.exercise_type ?? 'mixed') as ExerciseType | 'mixed';
      const count = args.count ?? 3;

      try {
        const bundle = prepareExerciseContent({
          dbPath,
          itemId: args.item_id,
          tag: args.tag,
          type: exerciseType,
          count,
        });

        let text = `## 📝 练习生成\n\n`;
        text += `**来源**: ${bundle.itemTitle ?? `标签: ${bundle.tag}`}\n`;
        text += `**类型**: ${typeLabels[bundle.exerciseType]}\n`;
        text += `**题数**: ${count}\n`;
        if (bundle.previousMastery !== undefined) {
          text += `**当前掌握度**: ${Math.round(bundle.previousMastery * 100)}%\n`;
        }

        text += `\n### 参考内容\n\n`;
        for (const chunk of bundle.chunks) {
          text += `---\n**${chunk.itemTitle}** — 段 ${chunk.index + 1} (chunk_id=${chunk.chunkId})\n\n${chunk.content}\n\n`;
        }

        text += `---\n\n### 练习生成要求\n\n`;
        text += `请根据以上内容生成 **${count}** 道练习题：\n\n`;

        if (exerciseType === 'fill_blank' || exerciseType === 'mixed') {
          text += `- **填空题**: "_____ 是指..." 或 "X 的三个关键步骤是 ___、___、___"\n`;
        }
        if (exerciseType === 'code_challenge' || exerciseType === 'mixed') {
          text += `- **代码挑战**: "写一个函数/配置来实现..." 或 "修复以下代码中的问题"\n`;
        }
        if (exerciseType === 'scenario_analysis' || exerciseType === 'mixed') {
          text += `- **场景分析**: "给定以下情境，你会如何应用..." 或 "分析以下案例"\n`;
        }

        text += `\n逐题向用户提出，评分后调用 \`kb_exercise action=submit\` 更新掌握度。\n`;
        text += `评分标准: 0.0(完全错误) 0.5(部分正确) 1.0(完全正确)\n`;

        return { content: [{ type: 'text' as const, text }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text' as const, text: `错误: ${message}` }], isError: true };
      }
    }

    case 'submit': {
      if (args.score === undefined) {
        return { content: [{ type: 'text' as const, text: '错误: submit 需要 score (0.0-1.0)' }], isError: true };
      }
      if (!args.item_id && !args.tag_name) {
        return { content: [{ type: 'text' as const, text: '错误: submit 需要 item_id 或 tag_name' }], isError: true };
      }

      try {
        const { newScore } = updateMastery({
          dbPath,
          itemId: args.item_id,
          tagName: args.tag_name,
          score: args.score,
        });

        const bar = '█'.repeat(Math.round(newScore * 10)) + '░'.repeat(10 - Math.round(newScore * 10));
        const text = `✅ 掌握度已更新\n\n` +
          `本次得分: ${Math.round(args.score * 100)}%\n` +
          `当前掌握度: [${bar}] ${Math.round(newScore * 100)}%\n`;

        return { content: [{ type: 'text' as const, text }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text' as const, text: `错误: ${message}` }], isError: true };
      }
    }

    case 'mastery': {
      try {
        const dashboard = getMasteryDashboard(dbPath);

        let text = `## 🎯 掌握度面板\n\n`;
        text += `**综合掌握度**: ${Math.round(dashboard.overallScore * 100)}%\n\n`;

        if (dashboard.items.length > 0) {
          text += `### 按条目\n\n`;
          text += `| 条目 | 掌握度 | 练习次数 | 最近评估 |\n`;
          text += `|------|--------|----------|----------|\n`;
          for (const item of dashboard.items) {
            const bar = '█'.repeat(Math.round(item.score * 5)) + '░'.repeat(5 - Math.round(item.score * 5));
            text += `| ${item.title} | ${bar} ${Math.round(item.score * 100)}% | ${item.totalAttempts} | ${item.lastAssessedAt.split('T')[0]} |\n`;
          }
          text += '\n';
        }

        if (dashboard.tags.length > 0) {
          text += `### 按标签\n\n`;
          text += `| 标签 | 掌握度 | 练习次数 |\n`;
          text += `|------|--------|----------|\n`;
          for (const tag of dashboard.tags) {
            text += `| ${tag.tagName} | ${Math.round(tag.score * 100)}% | ${tag.totalAttempts} |\n`;
          }
        }

        if (dashboard.items.length === 0 && dashboard.tags.length === 0) {
          text += `还没有掌握度记录。完成练习或测验后自动追踪。\n`;
        }

        return { content: [{ type: 'text' as const, text }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text' as const, text: `错误: ${message}` }], isError: true };
      }
    }

    default:
      return { content: [{ type: 'text' as const, text: `未知操作: ${action}` }], isError: true };
  }
}
