import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { StorageError } from '../errors/index.js';
import type { DatabaseProvider } from './provider.js';

const MIGRATION_FILE_PATTERN = /^(?<version>\d+)-(?<description>[a-z0-9-]+)\.sql$/;

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export interface RunMigrationsOptions {
  migrations?: readonly Migration[];
  migrationsDir?: string;
}

export function getDefaultMigrationsDirectory(): string {
  const injectedMigrationsDir = (globalThis as { __KB_MIGRATIONS_DIR__?: string }).__KB_MIGRATIONS_DIR__;

  if (injectedMigrationsDir) {
    return injectedMigrationsDir;
  }

  if (process.env.KB_MIGRATIONS_DIR) {
    return process.env.KB_MIGRATIONS_DIR;
  }

  const entryPoint = process.argv[1] ? resolve(process.argv[1]) : '';
  const entryDirectory = entryPoint ? dirname(entryPoint) : '';

  if (entryDirectory.endsWith(`${sep}bin`)) {
    return resolve(entryDirectory, '..', 'dist', 'migrations');
  }

  if (entryDirectory.endsWith(`${sep}cli`)) {
    return resolve(entryDirectory, '..', 'storage', 'migrations');
  }

  return resolve(process.cwd(), 'src', 'storage', 'migrations');
}

export function discoverMigrations(migrationsDir = getDefaultMigrationsDirectory()): Migration[] {
  try {
    const fileNames = readdirSync(migrationsDir);
    const invalidSqlFiles = fileNames.filter(
      (fileName) => fileName.endsWith('.sql') && !MIGRATION_FILE_PATTERN.test(fileName),
    );

    if (invalidSqlFiles.length > 0) {
      throw new StorageError('迁移文件名不符合 NNN-description.sql 规范', {
        step: 'load-migrations',
        source: invalidSqlFiles[0],
      });
    }

    return fileNames
      .filter((fileName) => MIGRATION_FILE_PATTERN.test(fileName))
      .sort((left, right) => parseMigrationVersion(left) - parseMigrationVersion(right))
      .map((fileName) => ({
        version: parseMigrationVersion(fileName),
        name: fileName,
        sql: readFileSync(join(migrationsDir, fileName), 'utf8'),
      }));
  } catch (error) {
    throw new StorageError('无法加载数据库迁移脚本', {
      step: 'load-migrations',
      source: migrationsDir,
      cause: error,
    });
  }
}

export function runMigrations(provider: DatabaseProvider, options: RunMigrationsOptions = {}): number[] {
  const migrations = [...(options.migrations ?? discoverMigrations(options.migrationsDir))].sort(
    (left, right) => left.version - right.version,
  );
  const currentVersion = provider.getUserVersion();
  validateMigrationPlan(migrations, currentVersion);
  const pendingMigrations = migrations.filter((migration) => migration.version > currentVersion);
  const appliedVersions: number[] = [];

  for (const migration of pendingMigrations) {
    try {
      provider.transaction((db) => {
        db.exec(migration.sql);
        provider.setUserVersion(migration.version);
      });

      appliedVersions.push(migration.version);
    } catch (error) {
      const versionLabel = String(migration.version).padStart(3, '0');
      throw new StorageError(`迁移 ${versionLabel} 执行失败`, {
        step: 'migrate',
        source: versionLabel,
        cause: error,
      });
    }
  }

  return appliedVersions;
}

function validateMigrationPlan(migrations: readonly Migration[], currentVersion: number): void {
  if (migrations.length === 0) {
    if (currentVersion === 0) {
      throw new StorageError('未找到任何迁移脚本，无法完成数据库初始化', {
        step: 'validate-migrations',
        source: 'bootstrap',
      });
    }

    throw new StorageError('数据库 schema 版本高于当前代码支持的最高迁移版本', {
      step: 'validate-migrations',
      source: String(currentVersion).padStart(3, '0'),
    });
  }

  for (let index = 1; index < migrations.length; index += 1) {
    if (migrations[index]?.version === migrations[index - 1]?.version) {
      const duplicatedVersion = String(migrations[index].version).padStart(3, '0');
      throw new StorageError(`发现重复的迁移版本 ${duplicatedVersion}`, {
        step: 'validate-migrations',
        source: duplicatedVersion,
      });
    }
  }

  const latestKnownVersion = migrations[migrations.length - 1]?.version ?? 0;

  if (currentVersion > latestKnownVersion) {
    throw new StorageError('数据库 schema 版本高于当前代码支持的最高迁移版本', {
      step: 'validate-migrations',
      source: String(currentVersion).padStart(3, '0'),
    });
  }

  const pendingMigrations = migrations.filter((migration) => migration.version > currentVersion);

  for (let index = 0; index < pendingMigrations.length; index += 1) {
    const expectedVersion = currentVersion + index + 1;
    const migration = pendingMigrations[index];

    if (migration?.version !== expectedVersion) {
      throw new StorageError(`迁移版本不连续，期望 ${String(expectedVersion).padStart(3, '0')}`, {
        step: 'validate-migrations',
        source: migration ? String(migration.version).padStart(3, '0') : 'unknown',
      });
    }
  }
}

function parseMigrationVersion(fileName: string): number {
  const match = fileName.match(MIGRATION_FILE_PATTERN);

  if (!match?.groups?.version) {
    throw new StorageError('迁移文件名不符合 NNN-description.sql 规范', {
      step: 'parse-migration',
      source: fileName,
    });
  }

  return Number.parseInt(match.groups.version, 10);
}
