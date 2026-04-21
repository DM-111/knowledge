import type { ProgressEvent } from '../../core/types.js';

export interface OutputWriter {
  write(chunk: string): void;
}

export interface IngestProgressRenderer {
  render(event: ProgressEvent): void;
  finish(): void;
}

type IngestProgressStep = (typeof INGEST_PROGRESS_STEPS)[number];
type StepState = 'pending' | 'running' | 'complete' | 'error';

export const INGEST_PROGRESS_STEPS = ['resolve-adapter', 'fetch', 'parse', 'chunk', 'store', 'index'] as const;

const INGEST_PROGRESS_LABELS: Record<IngestProgressStep, string> = {
  'resolve-adapter': '选择适配器',
  fetch: '读取文件',
  parse: '内容清洗',
  chunk: '切分 chunks',
  store: '存储入库',
  index: '更新索引',
};

const STATUS_PREFIX: Record<StepState, string> = {
  pending: '[ ]',
  running: '[..]',
  complete: '[x]',
  error: '[!]',
};

export function createIngestProgressRenderer(writer: OutputWriter): IngestProgressRenderer {
  const states = new Map<IngestProgressStep, StepState>(INGEST_PROGRESS_STEPS.map((step) => [step, 'pending']));
  let hasActiveFrame = false;
  let previousLength = 0;

  return {
    render(event) {
      if (!isIngestProgressStep(event.step)) {
        return;
      }

      states.set(event.step, toStepState(event.status));

      const line = buildProgressLine(states, event);
      const padding = previousLength > line.length ? ' '.repeat(previousLength - line.length) : '';
      writer.write(`\u001B[2K\r${line}${padding}`);
      previousLength = line.length;
      hasActiveFrame = true;

      if (event.status === 'error') {
        writer.write('\n');
        hasActiveFrame = false;
        previousLength = 0;
      }
    },
    finish() {
      if (!hasActiveFrame) {
        return;
      }

      writer.write('\n');
      hasActiveFrame = false;
      previousLength = 0;
    },
  };
}

function isIngestProgressStep(step: string): step is IngestProgressStep {
  return (INGEST_PROGRESS_STEPS as readonly string[]).includes(step);
}

function toStepState(status: ProgressEvent['status']): StepState {
  if (status === 'complete') {
    return 'complete';
  }

  if (status === 'error') {
    return 'error';
  }

  return 'running';
}

function buildProgressLine(
  states: ReadonlyMap<IngestProgressStep, StepState>,
  event: Pick<ProgressEvent, 'step' | 'detail'>,
): string {
  const segments = INGEST_PROGRESS_STEPS.map((step) => `${STATUS_PREFIX[states.get(step) ?? 'pending']} ${INGEST_PROGRESS_LABELS[step]}`);
  const detailText = event.detail ? sanitizeDetail(event.detail) : '';
  const detail = detailText ? ` | ${detailText}` : '';
  return `${segments.join(' | ')}${detail}`;
}

function sanitizeDetail(detail: string): string {
  return detail
    .replace(/\u001B\[[0-9;]*[A-Za-z]/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]+/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}
