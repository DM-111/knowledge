import { writeFileSync } from 'node:fs';
import { Command } from 'commander';
import { loadConfig, assertRequiredConfig } from '../../config/index.js';
import { generateIndex } from '../../core/index-generator.js';

export const indexCommand = new Command('index')
  .description('生成知识库的 llms.txt 索引文件')
  .option('-o, --output <path>', '输出文件路径（默认输出到 stdout）')
  .action((options: { output?: string }) => {
    const { config } = loadConfig();
    assertRequiredConfig(config, ['dbPath'], 'kb index');

    const content = generateIndex({ dbPath: config.dbPath! });

    if (options.output) {
      writeFileSync(options.output, content, 'utf8');
      process.stdout.write(`已写入 ${options.output}\n`);
    } else {
      process.stdout.write(content);
    }
  });
