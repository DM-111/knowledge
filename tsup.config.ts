import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    cli: 'src/cli/index.ts',
    mcp: 'src/mcp/server.ts',
  },
  external: ['better-sqlite3'],
  format: ['cjs'],
  dts: true,
  clean: true,
  outDir: 'dist',
  sourcemap: true,
  target: 'node20',
});
