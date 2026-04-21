import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceDir = resolve('src/storage/migrations');
const targetDir = resolve('dist/migrations');

if (existsSync(targetDir)) {
  rmSync(targetDir, { recursive: true, force: true });
}

mkdirSync(resolve('dist'), { recursive: true });

if (existsSync(sourceDir)) {
  cpSync(sourceDir, targetDir, { recursive: true });
}
