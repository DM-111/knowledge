import { CommanderError } from 'commander';
import type { ListKnowledgeItemsResult, SearchResult } from '../../core/index.js';
import { KbError, formatKbError } from '../../errors/index.js';
import { formatKnowledgeListJson, formatSearchResultJson, formatCliErrorJson } from './json-formatter.js';
import { formatKnowledgeListPlain, formatSearchResultPlain } from './plain-formatter.js';
import { formatKnowledgeListTty, formatSearchResultTty } from './tty-formatter.js';

export type OutputMode = 'tty' | 'plain' | 'json';

export interface ResolveOutputModeOptions {
  json?: boolean;
  stdoutIsTTY?: boolean;
}

export interface RenderCliErrorOptions {
  json?: boolean;
}

export interface RenderCliErrorResult {
  text: string;
  exitCode: number;
  shouldWrite: boolean;
}

export function resolveOutputMode(options: ResolveOutputModeOptions = {}): OutputMode {
  if (options.json) {
    return 'json';
  }

  return options.stdoutIsTTY ? 'tty' : 'plain';
}

export function formatSearchResult(
  result: SearchResult,
  options: {
    mode: OutputMode;
    query: string;
  },
): string {
  switch (options.mode) {
    case 'json':
      return formatSearchResultJson(result);
    case 'tty':
      return formatSearchResultTty(result, { query: options.query });
    case 'plain':
    default:
      return formatSearchResultPlain(result);
  }
}

export function formatKnowledgeList(
  result: ListKnowledgeItemsResult,
  options: {
    mode: OutputMode;
  },
): string {
  switch (options.mode) {
    case 'json':
      return formatKnowledgeListJson(result);
    case 'tty':
      return formatKnowledgeListTty(result);
    case 'plain':
    default:
      return formatKnowledgeListPlain(result);
  }
}

export function renderCliError(error: unknown, options: RenderCliErrorOptions = {}): RenderCliErrorResult {
  if (error instanceof CommanderError) {
    if (error.code === 'commander.helpDisplayed' || error.exitCode === 0) {
      return {
        text: '',
        exitCode: 0,
        shouldWrite: false,
      };
    }

    const exitCode = error.code === 'commander.unknownCommand' ? 2 : (error.exitCode ?? 1);
    if (options.json) {
      return {
        text: formatCliErrorJson({
          name: 'CommanderError',
          message: error.message,
          step: 'command',
        }),
        exitCode,
        shouldWrite: true,
      };
    }

    return {
      text: `${error.message}\n`,
      exitCode,
      shouldWrite: true,
    };
  }

  if (error instanceof KbError) {
    return {
      text: options.json ? formatCliErrorJson(error) : `${formatKbError(error)}\n`,
      exitCode: error.exitCode ?? 1,
      shouldWrite: true,
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    text: options.json
      ? formatCliErrorJson({
          name: 'InternalError',
          message,
        })
      : `InternalError: ${message}\n`,
    exitCode: 1,
    shouldWrite: true,
  };
}
