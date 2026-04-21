import { confirm, input } from '@inquirer/prompts';
import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import {
  deriveDbPath,
  getMissingConfigFields,
  loadConfig,
  writeUserConfig,
  type Config,
} from '../../config/index.js';
import { ensureStorageReady } from '../../core/index.js';
import { ConfigError } from '../../errors/index.js';
import { addConfigOptions, getConfigOverrides, type ConfigOptionValues } from '../shared-options.js';

export interface InitPromptAdapter {
  input(options: { message: string; default?: string }): Promise<string>;
  confirm(options: { message: string; default?: boolean }): Promise<boolean>;
}

export interface InitFlowOptions {
  cwd?: string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
  isInteractive?: boolean;
  overrides?: Config;
  prompts?: InitPromptAdapter;
}

export interface InitFlowResult {
  saved: boolean;
  config: Readonly<Required<Config>>;
  configPath: string;
}

const DEFAULT_PROMPTS: InitPromptAdapter = {
  input: async (options) => input(options),
  confirm: async (options) => confirm(options),
};

export function createInitCommand(): Command {
  return addConfigOptions(
    new Command('init')
      .description('交互式初始化配置并自动完成最小数据库初始化')
      .action(async (...args: unknown[]) => {
        const command = args[args.length - 1] as Command;
        const options = command.optsWithGlobals<ConfigOptionValues>();
        const result = await runInitFlow({
          overrides: getConfigOverrides(options),
        });

        if (!result.saved) {
          process.stdout.write(`已保留现有配置：${result.configPath}\n`);
          return;
        }

        process.stdout.write(
          [
            `配置已写入：${result.configPath}`,
            `knowledgeBasePath: ${result.config.knowledgeBasePath}`,
            `dbPath: ${result.config.dbPath}`,
            '数据库初始化已完成',
          ].join('\n') + '\n',
        );
      }),
  );
}

export async function runInitFlow(options: InitFlowOptions = {}): Promise<InitFlowResult> {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const isInteractive = options.isInteractive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const prompts = options.prompts ?? DEFAULT_PROMPTS;
  const loaded = loadConfig({
    cwd,
    homeDir: options.homeDir,
    env,
    overrides: options.overrides,
  });
  const userConfigExists = existsSync(loaded.paths.userConfigPath);

  if (userConfigExists) {
    if (!isInteractive) {
      throw new ConfigError('非交互环境下检测到现有配置，无法确认是否覆盖；请在交互式终端执行 kb init', {
        step: 'confirm-overwrite',
        source: loaded.paths.userConfigPath,
      });
    }

    const shouldOverwrite = await prompts.confirm({
      message: buildOverwriteMessage(loaded.config, loaded.paths.userConfigPath),
      default: false,
    });

    if (!shouldOverwrite) {
      const existingConfig = ensureCompleteConfig(loaded.config);
      return {
        saved: false,
        config: existingConfig,
        configPath: loaded.paths.userConfigPath,
      };
    }
  }

  const finalizedConfig = isInteractive
    ? await promptForConfigValues(loaded.config, prompts, cwd)
    : ensureCompleteConfig(loaded.config, 'init');

  const provider = ensureStorageReady({
    dbPath: finalizedConfig.dbPath,
  });
  provider.close();
  const { configPath } = writeUserConfig(finalizedConfig, {
    homeDir: options.homeDir,
  });

  return {
    saved: true,
    config: finalizedConfig,
    configPath,
  };
}

export async function ensureConfigForCommand(options: InitFlowOptions & { commandName: string }): Promise<Readonly<Required<Config>>> {
  const loaded = loadConfig({
    cwd: options.cwd,
    homeDir: options.homeDir,
    env: options.env,
    overrides: options.overrides,
  });
  const missingFields = getMissingConfigFields(loaded.config);
  const isInteractive = options.isInteractive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);

  if (missingFields.length === 0) {
    return ensureCompleteConfig(loaded.config);
  }

  if (!isInteractive) {
    throw new ConfigError(
      `命令 ${options.commandName} 缺少必要配置：${missingFields.join(', ')}；请先运行 kb init 或在交互式终端中补齐配置`,
      {
        step: 'load-config',
        source: options.commandName,
      },
    );
  }

  const result = await runInitFlow(options);
  return result.config;
}

async function promptForConfigValues(
  initialConfig: Readonly<Config>,
  prompts: InitPromptAdapter,
  cwd: string,
): Promise<Readonly<Required<Config>>> {
  const knowledgeBasePathInput = await prompts.input({
    message: '请输入知识库存储路径',
    default: initialConfig.knowledgeBasePath,
  });
  const knowledgeBasePath = normalizePromptPath(knowledgeBasePathInput, cwd);

  if (!knowledgeBasePath) {
    throw new ConfigError('知识库存储路径不能为空', {
      step: 'prompt-config',
      source: 'knowledgeBasePath',
    });
  }

  const defaultDbPath =
    initialConfig.dbPath && initialConfig.knowledgeBasePath === knowledgeBasePath
      ? initialConfig.dbPath
      : deriveDbPath(knowledgeBasePath);
  const dbPathInput = await prompts.input({
    message: '请输入数据库路径',
    default: defaultDbPath,
  });
  const dbPath = normalizePromptPath(dbPathInput, cwd) || defaultDbPath;

  if (!dbPath) {
    throw new ConfigError('数据库路径不能为空', {
      step: 'prompt-config',
      source: 'dbPath',
    });
  }

  return Object.freeze({
    knowledgeBasePath,
    dbPath,
  });
}

function ensureCompleteConfig(config: Readonly<Config>, source = 'init'): Readonly<Required<Config>> {
  const missingFields = getMissingConfigFields(config);

  if (missingFields.length > 0) {
    throw new ConfigError(`缺少必要配置：${missingFields.join(', ')}`, {
      step: 'validate-config',
      source,
    });
  }

  return Object.freeze({
    knowledgeBasePath: config.knowledgeBasePath!,
    dbPath: config.dbPath!,
  });
}

function buildOverwriteMessage(config: Readonly<Config>, userConfigPath: string): string {
  return [
    `已检测到现有用户配置：${userConfigPath}`,
    `knowledgeBasePath: ${config.knowledgeBasePath ?? '<未设置>'}`,
    `dbPath: ${config.dbPath ?? '<未设置>'}`,
    '是否覆盖现有配置？',
  ].join('\n');
}

function normalizePromptPath(value: string, cwd: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  return isAbsolute(trimmed) ? trimmed : resolve(cwd, trimmed);
}
