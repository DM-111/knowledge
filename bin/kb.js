#!/usr/bin/env node

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
if (!process.env.KB_MIGRATIONS_DIR) {
  process.env.KB_MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'migrations');
}
(globalThis).__KB_MIGRATIONS_DIR__ = process.env.KB_MIGRATIONS_DIR;
let run;
let handleCliError;

try {
  ({ run, handleCliError } = require('../dist/cli.cjs'));
} catch (error) {
  process.stderr.write(
    `kb 尚未构建，请先运行 pnpm build。\n${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}

if (typeof run === 'function') {
  run(process.argv).catch((error) => {
    if (typeof handleCliError === 'function') {
      handleCliError(error);
      return;
    }

    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
