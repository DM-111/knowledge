import { Command } from 'commander';
import { startQuiz, getQuizHistory } from '../../core/learning/quiz-engine.js';
import type { QuizLevel } from '../../core/learning/quiz-engine.js';
import { ensureConfigForCommand } from './init.js';
import { addConfigOptions, getConfigOverrides, type ConfigOptionValues } from '../shared-options.js';

export function createQuizCommand(): Command {
  const cmd = new Command('quiz')
    .description('苏格拉底式知识测验')
    .argument('<item-id>', '知识条目 ID');

  addConfigOptions(cmd);

  cmd
    .option('--level <level>', '难度: recall, understanding, application, analysis', 'recall')
    .option('--count <n>', '问题数量', '5')
    .option('--history', '查看历史测验记录')
    .option('--json', '输出 JSON')
    .action(async (itemIdArg: string, options: QuizCommandOptions) => {
      const config = await ensureConfigForCommand({
        commandName: 'quiz',
        overrides: getConfigOverrides(options),
      });

      const itemId = parseInt(itemIdArg, 10);
      if (isNaN(itemId)) {
        process.stderr.write('错误: item-id 必须是数字\n');
        process.exitCode = 1;
        return;
      }

      if (options.history) {
        const history = getQuizHistory(config.dbPath, itemId);
        if (options.json) {
          process.stdout.write(JSON.stringify(history, null, 2) + '\n');
        } else if (history.length === 0) {
          process.stdout.write(`条目 #${itemId} 还没有测验记录。\n`);
        } else {
          process.stdout.write(`测验历史 (条目 #${itemId}):\n`);
          for (const entry of history) {
            process.stdout.write(`  ${entry.startedAt.split('T')[0]} | ${entry.level} | ${entry.correctAnswers}/${entry.totalQuestions} (${entry.accuracy}%)\n`);
          }
        }
        return;
      }

      const level = (options.level ?? 'recall') as QuizLevel;
      const count = parseInt(options.count ?? '5', 10);

      try {
        const result = startQuiz({ dbPath: config.dbPath, itemId, level, count });
        if (options.json) {
          process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        } else {
          process.stdout.write(`🧠 测验已启动\n`);
          process.stdout.write(`  条目: ${result.itemTitle}\n`);
          process.stdout.write(`  难度: ${level} | 题数: ${count}\n`);
          process.stdout.write(`  会话: #${result.sessionId}\n\n`);
          process.stdout.write(`  请在 Claude Code 对话中使用 /quiz 进行交互式测验。\n`);
          process.stdout.write(`  或调用: kb_quiz action=start item_id=${itemId} level=${level}\n`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`错误: ${message}\n`);
        process.exitCode = 1;
      }
    });

  return cmd;
}

interface QuizCommandOptions extends ConfigOptionValues {
  level?: string;
  count?: string;
  history?: boolean;
  json?: boolean;
}
