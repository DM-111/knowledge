import { Command } from 'commander';
import { getMasteryDashboard } from '../../core/learning/exercise-engine.js';
import { ensureConfigForCommand } from './init.js';
import { addConfigOptions, getConfigOverrides, type ConfigOptionValues } from '../shared-options.js';

export function createExerciseCommand(): Command {
  const cmd = new Command('exercise')
    .description('查看掌握度面板');

  addConfigOptions(cmd);

  cmd
    .option('--json', '输出 JSON')
    .action(async (options: ExerciseCommandOptions) => {
      const config = await ensureConfigForCommand({
        commandName: 'exercise',
        overrides: getConfigOverrides(options),
      });

      try {
        const dashboard = getMasteryDashboard(config.dbPath);

        if (options.json) {
          process.stdout.write(JSON.stringify(dashboard, null, 2) + '\n');
        } else {
          process.stdout.write(`🎯 掌握度面板\n`);
          process.stdout.write(`综合掌握度: ${Math.round(dashboard.overallScore * 100)}%\n\n`);

          if (dashboard.items.length > 0) {
            process.stdout.write(`按条目:\n`);
            for (const item of dashboard.items) {
              const bar = '█'.repeat(Math.round(item.score * 10)) + '░'.repeat(10 - Math.round(item.score * 10));
              process.stdout.write(`  [${bar}] ${Math.round(item.score * 100)}% — ${item.title} (${item.totalAttempts}次)\n`);
            }
          }

          if (dashboard.tags.length > 0) {
            process.stdout.write(`\n按标签:\n`);
            for (const tag of dashboard.tags) {
              process.stdout.write(`  ${Math.round(tag.score * 100)}% — #${tag.tagName} (${tag.totalAttempts}次)\n`);
            }
          }

          if (dashboard.items.length === 0 && dashboard.tags.length === 0) {
            process.stdout.write(`还没有掌握度记录。完成练习或测验后自动追踪。\n`);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`错误: ${message}\n`);
        process.exitCode = 1;
      }
    });

  return cmd;
}

interface ExerciseCommandOptions extends ConfigOptionValues {
  json?: boolean;
}
