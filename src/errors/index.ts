export interface KbErrorOptions {
  step?: string;
  source?: string;
  cause?: unknown;
}

export class KbError extends Error {
  readonly step?: string;
  readonly source?: string;

  constructor(message: string, options: KbErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = 'KbError';
    this.step = options.step;
    this.source = options.source;
  }
}

export class IngestionError extends KbError {
  constructor(message: string, options: KbErrorOptions = {}) {
    super(message, options);
    this.name = 'IngestionError';
  }
}

export class StorageError extends KbError {
  constructor(message: string, options: KbErrorOptions = {}) {
    super(message, options);
    this.name = 'StorageError';
  }
}

export class SearchError extends KbError {
  constructor(message: string, options: KbErrorOptions = {}) {
    super(message, options);
    this.name = 'SearchError';
  }
}

export class ConfigError extends KbError {
  constructor(message: string, options: KbErrorOptions = {}) {
    super(message, options);
    this.name = 'ConfigError';
  }
}

export function formatKbError(error: KbError): string {
  const lines = [`${error.name}: ${error.message}`];

  if (error.step) {
    lines.push(`step: ${error.step}`);
  }

  if (error.source) {
    lines.push(`source: ${error.source}`);
  }

  if (error.cause instanceof Error) {
    lines.push(`cause: ${error.cause.message}`);
  }

  return lines.join('\n');
}
