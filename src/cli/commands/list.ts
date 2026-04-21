import { Command } from 'commander';
import { SearchError } from '../../errors/index.js';
import { ensureConfigForCommand } from './init.js';
import { addConfigOptions, getConfigOverrides, type ConfigOptionValues } from '../shared-options.js';

export function createListCommand(): Command {
  return addConfigOptions(
    new Command('list')
      .description('条目列表（将在后续 story 中实现）')
      .action(async (...args: unknown[]) => {
        const command = args[args.length - 1] as Command;
        const options = command.optsWithGlobals<ConfigOptionValues>();
        await ensureConfigForCommand({
          commandName: 'list',
          overrides: getConfigOverrides(options),
        });

        throw new SearchError('list 命令将在后续 story 中实现', {
          step: 'command',
          source: 'list',
        });
      }),
  );
}
