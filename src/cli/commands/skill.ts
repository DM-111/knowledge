import { Command } from 'commander';
import { prepareSkillContent } from '../../core/learning/skill-generator.js';
import { ensureConfigForCommand } from './init.js';
import { addConfigOptions, getConfigOverrides, type ConfigOptionValues } from '../shared-options.js';

export function createSkillCommand(): Command {
  const cmd = new Command('book-extract')
    .description('从知识库条目提取核心知识，生成 Claude Code Skill')
    .argument('<item-id>', '知识条目 ID');

  addConfigOptions(cmd);

  cmd
    .option('--max-chunks <n>', '最多使用的段落数', '20')
    .option('--json', '输出 JSON')
    .action(async (itemIdArg: string, options: SkillCommandOptions) => {
      const config = await ensureConfigForCommand({
        commandName: 'book-extract',
        overrides: getConfigOverrides(options),
      });

      const itemId = parseInt(itemIdArg, 10);
      if (isNaN(itemId)) {
        process.stderr.write('错误: item-id 必须是数字\n');
        process.exitCode = 1;
        return;
      }

      const maxChunks = parseInt(options.maxChunks ?? '20', 10);

      try {
        const bundle = prepareSkillContent({
          dbPath: config.dbPath,
          itemId,
          maxChunks,
        });

        if (options.json) {
          process.stdout.write(JSON.stringify(bundle, null, 2) + '\n');
        } else {
          process.stdout.write(`📚 ${bundle.title}\n`);
          process.stdout.write(`   类型: ${bundle.sourceType} | 字数: ${bundle.wordCount} | 段落: ${bundle.totalChunks}\n`);
          if (bundle.tags.length > 0) process.stdout.write(`   标签: ${bundle.tags.join(', ')}\n`);
          if (bundle.metadata?.author) process.stdout.write(`   作者: ${bundle.metadata.author}\n`);
          process.stdout.write(`\n   已选取 ${bundle.chunks.length} 段代表性内容，请在 Claude Code 对话中使用:\n`);
          process.stdout.write(`   /book-extract ${itemId}\n`);
          process.stdout.write(`\n   或直接调用 MCP tool:\n`);
          process.stdout.write(`   kb_skill_generate mode=prepare item_id=${itemId}\n`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`错误: ${message}\n`);
        process.exitCode = 1;
      }
    });

  return cmd;
}

interface SkillCommandOptions extends ConfigOptionValues {
  maxChunks?: string;
  json?: boolean;
}
