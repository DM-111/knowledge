import { select } from '@inquirer/prompts';
import { Command } from 'commander';
import type { IngestResult } from '../../core/types.js';
import {
  ingestSource,
  inspectExistingSource,
  type IngestSourceOptions,
} from '../../core/index.js';
import { IngestionError } from '../../errors/index.js';
import type { KnowledgeItemSummary } from '../../storage/index.js';
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

export interface IngestPromptAdapter {
  selectDuplicateAction(options: { source: string; existingItem: KnowledgeItemSummary }): Promise<'replace' | 'skip'>;
}

interface SignalTarget {
  once(event: 'SIGINT', listener: () => void): unknown;
  off?(event: 'SIGINT', listener: () => void): unknown;
  removeListener?(event: 'SIGINT', listener: () => void): unknown;
}

interface RunIngestCommandDependencies {
  ensureConfig?: typeof ensureConfigForCommand;
  ingest?: (options: IngestSourceOptions) => Promise<IngestResult>;
  inspectDuplicate?: typeof inspectExistingSource;
  io?: Partial<IngestCommandIo>;
  prompts?: IngestPromptAdapter;
  signalTarget?: SignalTarget;
  createProgressRenderer?: (writer: OutputWriter) => IngestProgressRenderer;
}

const DEFAULT_PROMPTS: IngestPromptAdapter = {
  async selectDuplicateAction({ source, existingItem }) {
    return select({
      message: [
        `来源已存在：${source}`,
        `已有条目：${existingItem.title}`,
        '请选择后续操作',
      ].join('\n'),
      choices: [
        {
          name: '覆盖更新',
          value: 'replace',
        },
        {
          name: '跳过',
          value: 'skip',
        },
      ],
      default: 'skip',
    });
  },
};

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
  const inspectDuplicate = dependencies.inspectDuplicate ?? inspectExistingSource;
  const prompts = dependencies.prompts ?? DEFAULT_PROMPTS;
  const signalTarget = dependencies.signalTarget ?? process;
  const config = await ensureConfig({
    commandName: 'ingest',
    overrides: getConfigOverrides(options),
    isInteractive,
  });
  const progressRenderer = isInteractive
    ? (dependencies.createProgressRenderer ?? createIngestProgressRenderer)(io.writer)
    : undefined;
  const controller = new AbortController();
  const handleSigint = () => {
    controller.abort(new Error('SIGINT'));
  };
  signalTarget.once('SIGINT', handleSigint);

  try {
    const existingItem = await inspectDuplicate({
      source,
      dbPath: config.dbPath,
    });
    let duplicateStrategy: IngestSourceOptions['duplicateStrategy'] = isInteractive ? 'error' : 'skip';

    if (existingItem) {
      throwIfInterrupted(controller, source);
      io.writer.write(formatDuplicateSummary(existingItem));

      if (!isInteractive) {
        throwIfInterrupted(controller, source);
        io.writer.write('非交互环境默认跳过重复入库。\n');
        return;
      }

      throwIfInterrupted(controller, source);
      const duplicateAction = await prompts.selectDuplicateAction({
        source,
        existingItem,
      });

      if (duplicateAction === 'skip') {
        throwIfInterrupted(controller, source);
        io.writer.write('已跳过重复入库。\n');
        return;
      }

      duplicateStrategy = 'replace';
    }

    const result = await ingest({
      source,
      dbPath: config.dbPath,
      tags: parseTagOption(options.tag),
      note: normalizeNoteOption(options.note),
      duplicateStrategy,
      signal: controller.signal,
      onProgress: progressRenderer ? (event) => progressRenderer.render(event) : undefined,
    });

    if (controller.signal.aborted) {
      throw createInterruptedError(source);
    }

    progressRenderer?.finish();
    io.writer.write(formatIngestSummary(result));
  } catch (error) {
    progressRenderer?.finish();
    if (isDuplicateSkippedError(error)) {
      io.writer.write('检测到并发重复来源，已跳过入库。\n');
      return;
    }
    if (controller.signal.aborted && !isInterruptError(error)) {
      throw createInterruptedError(source, error);
    }
    throw error;
  } finally {
    if (typeof signalTarget.off === 'function') {
      signalTarget.off('SIGINT', handleSigint);
    } else {
      signalTarget.removeListener?.('SIGINT', handleSigint);
    }
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

function formatDuplicateSummary(existingItem: KnowledgeItemSummary): string {
  const lines = [
    '检测到来源已入库：',
    `标题: ${existingItem.title}`,
    `来源: ${existingItem.sourcePath}`,
    `创建时间: ${existingItem.createdAt}`,
  ];

  if (existingItem.note) {
    lines.push(`备注: ${existingItem.note}`);
  }

  return `${lines.join('\n')}\n`;
}

function createInterruptedError(source: string, cause?: unknown): IngestionError {
  return new IngestionError('入库已取消', {
    step: 'interrupt',
    source,
    cause,
  });
}

function isInterruptError(error: unknown): error is IngestionError {
  return error instanceof IngestionError && error.message === '入库已取消';
}

function isDuplicateSkippedError(error: unknown): error is IngestionError {
  return error instanceof IngestionError && error.message === '检测到重复来源，已按策略跳过入库';
}

function throwIfInterrupted(controller: AbortController, source: string): void {
  if (!controller.signal.aborted) {
    return;
  }

  throw createInterruptedError(source, controller.signal.reason);
}
