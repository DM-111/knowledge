import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import type { SynonymEntry } from '../core/tokenizer/types.js';

interface SynonymFileContent {
  groups?: string[][];
}

/**
 * 从 YAML 文件加载同义词配置。
 *
 * 格式：
 * ```yaml
 * groups:
 *   - [人工智能, AI, 机器智能]
 *   - [隐喻, 比喻, 类比]
 * ```
 */
export function loadSynonymsFromFile(filePath: string): SynonymEntry[] {
  if (!existsSync(filePath)) {
    return [];
  }

  const raw = readFileSync(filePath, 'utf-8').trim();
  if (!raw) {
    return [];
  }

  const parsed = parse(raw) as SynonymFileContent | null;
  if (!parsed?.groups || !Array.isArray(parsed.groups)) {
    return [];
  }

  return parsed.groups
    .filter((group): group is string[] => Array.isArray(group) && group.length >= 2)
    .map((group) => ({ group }));
}
