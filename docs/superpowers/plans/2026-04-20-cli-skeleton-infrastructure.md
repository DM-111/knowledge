# CLI 骨架与项目基础设施 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可构建、可链接、可测试的 `kb` CLI 骨架，满足 Story 1.1 的帮助信息、未知命令退出码和统一错误处理验收标准。

**Architecture:** 采用 `src/cli -> src/core -> src/storage` 的单向依赖骨架，但本 story 只实现 CLI 薄层、错误模型和最小占位导出，不提前实现数据库、配置和业务逻辑。入口使用 Commander，构建使用 tsup，测试使用 Vitest，所有行为以测试先行驱动。

**Tech Stack:** TypeScript、Node.js、pnpm、Commander.js、tsup、Vitest、tsx

---

### Task 1: 初始化工程与测试基座

**Files:**

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `README.md`
- **Step 1: 写失败测试**

```ts
// tests/integration/cli-help.test.ts
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

describe('kb --help', () => {
  it('在构建后输出命令列表并返回 0', async () => {
    const result = await execa('node', ['dist/cli.js', '--help'], {
      reject: false,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('init');
    expect(result.stdout).toContain('ingest');
    expect(result.stdout).toContain('search');
    expect(result.stdout).toContain('list');
    expect(result.stdout).toContain('tag');
  });
});
```

- **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/integration/cli-help.test.ts`
Expected: FAIL，因为工程文件和入口文件尚不存在。

- **Step 3: 写最小工程实现**

```json
{
  "name": "knowledge",
  "type": "module",
  "bin": {
    "kb": "./bin/kb.js"
  },
  "scripts": {
    "build": "tsup src/cli/index.ts --format cjs --dts --outDir dist",
    "dev": "tsx src/cli/index.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

- **Step 4: 运行测试确认通过**

Run: `pnpm test`
Expected: 帮助信息测试开始可运行，但后续命令相关测试仍可能失败。

- **Step 5: 提交**

```bash
git add package.json tsconfig.json tsup.config.ts vitest.config.ts .gitignore README.md tests/integration/cli-help.test.ts
git commit -m "feat: bootstrap kb cli project"
```

### Task 2: 实现 CLI 帮助信息与占位命令注册

**Files:**

- Create: `src/cli/index.ts`
- Create: `src/cli/commands/init.ts`
- Create: `src/cli/commands/ingest.ts`
- Create: `src/cli/commands/search.ts`
- Create: `src/cli/commands/list.ts`
- Create: `src/cli/commands/tag.ts`
- Create: `src/core/index.ts`
- Create: `src/storage/index.ts`
- Create: `src/adapters/index.ts`
- Create: `src/config/index.ts`
- Create: `src/utils/index.ts`
- Test: `tests/integration/cli-help.test.ts`
- **Step 1: 为帮助信息补充更精确的失败测试**

```ts
it('展示五个占位子命令', async () => {
  const result = await execa('node', ['dist/cli.js', '--help'], { reject: false });
  expect(result.stdout).toMatch(/init/);
  expect(result.stdout).toMatch(/ingest/);
  expect(result.stdout).toMatch(/search/);
  expect(result.stdout).toMatch(/list/);
  expect(result.stdout).toMatch(/tag/);
});
```

- **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/integration/cli-help.test.ts`
Expected: FAIL，因为 CLI 还未注册完整命令。

- **Step 3: 写最小实现**

```ts
// src/cli/commands/init.ts
import { Command } from 'commander';

export function createInitCommand(): Command {
  return new Command('init').description('初始化配置（后续 story 实现）');
}
```

```ts
// src/cli/index.ts
import { Command } from 'commander';
import { createInitCommand } from './commands/init.js';
// 其余四个命令同模式注册

export function createProgram(): Command {
  const program = new Command();
  program.name('kb').description('本地知识服务 CLI');
  program.addCommand(createInitCommand());
  return program;
}
```

- **Step 4: 运行测试确认通过**

Run: `pnpm vitest run tests/integration/cli-help.test.ts`
Expected: PASS

- **Step 5: 提交**

```bash
git add src/cli src/core src/storage src/adapters src/config src/utils tests/integration/cli-help.test.ts
git commit -m "feat: register kb cli placeholder commands"
```

### Task 3: 未知命令退出码与统一错误模型

**Files:**

- Create: `src/errors/index.ts`
- Modify: `src/cli/index.ts`
- Create: `tests/integration/cli-errors.test.ts`
- **Step 1: 写失败测试**

```ts
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

describe('cli errors', () => {
  it('未知命令返回 2 并提示可用命令', async () => {
    const result = await execa('node', ['dist/cli.js', 'foo'], { reject: false });
    expect(result.exitCode).toBe(2);
    expect(result.stderr + result.stdout).toContain('help');
  });

  it('KbError 返回 1 并格式化输出', async () => {
    const result = await execa('node', ['dist/cli.js', '__simulate-kb-error'], { reject: false });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('ConfigError');
    expect(result.stderr).toContain('step');
  });
});
```

- **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/integration/cli-errors.test.ts`
Expected: FAIL，因为退出码和错误格式化尚未实现。

- **Step 3: 写最小实现**

```ts
export class KbError extends Error {
  constructor(message, options = {}) {
    super(message, { cause: options.cause });
    this.name = 'KbError';
    this.step = options.step;
    this.source = options.source;
  }
}
```

```ts
program.showSuggestionAfterError(true);
program.showHelpAfterError();
program.exitOverride();
```

- **Step 4: 运行测试确认通过**

Run: `pnpm vitest run tests/integration/cli-errors.test.ts`
Expected: PASS

- **Step 5: 提交**

```bash
git add src/errors/index.ts src/cli/index.ts tests/integration/cli-errors.test.ts
git commit -m "feat: add kb error model and cli exit handling"
```

### Task 4: 构建入口与分发验证

**Files:**

- Create: `bin/kb.js`
- Modify: `README.md`
- Test: `tests/integration/cli-help.test.ts`
- **Step 1: 写失败测试**

```ts
it('构建后存在 CLI 入口文件', async () => {
  const stat = await fs.stat('dist/cli.js');
  expect(stat.isFile()).toBe(true);
});
```

- **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/integration/cli-help.test.ts`
Expected: FAIL，因为构建产物尚不存在。

- **Step 3: 写最小实现**

```js
#!/usr/bin/env node
require('../dist/cli.js');
```

- **Step 4: 运行测试确认通过**

Run: `pnpm build && pnpm test`
Expected: PASS

- **Step 5: 提交**

```bash
git add bin/kb.js README.md
git commit -m "feat: add kb executable entrypoint"
```

