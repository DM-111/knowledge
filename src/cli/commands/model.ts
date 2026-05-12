import { Command } from 'commander';
import { getEmbeddingProvider, disposeEmbeddingProvider } from '../../core/embedding/index.js';

export function createModelCommand(): Command {
  const command = new Command('model')
    .description('管理 embedding 模型');

  command
    .command('download')
    .description('下载 embedding 模型（首次使用前需要执行）')
    .action(async () => {
      process.stdout.write('正在下载 embedding 模型...\n');
      process.stdout.write('模型将缓存到 ~/.cache/huggingface/\n\n');

      try {
        const provider = await getEmbeddingProvider();
        process.stdout.write(`模型已就绪: ${provider.modelId}\n`);
        process.stdout.write(`向量维度: ${provider.dimensions}\n`);

        // 验证可以生成 embedding
        const testEmbedding = await provider.embedOne('测试文本');
        process.stdout.write(`验证成功: 生成了 ${testEmbedding.length} 维向量\n`);

        await disposeEmbeddingProvider();
      } catch (error) {
        process.stderr.write(`模型下载失败: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
      }
    });

  command
    .command('status')
    .description('查看 embedding 模型状态')
    .action(async () => {
      try {
        const provider = await getEmbeddingProvider();
        process.stdout.write(`模型: ${provider.modelId}\n`);
        process.stdout.write(`维度: ${provider.dimensions}\n`);
        process.stdout.write(`状态: 已就绪\n`);
        await disposeEmbeddingProvider();
      } catch (error) {
        process.stdout.write(`模型: 未下载或不可用\n`);
        process.stdout.write(`错误: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    });

  return command;
}
