# knowledge

本地优先的知识服务 CLI。

## 环境要求

- Node.js `^20.19.0` 或 `>=22.12.0`
- pnpm

## 开发

```bash
pnpm install
pnpm build
pnpm test
```

## 全局链接

```bash
export PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"
pnpm build
pnpm link --global
kb --help
```

