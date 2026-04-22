import { SearchError } from '../../errors/index.js';
import type { SearchFilterOptions } from './types.js';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface NormalizedSearchFilters {
  tag?: string;
  source?: string;
  createdAfter?: string;
  createdBefore?: string;
}

export function normalizeSearchFilters(filters: SearchFilterOptions, errorSource: string): NormalizedSearchFilters {
  const normalized: NormalizedSearchFilters = {
    tag: normalizeOptionalText(filters.tag),
    source: normalizeOptionalText(filters.source),
    createdAfter: normalizeDateBoundary(filters.after, 'after', errorSource),
    createdBefore: normalizeDateBoundary(filters.before, 'before', errorSource),
  };

  if (
    normalized.createdAfter !== undefined &&
    normalized.createdBefore !== undefined &&
    normalized.createdAfter > normalized.createdBefore
  ) {
    throw new SearchError('--after 不能晚于 --before', {
      step: 'search',
      source: errorSource,
    });
  }

  return normalized;
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeDateBoundary(
  value: string | undefined,
  boundary: 'after' | 'before',
  errorSource: string,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  if (DATE_ONLY_PATTERN.test(trimmed)) {
    const normalized = boundary === 'after' ? `${trimmed}T00:00:00.000Z` : `${trimmed}T23:59:59.999Z`;
    if (!isValidIsoTimestamp(normalized)) {
      throw new SearchError(`${boundary === 'after' ? '--after' : '--before'} 日期非法（收到：${trimmed}）`, {
        step: 'search',
        source: errorSource,
      });
    }
    return normalized;
  }

  const timestamp = Date.parse(trimmed);
  if (Number.isNaN(timestamp)) {
    throw new SearchError(`${boundary === 'after' ? '--after' : '--before'} 日期非法（收到：${trimmed}）`, {
      step: 'search',
      source: errorSource,
    });
  }

  return new Date(timestamp).toISOString();
}

function isValidIsoTimestamp(value: string): boolean {
  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value;
}
