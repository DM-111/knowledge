export {
  deriveDbPath,
  freezeConfig,
  freezeSources,
  getConfigPaths,
  type Config,
  type ConfigField,
  type ConfigPaths,
  type ConfigSource,
  type ConfigSources,
  type LoadConfigOptions,
  type LoadedConfig,
  type ResolvedConfig,
} from './schema.js';
export { loadConfig } from './loader.js';
export { writeUserConfig, type WriteUserConfigOptions, type WriteUserConfigResult } from './writer.js';

import { ConfigError } from '../errors/index.js';
import { type Config, type ConfigField, type ResolvedConfig } from './schema.js';

export function getMissingConfigFields(
  config: Config,
  requiredFields: readonly ConfigField[] = ['knowledgeBasePath', 'dbPath'],
): ConfigField[] {
  return requiredFields.filter((field) => !config[field]);
}

export function assertRequiredConfig(
  config: Config,
  requiredFields: readonly ConfigField[] = ['knowledgeBasePath', 'dbPath'],
  source = 'config',
): asserts config is ResolvedConfig {
  const missingFields = getMissingConfigFields(config, requiredFields);

  if (missingFields.length > 0) {
    throw new ConfigError(`缺少必要配置: ${missingFields.join(', ')}`, {
      step: 'validate-config',
      source,
    });
  }
}
