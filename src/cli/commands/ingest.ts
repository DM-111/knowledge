import { Command } from 'commander';
import type { IngestResult } from '../../core/types.js';
import { ingestSource, type IngestSourceOptions } from '../../core/index.js';
import { IngestionError } from '../../errors/index.js';
import { ensureConfigForCommand } from './init.js';
import { addConfigOptions, getConfigOverrides, type ConfigOptionValues } from '../shared-options.js';
import { createIngestProgressRenderer, type IngestProgressRenderer, type OutputWriter } from '../formatters/ingest-progress.js';

export interface IngestCommandOptions extends ConfigOptionValues {
  tag?: string;
  note?: string;
}

export interface IngestCommandIo {
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
  writer: OutputWriter;
}

interface RunIngestCommandDependencies {
  ensureConfig?: typeof ensureConfigForCommand;
  ingest?: (options: IngestSourceOptions) => Promise<IngestResult>;
  io?: Partial<IngestCommandIo>;
  createProgressRenderer?: (writer: OutputWriter) => IngestProgressRenderer;
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
        await runIngestCommand(source, options);
      }),
  );
}

export async function runIngestCommand(
  source: unknown,
  options: IngestCommandOptions,
  dependencies: RunIngestCommandDependencies = {},
): Promise<void> {
  if (typeof source !== 'string' || source.trim().length === 0) {
    throw new IngestionError('ingest 命令需要提供待入库的本地 Markdown 路径', {
      step: 'command',
      source: 'ingest',
    });
  }

  const io = resolveIo(dependencies.io);
  const isInteractive = io.stdinIsTTY && io.stdoutIsTTY;
  const ensureConfig = dependencies.ensureConfig ?? ensureConfigForCommand;
  const ingest = dependencies.ingest ?? ingestSource;
  const config = await ensureConfig({
    commandName: 'ingest',
    overrides: getConfigOverrides(options),
    isInteractive,
  });
  const progressRenderer = isInteractive
    ? (dependencies.createProgressRenderer ?? createIngestProgressRenderer)(io.writer)
    : undefined;

  try {
    const result = await ingest({
      source,
      dbPath: config.dbPath,
      tags: parseTagOption(options.tag),
      note: normalizeNoteOption(options.note),
      onProgress: progressRenderer ? (event) => progressRenderer.render(event) : undefined,
    });

    progressRenderer?.finish();
    io.writer.write(formatIngestSummary(result));
  } catch (error) {
    progressRenderer?.finish();
    throw error;
  }
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

function resolveIo(overrides?: Partial<IngestCommandIo>): IngestCommandIo {
  return {
    stdinIsTTY: overrides?.stdinIsTTY ?? Boolean(process.stdin.isTTY),
    stdoutIsTTY: overrides?.stdoutIsTTY ?? Boolean(process.stdout.isTTY),
    writer: overrides?.writer ?? process.stdout,
  };
}

function formatIngestSummary(result: IngestResult): string {
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

  return `${lines.join('\n')}\n`;
}
