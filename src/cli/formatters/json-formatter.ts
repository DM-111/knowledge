import type { KbError } from '../../errors/index.js';
import type { ListKnowledgeItemsResult, SearchResult } from '../../core/index.js';

export interface JsonCliErrorPayload {
  error: {
    type: string;
    message: string;
    step?: string;
    source?: string;
  };
}

export function formatSearchResultJson(result: SearchResult): string {
  return `${JSON.stringify(result)}\n`;
}

export function formatKnowledgeListJson(result: ListKnowledgeItemsResult): string {
  return `${JSON.stringify(result)}\n`;
}

export function formatCliErrorJson(error: KbError | Error | { name?: string; message?: string; step?: string; source?: string }): string {
  const payload: JsonCliErrorPayload = {
    error: {
      type: error.name || 'InternalError',
      message: error.message || 'Unknown error',
    },
  };

  if ('step' in error && typeof error.step === 'string' && error.step.length > 0) {
    payload.error.step = error.step;
  }
  if ('source' in error && typeof error.source === 'string' && error.source.length > 0) {
    payload.error.source = error.source;
  }

  return `${JSON.stringify(payload)}\n`;
}
