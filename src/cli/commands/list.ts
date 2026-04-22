import { Command } from 'commander';
import { listKnowledgeItems } from '../../core/index.js';
import { formatKnowledgeList, resolveOutputMode } from '../formatters/index.js';
import { ensureConfigForCommand } from './init.js';
import { addConfigOptions, getConfigOverrides, type ConfigOptionValues } from '../shared-options.js';
import { parsePositiveIntegerOption } from './query-options.js';

export interface ListCommandOptions extends ConfigOptionValues {
  limit?: string;
  json?: boolean;
  tag?: string;
  source?: string;
  after?: string;
  before?: string;
}

export interface RunListCommandDependencies {
  ensureConfig?: typeof ensureConfigForCommand;
  list?: typeof listKnowledgeItems;
  stdoutIsTTY?: boolean;
  writeOut?: (chunk: string) => void;
}

export async function runListCommand(
  options: ListCommandOptions,
  dependencies: RunListCommandDependencies = {},
): Promise<void> {
  const ensure = dependencies.ensureConfig ?? ensureConfigForCommand;
  const list = dependencies.list ?? listKnowledgeItems;
  const writeOut = dependencies.writeOut ?? ((chunk: string) => process.stdout.write(chunk));
  const mode = resolveOutputMode({
    json: options.json,
    stdoutIsTTY: dependencies.stdoutIsTTY ?? process.stdout.isTTY === true,
  });

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

  writeOut(
    formatKnowledgeList(result, {
      mode,
    }),
  );
}

export function createListCommand(): Command {
  return addConfigOptions(
    new Command('list')
      .option('--json', '输出结构化 JSON，适合脚本与管道消费')
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
