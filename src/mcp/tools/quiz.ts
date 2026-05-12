import { z } from 'zod';
import { startQuiz, recordAnswer, getQuizSummary, getQuizHistory } from '../../core/learning/quiz-engine.js';
import type { QuizLevel } from '../../core/learning/quiz-engine.js';
import { resolveDbPath } from '../resolve-db.js';

export const quizToolSchema = {
  action: z.enum(['start', 'answer', 'summary', 'history'])
    .describe('start=开始新测验; answer=记录一道题的评估结果; summary=查看当前会话总结; history=查看历史测验'),
  item_id: z.number().optional().describe('知识条目ID（start/history时必填）'),
  level: z.enum(['recall', 'understanding', 'application', 'analysis']).optional()
    .default('recall').describe('问题难度: recall=记忆, understanding=理解, application=应用, analysis=分析'),
  session_id: z.number().optional().describe('测验会话ID（answer/summary时必填）'),
  count: z.number().optional().default(5).describe('问题数量（start时使用，默认5）'),
  // answer action fields
  chunk_id: z.number().optional().describe('该问题对应的chunk ID（answer时）'),
  question: z.string().optional().describe('问题文本（answer时必填）'),
  expected_answer: z.string().optional().describe('标准答案（answer时必填）'),
  user_answer: z.string().optional().describe('用户的回答（answer时必填）'),
  is_correct: z.boolean().optional().describe('是否回答正确（answer时必填）'),
  feedback: z.string().optional().describe('评价反馈（answer时必填）'),
};

export const quizToolName = 'kb_quiz';
export const quizToolDescription =
  '苏格拉底式知识探测器。对知识库内容进行多层次问答测验（记忆→理解→应用→分析）。start返回内容供你出题，answer记录评估结果，summary查看总结。';

const levelLabels: Record<QuizLevel, string> = {
  recall: '记忆',
  understanding: '理解',
  application: '应用',
  analysis: '分析',
};

