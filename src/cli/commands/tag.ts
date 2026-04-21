import { Command } from 'commander';
import { ConfigError } from '../../errors/index.js';
import { ensureConfigForCommand } from './init.js';
import { addConfigOptions, getConfigOverrides, type ConfigOptionValues } from '../shared-options.js';

export function createTagCommand(): Command {
  return addConfigOptions(
    new Command('tag')
      .argument('[id]', '条目 ID')
      .argument('[tags...]', '标签列表')
      .description('标签管理（将在后续 story 中实现）')
      .action(async (...args: unknown[]) => {
        const command = args[args.length - 1] as Command;
        const options = command.optsWithGlobals<ConfigOptionValues>();
        await ensureConfigForCommand({
          commandName: 'tag',
          overrides: getConfigOverrides(options),
        });

        throw new ConfigError('tag 命令将在后续 story 中实现', {
          step: 'command',
          source: 'tag',
        });
      }),
  );
}
