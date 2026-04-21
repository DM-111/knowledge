import { Command } from 'commander';
import { ingestSource } from '../../core/index.js';
import { IngestionError } from '../../errors/index.js';
import { ensureConfigForCommand } from './init.js';
import { addConfigOptions, getConfigOverrides, type ConfigOptionValues } from '../shared-options.js';

interface IngestCommandOptions extends ConfigOptionValues {
  tag?: string;
  note?: string;
}

export function createIngestCommand(): Command {
  return addConfigOptions(
    new Command('ingest')
      .argument('[source]', '待入库来源')
      .option('--tag <tags>', '用逗号分隔的标签列表')
      .option('--note <note>', '入库备注')
      .description('将本地 Markdown 内容入库到知识库')
      .action(async (...args: unknown[]) => {
        const source = args[0];
        const command = args[args.length - 1] as Command;
        const options = command.optsWithGlobals<IngestCommandOptions>();
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
          tags: parseTagOption(options.tag),
          note: normalizeNoteOption(options.note),
        });

        const lines = [
          `标题: ${result.title}`,
          `来源: ${result.sourcePath}`,
          `字数: ${result.wordCount}`,
          `切分块数: ${result.chunkCount}`,
        ];

        if (result.tags.length > 0) {
          lines.push(`标签: ${result.tags.join(', ')}`);
        }

        if (result.note) {
          lines.push(`备注: ${result.note}`);
        }

        process.stdout.write(lines.join('\n') + '\n');
      }),
  );
}

export function parseTagOption(rawTags?: string): string[] {
  if (!rawTags) {
    return [];
  }

  return [...new Set(rawTags.split(',').map((tag) => tag.trim()).filter((tag) => tag.length > 0))];
}

export function normalizeNoteOption(rawNote?: string): string | undefined {
  const trimmedNote = rawNote?.trim();
  return trimmedNote ? trimmedNote : undefined;
}
