import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { parse } from 'yaml';
import { ConfigError } from '../errors/index.js';
import {
  CONFIG_FIELDS,
  deriveDbPath,
  freezeConfig,
  freezeSources,
  getConfigPaths,
  type Config,
  type ConfigField,
  type ConfigSource,
  type ConfigSources,
  type LoadConfigOptions,
  type LoadedConfig,
} from './schema.js';

const ENV_FIELD_MAP: Record<string, ConfigField> = {
  KB_KNOWLEDGE_BASE_PATH: 'knowledgeBasePath',
  KB_DB_PATH: 'dbPath',
};

export function loadConfig(options: LoadConfigOptions = {}): LoadedConfig {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const paths = getConfigPaths({
    cwd,
    homeDir: options.homeDir,
  });
  const values: Config = {};
  const sources: ConfigSources = {};

  applyLayer(values, sources, loadFileConfig(paths.userConfigPath, 'user'), 'user');
  applyLayer(values, sources, loadFileConfig(paths.projectConfigPath, 'project'), 'project');
  applyLayer(values, sources, loadEnvConfig(env, cwd), 'env');
  applyLayer(values, sources, normalizeOverrides(options.overrides, cwd), 'cli');

  if (values.knowledgeBasePath && !values.dbPath) {
    values.dbPath = deriveDbPath(values.knowledgeBasePath);
    sources.dbPath = 'derived';
  }

  return {
    config: freezeConfig(values),
    sources: freezeSources(sources),
    paths: Object.freeze({ ...paths }),
  };
}

function loadFileConfig(filePath: string, source: Extract<ConfigSource, 'user' | 'project'>): Config {
  if (!existsSync(filePath)) {
    return {};
  }

  try {
    const raw = parse(readFileSync(filePath, 'utf8'));
    return normalizeParsedConfig(raw, dirname(filePath), source, filePath);
  } catch (error) {
    if (error instanceof ConfigError) {
      throw error;
    }

    throw new ConfigError('配置文件解析失败', {
      step: 'parse-config',
      source: filePath,
      cause: error,
    });
  }
}

function normalizeParsedConfig(
  raw: unknown,
  baseDir: string,
  source: Extract<ConfigSource, 'user' | 'project'>,
  sourcePath: string,
): Config {
  if (raw == null) {
    return {};
  }

  if (!isRecord(raw)) {
    throw new ConfigError('配置文件必须是对象', {
      step: 'validate-config',
      source: sourcePath,
    });
  }

  const config: Config = {};

  for (const key of Object.keys(raw)) {
    if (!CONFIG_FIELDS.includes(key as ConfigField)) {
      throw new ConfigError(`配置文件包含未知字段 ${key}`, {
        step: 'validate-config',
        source: sourcePath,
      });
    }

    const value = raw[key];

    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new ConfigError(`配置项 ${key} 必须是非空字符串`, {
        step: 'validate-config',
        source: sourcePath,
      });
    }

    config[key as ConfigField] = normalizePathValue(value, baseDir);
  }

  return config;
}

function loadEnvConfig(env: NodeJS.ProcessEnv, cwd: string): Config {
  const config: Config = {};

  for (const [envKey, field] of Object.entries(ENV_FIELD_MAP)) {
    const value = env[envKey];

    if (typeof value === 'string' && value.trim().length > 0) {
      config[field] = normalizePathValue(value, cwd);
    }
  }

  return config;
}

function normalizeOverrides(overrides: Config | undefined, cwd: string): Config {
  if (!overrides) {
    return {};
  }

  const config: Config = {};

  for (const field of CONFIG_FIELDS) {
    const value = overrides[field];

    if (typeof value === 'string' && value.trim().length > 0) {
      config[field] = normalizePathValue(value, cwd);
    }
  }

  return config;
}

function applyLayer(values: Config, sources: ConfigSources, layer: Config, source: ConfigSource): void {
  for (const field of CONFIG_FIELDS) {
    const value = layer[field];

    if (typeof value === 'string' && value.length > 0) {
      values[field] = value;
      sources[field] = source;
    }
  }
}

function normalizePathValue(value: string, baseDir: string): string {
  return isAbsolute(value) ? value : resolve(baseDir, value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
