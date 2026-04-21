import { Command } from 'commander';
import { ingestSource } from '../../core/index.js';
import { IngestionError } from '../../errors/index.js';
import { ensureConfigForCommand } from './init.js';
import { addConfigOptions, getConfigOverrides, type ConfigOptionValues } from '../shared-options.js';

export function createIngestCommand(): Command {
  return addConfigOptions(
    new Command('ingest')
      .argument('[source]', '待入库来源')
      .description('将本地 Markdown 内容入库到知识库')
      .action(async (...args: unknown[]) => {
        const source = args[0];
        const command = args[args.length - 1] as Command;
        const options = command.optsWithGlobals<ConfigOptionValues>();
        const config = await ensureConfigForCommand({
          commandName: 'ingest',
          overrides: getConfigOverrides(options),
        });

        if (typeof source !== 'string' || source.trim().length === 0) {
          throw new IngestionError('ingest 命令需要提供待入库的本地 Markdown 路径', {
            step: 'command',
            source: 'ingest',
          });
        }

        const result = await ingestSource({
          source,
          dbPath: config.dbPath,
        });

        process.stdout.write(
          [
            `标题: ${result.title}`,
            `来源: ${result.sourcePath}`,
            `字数: ${result.wordCount}`,
            `切分块数: ${result.chunkCount}`,
          ].join('\n') + '\n',
        );
      }),
  );
}
