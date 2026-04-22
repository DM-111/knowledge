import { Command } from 'commander';
import { listKnowledgeItems, type ListKnowledgeItemsResult } from '../../core/index.js';
import { ensureConfigForCommand } from './init.js';
import { addConfigOptions, getConfigOverrides, type ConfigOptionValues } from '../shared-options.js';
import { parsePositiveIntegerOption } from './query-options.js';

export interface ListCommandOptions extends ConfigOptionValues {
  limit?: string;
  tag?: string;
  source?: string;
  after?: string;
  before?: string;
}

export function formatKnowledgeListText(result: ListKnowledgeItemsResult): string {
  if (result.items.length === 0) {
    return '未找到匹配条目\n共 0 条，当前展示 0 条\n';
  }

  const parts: string[] = [];
  result.items.forEach((item, index) => {
    parts.push(`${index + 1}. [${item.id}] ${item.title}`);
    parts.push(`   来源类型: ${item.sourceType}`);
    parts.push(`   标签: ${item.tags.length > 0 ? item.tags.join(', ') : '-'}`);
    parts.push(`   入库时间: ${item.createdAt}`);
  });
  parts.push(`共 ${result.total} 条，当前展示 ${result.items.length} 条`);
  parts.push('');
  return parts.join('\n');
}

export interface RunListCommandDependencies {
  ensureConfig?: typeof ensureConfigForCommand;
  list?: typeof listKnowledgeItems;
  writeOut?: (chunk: string) => void;
}

export async function runListCommand(
  options: ListCommandOptions,
  dependencies: RunListCommandDependencies = {},
): Promise<void> {
  const ensure = dependencies.ensureConfig ?? ensureConfigForCommand;
  const list = dependencies.list ?? listKnowledgeItems;
  const writeOut = dependencies.writeOut ?? ((chunk: string) => process.stdout.write(chunk));

  const config = await ensure({
    commandName: 'list',
    overrides: getConfigOverrides(options),
  });
  const limit = parsePositiveIntegerOption({
    raw: options.limit,
    optionName: '--limit',
    source: 'list',
  });

  const result = list({
    dbPath: config.dbPath,
    limit,
    tag: options.tag,
    source: options.source,
    after: options.after,
    before: options.before,
  });

  writeOut(formatKnowledgeListText(result));
}

export function createListCommand(): Command {
  return addConfigOptions(
    new Command('list')
      .option('--tag <name>', '按单个标签精确过滤')
      .option('--source <type>', '按来源类型过滤，例如 local-markdown')
      .option('--after <date>', '仅返回入库时间不早于该日期/时间的条目（建议 YYYY-MM-DD；完整时间戳须含时区，如 2026-04-01T00:00:00Z）')
      .option('--before <date>', '仅返回入库时间不晚于该日期/时间的条目（建议 YYYY-MM-DD；完整时间戳须含时区，如 2026-04-30T23:59:59Z）')
      .option('--limit <n>', '限制输出条目数，并保留总数提示')
      .description('列出已入库知识条目')
      .action(async (...args: unknown[]) => {
        const command = args[args.length - 1] as Command;
        const options = command.optsWithGlobals<ListCommandOptions>();
        await runListCommand(options);
      }),
  );
}