export async function quizToolHandler(args: {
  action: string;
  item_id?: number;
  level?: string;
  session_id?: number;
  count?: number;
  chunk_id?: number;
  question?: string;
  expected_answer?: string;
  user_answer?: string;
  is_correct?: boolean;
  feedback?: string;
}) {
  const dbPath = resolveDbPath();
  const { action } = args;

  switch (action) {
    case 'start': {
      if (!args.item_id) {
        return { content: [{ type: 'text' as const, text: '错误: start 需要 item_id' }], isError: true };
      }

      const level = (args.level ?? 'recall') as QuizLevel;
      const count = args.count ?? 5;

      try {
        const result = startQuiz({ dbPath, itemId: args.item_id, level, count });

        let text = `## 🧠 测验开始\n\n`;
        text += `**条目**: ${result.itemTitle}\n`;
        text += `**难度**: ${levelLabels[result.level]}\n`;
        text += `**题数**: ${count}\n`;
        text += `**会话**: #${result.sessionId}\n\n`;

        text += `### 参考内容（共 ${result.chunks.length} 段，用于出题）\n\n`;
        for (const chunk of result.chunks) {
          text += `---\n**段 ${chunk.index + 1}** (chunk_id=${chunk.chunkId})\n\n${chunk.content}\n\n`;
        }

        text += `---\n\n### 出题要求\n\n`;
        text += `请根据以上内容生成 **${count}** 道**${levelLabels[level]}**级别的问题：\n\n`;
        text += `- **记忆**: 直接事实 — "什么是X？" "X的步骤是？"\n`;
        text += `- **理解**: 解释概念 — "为什么X有效？" "X和Y的区别？"\n`;
        text += `- **应用**: 场景应用 — "如何用X解决Y？"\n`;
        text += `- **分析**: 综合评价 — "对比X和Y，哪个更适合Z？"\n\n`;
        text += `逐题向用户提问，等待回答后，用 \`kb_quiz action=answer session_id=${result.sessionId}\` 记录评估结果。\n`;
        text += `全部完成后调用 \`kb_quiz action=summary session_id=${result.sessionId}\` 查看总结。\n`;

        return { content: [{ type: 'text' as const, text }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text' as const, text: `错误: ${message}` }], isError: true };
      }
    }

    case 'answer': {
      if (!args.session_id) {
        return { content: [{ type: 'text' as const, text: '错误: answer 需要 session_id' }], isError: true };
      }
      if (!args.question || !args.expected_answer || args.user_answer === undefined || args.is_correct === undefined || !args.feedback) {
        return { content: [{ type: 'text' as const, text: '错误: answer 需要 question, expected_answer, user_answer, is_correct, feedback' }], isError: true };
      }

      try {
        recordAnswer({
          dbPath,
          sessionId: args.session_id,
          chunkId: args.chunk_id,
          question: args.question,
          expectedAnswer: args.expected_answer,
          userAnswer: args.user_answer,
          isCorrect: args.is_correct,
          feedback: args.feedback,
          level: (args.level ?? 'recall') as QuizLevel,
        });

        const emoji = args.is_correct ? '✅' : '❌';
        return { content: [{ type: 'text' as const, text: `${emoji} 答案已记录` }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text' as const, text: `错误: ${message}` }], isError: true };
      }
    }

    case 'summary': {
      if (!args.session_id) {
        return { content: [{ type: 'text' as const, text: '错误: summary 需要 session_id' }], isError: true };
      }

      try {
        const summary = getQuizSummary(dbPath, args.session_id);
        if (!summary) {
          return { content: [{ type: 'text' as const, text: `未找到会话 #${args.session_id}` }], isError: true };
        }

        let text = `## 📊 测验总结\n\n`;
        text += `**条目**: ${summary.itemTitle}\n`;
        text += `**难度**: ${levelLabels[summary.level]}\n`;
        text += `**得分**: ${summary.correctAnswers}/${summary.totalQuestions} (${summary.accuracy}%)\n\n`;

        // Progress bar
        const bar = '█'.repeat(Math.round(summary.accuracy / 10)) + '░'.repeat(10 - Math.round(summary.accuracy / 10));
        text += `[${bar}] ${summary.accuracy}%\n\n`;

        if (summary.answers.length > 0) {
          text += `### 详细结果\n\n`;
          for (let i = 0; i < summary.answers.length; i++) {
            const a = summary.answers[i];
            const emoji = a.isCorrect ? '✅' : '❌';
            text += `${i + 1}. ${emoji} ${a.question}\n`;
            if (!a.isCorrect && a.feedback) {
              text += `   💡 ${a.feedback}\n`;
            }
          }
        }

        // Recommendation
        text += `\n### 建议\n\n`;
        if (summary.accuracy >= 80) {
          text += `🎉 表现优秀！建议尝试更高难度（当前: ${levelLabels[summary.level]}）。\n`;
        } else if (summary.accuracy >= 50) {
          text += `👍 掌握不错，部分知识点需要巩固。建议回顾错误题目涉及的内容。\n`;
        } else {
          text += `📖 建议重新阅读相关内容后再次测试。\n`;
        }

        return { content: [{ type: 'text' as const, text }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text' as const, text: `错误: ${message}` }], isError: true };
      }
    }

    case 'history': {
      if (!args.item_id) {
        return { content: [{ type: 'text' as const, text: '错误: history 需要 item_id' }], isError: true };
      }

      try {
        const history = getQuizHistory(dbPath, args.item_id);

        if (history.length === 0) {
          return { content: [{ type: 'text' as const, text: `条目 #${args.item_id} 还没有测验记录。` }] };
        }

        let text = `## 📝 测验历史\n\n`;
        text += `| 时间 | 难度 | 得分 | 正确率 |\n`;
        text += `|------|------|------|--------|\n`;
        for (const entry of history) {
          text += `| ${entry.startedAt.split('T')[0]} | ${levelLabels[entry.level]} | ${entry.correctAnswers}/${entry.totalQuestions} | ${entry.accuracy}% |\n`;
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
