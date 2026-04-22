import { SearchError } from '../../errors/index.js';

export interface ParsePositiveIntegerOptionOptions {
  raw: string | undefined;
  optionName: string;
  source: string;
  fallback?: number;
}

export function parsePositiveIntegerOption(options: ParsePositiveIntegerOptionOptions): number | undefined {
  const { raw, optionName, source, fallback } = options;

  if (raw === undefined || raw === '') {
    return fallback;
  }

  if (!/^\d+$/.test(raw)) {
    throw new SearchError(`${optionName} 须为正整数（收到：${raw}）`, {
      step: 'command',
      source,
    });
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new SearchError(`${optionName} 须为正整数（收到：${raw}）`, {
      step: 'command',
      source,
    });
  }

  return parsed;
}
