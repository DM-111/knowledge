import { Command } from 'commander';
import { createIngestCommand } from './commands/ingest.js';
import { createInitCommand } from './commands/init.js';
import { createListCommand } from './commands/list.js';
import { createSearchCommand } from './commands/search.js';
import { createSyncCommand } from './commands/sync.js';
import { createTagCommand } from './commands/tag.js';
import { indexCommand } from './commands/index-cmd.js';
import { renderCliError } from './formatters/index.js';

export interface CreateProgramOptions {
  json?: boolean;
}

export function createProgram(options: CreateProgramOptions = {}): Command {
  const program = new Command();

  program
    .name('kb')
    .description('本地知识服务 CLI')
    .showHelpAfterError()
    .showSuggestionAfterError(!options.json)
    .configureOutput({
      writeErr: (chunk) => {
        if (!options.json) {
          process.stderr.write(chunk);
        }
      },
    })
    .exitOverride();

  program.addCommand(createInitCommand());
  program.addCommand(createIngestCommand());
  program.addCommand(createSearchCommand());
  program.addCommand(createListCommand());
  program.addCommand(createTagCommand());
  program.addCommand(createSyncCommand());
  program.addCommand(indexCommand);

  return program;
}

export interface HandleCliErrorOptions {
  json?: boolean;
  writeErr?: (chunk: string) => void;
}

export function handleCliError(error: unknown, options: HandleCliErrorOptions = {}): void {
  const rendered = renderCliError(error, { json: options.json });
  if (rendered.shouldWrite) {
    (options.writeErr ?? ((chunk: string) => process.stderr.write(chunk)))(rendered.text);
  }
  process.exitCode = rendered.exitCode;
}

export async function run(argv = process.argv): Promise<void> {
  const json = argv.includes('--json');
  try {
    const program = createProgram({ json });
    await program.parseAsync(argv);
  } catch (error: unknown) {
    handleCliError(error, { json });
  }
}
