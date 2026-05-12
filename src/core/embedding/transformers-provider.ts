import type { EmbeddingProvider } from './types.js';

const MODEL_ID = 'jinaai/jina-embeddings-v2-base-zh';
const DIMENSIONS = 512;

/**
 * 基于 @huggingface/transformers 的 Embedding Provider。
 *
 * 使用 jina-embeddings-v2-base-zh 模型（512 维，中文效果好）。
 * 模型首次使用时自动下载到 ~/.cache/huggingface/
 *
 * 注意：@huggingface/transformers 是纯 JS/WASM 实现，无需 native 依赖。
 * 但首次加载会下载模型文件（约 130MB），需要网络连接。
 */
export class TransformersEmbeddingProvider implements EmbeddingProvider {
  readonly modelId = MODEL_ID;
  readonly dimensions = DIMENSIONS;

  private pipeline: any = null;
  private _ready = false;

  get ready(): boolean {
    return this._ready;
  }

  async init(): Promise<void> {
    if (this._ready) return;

    // 动态 import @huggingface/transformers（ESM 模块）
    const { pipeline, env } = await import('@huggingface/transformers');

    // 禁用远程模型检查（使用缓存优先）
    env.allowLocalModels = true;

    this.pipeline = await pipeline('feature-extraction', MODEL_ID, {
      // 使用量化版本减小体积和提升速度
      dtype: 'q8',
    });

    this._ready = true;
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    if (!this._ready || !this.pipeline) {
      throw new Error('EmbeddingProvider 未初始化，请先调用 init()');
    }

    const results: Float32Array[] = [];

    for (const text of texts) {
      const output = await this.pipeline(text, {
        pooling: 'mean',
        normalize: true,
      });

      // output.data 是 Float32Array
      results.push(new Float32Array(output.data));
    }

    return results;
  }

  async embedOne(text: string): Promise<Float32Array> {
    const [result] = await this.embed([text]);
    return result;
  }

  async dispose(): Promise<void> {
    this.pipeline = null;
    this._ready = false;
  }
}
