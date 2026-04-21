import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { stringify } from 'yaml';
import { ConfigError } from '../errors/index.js';
import { getConfigPaths, type Config } from './schema.js';

export interface WriteUserConfigOptions {
  homeDir?: string;
}

export interface WriteUserConfigResult {
  configPath: string;
}

export function writeUserConfig(config: Config, options: WriteUserConfigOptions = {}): WriteUserConfigResult {
  if (!config.knowledgeBasePath || !config.dbPath) {
    throw new ConfigError('写入用户配置前必须提供 knowledgeBasePath 和 dbPath', {
      step: 'write-config',
      source: 'user-config',
    });
  }

  const { userConfigPath } = getConfigPaths({
    homeDir: options.homeDir,
  });

  try {
    mkdirSync(dirname(userConfigPath), {
      recursive: true,
      mode: 0o700,
    });
    writeFileSync(
      userConfigPath,
      stringify({
        knowledgeBasePath: config.knowledgeBasePath,
        dbPath: config.dbPath,
      }),
      {
        mode: 0o600,
      },
    );
    chmodSync(userConfigPath, 0o600);
  } catch (error) {
    throw new ConfigError('无法写入用户配置文件', {
      step: 'write-config',
      source: userConfigPath,
      cause: error,
    });
  }

  return {
    configPath: userConfigPath,
  };
}
