import { Command } from 'commander';
import type { Config } from '../config/index.js';

export interface ConfigOptionValues {
  knowledgeBasePath?: string;
  dbPath?: string;
}

export function addConfigOptions<T extends Command>(command: T): T {
  return command
    .option('--knowledge-base-path <path>', '知识库存储路径')
    .option('--db-path <path>', 'SQLite 数据库路径') as T;
}

export function getConfigOverrides(options: ConfigOptionValues): Config {
  return {
    knowledgeBasePath: options.knowledgeBasePath,
    dbPath: options.dbPath,
  };
}
