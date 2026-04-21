import { Command } from 'commander';
import { SearchError } from '../../errors/index.js';
import { ensureConfigForCommand } from './init.js';
import { addConfigOptions, getConfigOverrides, type ConfigOptionValues } from '../shared-options.js';

export function createSearchCommand(): Command {
  return addConfigOptions(
    new Command('search')
      .argument('[query]', '检索关键词')
      .description('知识检索（将在后续 story 中实现）')
      .action(async (...args: unknown[]) => {
        const command = args[args.length - 1] as Command;
        const options = command.optsWithGlobals<ConfigOptionValues>();
        await ensureConfigForCommand({
          commandName: 'search',
          overrides: getConfigOverrides(options),
        });

        throw new SearchError('search 命令将在后续 story 中实现', {
          step: 'command',
          source: 'search',
        });
      }),
  );
}
