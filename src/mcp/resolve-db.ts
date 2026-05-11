import { loadConfig, assertRequiredConfig } from '../config/index.js';

/**
 * 从 kb 配置系统解析 dbPath。
 * 优先级: 环境变量 > 用户配置 (~/.config/kb/config.yaml) > 项目配置
 */
export function resolveDbPath(): string {
  const { config } = loadConfig();
  assertRequiredConfig(config, ['dbPath'], 'mcp-server');
  return config.dbPath!;
}
