#!/usr/bin/env node

import { handleCliError, run } from './index.js';

run().catch((error: unknown) => {
  handleCliError(error, { json: process.argv.includes('--json') });
});
