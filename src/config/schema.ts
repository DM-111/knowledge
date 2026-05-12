import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export interface Config {
  knowledgeBasePath?: string;
  dbPath?: string;
  synonymsPath?: string;
}

/** Config 中必须填写的字段 */
export type RequiredConfigFields = 'knowledgeBasePath' | 'dbPath';

/** 完整配置：必填字段已确认存在 */
export type ResolvedConfig = Readonly<Required<Pick<Config, RequiredConfigFields>> & Omit<Config, RequiredConfigFields>>;

export type ConfigField = keyof Config;
export type ConfigSource = 'default' | 'user' | 'project' | 'env' | 'cli' | 'derived';
export type ConfigSources = Partial<Record<ConfigField, ConfigSource>>;

export interface ConfigPaths {
  userConfigPath: string;
  projectConfigPath: string;
}

export interface LoadedConfig {
  config: Readonly<Config>;
  sources: Readonly<ConfigSources>;
  paths: Readonly<ConfigPaths>;
}

export interface LoadConfigOptions {
  cwd?: string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
  overrides?: Config;
}

export const CONFIG_FIELDS: readonly ConfigField[] = ['knowledgeBasePath', 'dbPath', 'synonymsPath'];

export function getConfigPaths(options: { cwd?: string; homeDir?: string } = {}): ConfigPaths {
  const cwd = options.cwd ?? process.cwd();
  const homeDir = options.homeDir ?? homedir();

  return {
    userConfigPath: join(homeDir, '.config', 'kb', 'config.yaml'),
    projectConfigPath: join(cwd, 'kb.config.yaml'),
  };
}

export function deriveDbPath(knowledgeBasePath: string): string {
  return resolve(knowledgeBasePath, 'knowledge.db');
}

export function freezeConfig(config: Config): Readonly<Config> {
  return Object.freeze({ ...config });
}

export function freezeSources(sources: ConfigSources): Readonly<ConfigSources> {
  return Object.freeze({ ...sources });
}
