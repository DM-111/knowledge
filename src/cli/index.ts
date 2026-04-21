import { Command, CommanderError } from 'commander';
import { createIngestCommand } from './commands/ingest.js';
import { createInitCommand } from './commands/init.js';
import { createListCommand } from './commands/list.js';
import { createSearchCommand } from './commands/search.js';
import { createTagCommand } from './commands/tag.js';
import { KbError, formatKbError } from '../errors/index.js';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('kb')
    .description('本地知识服务 CLI')
    .showHelpAfterError()
    .showSuggestionAfterError(true)
    .exitOverride();

  program.addCommand(createInitCommand());
  program.addCommand(createIngestCommand());
  program.addCommand(createSearchCommand());
  program.addCommand(createListCommand());
  program.addCommand(createTagCommand());

  return program;
}

export function handleCliError(error: unknown): void {
  if (error instanceof CommanderError) {
    if (error.code === 'commander.helpDisplayed' || error.exitCode === 0) {
      process.exitCode = 0;
      return;
    }

    process.stderr.write(`${error.message}\n`);
    process.exitCode = error.code === 'commander.unknownCommand' ? 2 : error.exitCode;
    return;
  }

  if (error instanceof KbError) {
    process.stderr.write(`${formatKbError(error)}\n`);
    process.exitCode = 1;
    return;
  }

  process.stderr.write(`InternalError: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

export async function run(argv = process.argv): Promise<void> {
  try {
    const program = createProgram();
    await program.parseAsync(argv);
  } catch (error: unknown) {
    handleCliError(error);
  }
}
