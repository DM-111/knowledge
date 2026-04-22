import { Command } from 'commander';
import { searchByKeyword } from '../../core/index.js';
import { SearchError } from '../../errors/index.js';
import { formatSearchResult, resolveOutputMode } from '../formatters/index.js';
import { ensureConfigForCommand } from './init.js';
import { addConfigOptions, getConfigOverrides, type ConfigOptionValues } from '../shared-options.js';
import { parsePositiveIntegerOption } from './query-options.js';

export interface SearchCommandOptions extends ConfigOptionValues {
  limit: string;
  json?: boolean;
  tag?: string;
  source?: string;
  after?: string;
  before?: string;
}

export interface RunSearchCommandDependencies {
  ensureConfig?: typeof ensureConfigForCommand;
  search?: typeof searchByKeyword;
  stdoutIsTTY?: boolean;
  writeOut?: (chunk: string) => void;
}

export async function runSearchCommand(
  query: string | undefined,
  options: SearchCommandOptions,
  dependencies: RunSearchCommandDependencies = {},
): Promise<void> {
  if (query === undefined || query.trim() === '') {
    throw new SearchError('请提供检索关键词，例如: kb search "TypeScript 泛型"', {
      step: 'command',
      source: 'search',
    });
  }

  const ensure = dependencies.ensureConfig ?? ensureConfigForCommand;
  const search = dependencies.search ?? searchByKeyword;
  const writeOut = dependencies.writeOut ?? ((c: string) => process.stdout.write(c));
  const mode = resolveOutputMode({
    json: options.json,
    stdoutIsTTY: dependencies.stdoutIsTTY ?? process.stdout.isTTY === true,
  });

  const config = await ensure({
    commandName: 'search',
    overrides: getConfigOverrides(options),
  });

  const limit = parsePositiveIntegerOption({
    raw: options.limit,
    optionName: '--limit',
    source: 'search',
    fallback: 20,
  }) ?? 20;
  const result = search({
    query,
    limit,
    dbPath: config.dbPath,
    tag: options.tag,
    source: options.source,
    after: options.after,
    before: options.before,
  });

  writeOut(
    formatSearchResult(result, {
      mode,
      query,
    }),
  );
}

export function createSearchCommand(): Command {
  return addConfigOptions(
    new Command('search')
      .argument('[query]', '检索关键词')
      .option('--limit <n>', '最大返回条数（在相关度排序下截取前 n 条）', '20')
      .option('--json', '输出结构化 JSON，适合脚本与管道消费')
      .option('--tag <name>', '按单个标签精确过滤')
      .option('--source <type>', '按来源类型过滤，例如 local-markdown')
      .option('--after <date>', '仅返回入库时间不早于该日期/时间的结果（建议 YYYY-MM-DD；完整时间戳须含时区，如 2026-04-01T00:00:00Z）')
      .option('--before <date>', '仅返回入库时间不晚于该日期/时间的结果（建议 YYYY-MM-DD；完整时间戳须含时区，如 2026-04-30T23:59:59Z）')
      .description('在知识库中全文检索已入库内容')
      .action(async (...args: unknown[]) => {
        const query = args[0] as string | undefined;
        const command = args[args.length - 1] as Command;
        const options = command.optsWithGlobals<SearchCommandOptions>();
        await runSearchCommand(query, options);
      }),
  );
}
