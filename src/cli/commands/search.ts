import { Command } from 'commander';
import { searchByKeyword } from '../../core/index.js';
import { SearchError } from '../../errors/index.js';
import { ensureConfigForCommand } from './init.js';
import { addConfigOptions, getConfigOverrides, type ConfigOptionValues } from '../shared-options.js';

export interface SearchCommandOptions extends ConfigOptionValues {
  limit: string;
}

function parseLimit(raw: string | undefined): number {
  const fallback = 20;
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1) {
    throw new SearchError(`--limit 须为正整数（收到：${raw}）`, {
      step: 'command',
      source: 'search',
    });
  }
  return n;
}

export function formatSearchHitsText(
  lines: { title: string; sourcePath: string; hitSnippet: string; createdAt: string }[],
): string {
  if (lines.length === 0) {
    return '未找到匹配结果\n';
  }

  const parts: string[] = [];
  lines.forEach((row, i) => {
    parts.push(`${i + 1}. ${row.title}`);
    parts.push(`   来源: ${row.sourcePath}`);
    parts.push(`   摘要: ${row.hitSnippet}`);
    parts.push(`   入库时间: ${row.createdAt}`);
  });
  parts.push('');
  return parts.join('\n');
}

export interface RunSearchCommandDependencies {
  ensureConfig?: typeof ensureConfigForCommand;
  search?: typeof searchByKeyword;
  writeOut?: (chunk: string) => void;
}

export async function runSearchCommand(
  query: string | undefined,
  options: SearchCommandOptions,
  dependencies: RunSearchCommandDependencies = {},
): Promise<void> {
  const ensure = dependencies.ensureConfig ?? ensureConfigForCommand;
  const search = dependencies.search ?? searchByKeyword;
  const writeOut = dependencies.writeOut ?? ((c: string) => process.stdout.write(c));

  const config = await ensure({
    commandName: 'search',
    overrides: getConfigOverrides(options),
  });

  if (query === undefined || query.trim() === '') {
    throw new SearchError('请提供检索关键词，例如: kb search "TypeScript 泛型"', {
      step: 'command',
      source: 'search',
    });
  }

  const limit = parseLimit(options.limit);
  const hits = search({
    query,
    limit,
    dbPath: config.dbPath,
  });

  writeOut(formatSearchHitsText(hits));
}

export function createSearchCommand(): Command {
  return addConfigOptions(
    new Command('search')
      .argument('[query]', '检索关键词')
      .option('--limit <n>', '最大返回条数（在相关度排序下截取前 n 条）', '20')
      .description('在知识库中全文检索已入库内容')
      .action(async (...args: unknown[]) => {
        const query = args[0] as string | undefined;
        const command = args[args.length - 1] as Command;
        const options = command.optsWithGlobals<SearchCommandOptions>();
        await runSearchCommand(query, options);
      }),
  );
}
