import type { EmbeddingProvider } from './types.js';
import { TransformersEmbeddingProvider } from './transformers-provider.js';

let _provider: EmbeddingProvider | null = null;

/**
 * 获取全局 EmbeddingProvider 单例（懒初始化）。
 * 首次调用会加载模型，耗时约 2-5 秒。
 */
export async function getEmbeddingProvider(): Promise<EmbeddingProvider> {
  if (!_provider) {
    _provider = new TransformersEmbeddingProvider();
    await _provider.init();
  }
  return _provider;
}

/**
 * 尝试获取 EmbeddingProvider，失败或超时（2s）时返回 null。
 * 用于 hybrid search 的 graceful degradation。
 */
export async function tryGetEmbeddingProvider(): Promise<EmbeddingProvider | null> {
  if (_provider?.ready) return _provider;

  try {
    const result = await Promise.race([
      getEmbeddingProvider(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);
    return result;
  } catch {
    return null;
  }
}

/**
 * 释放 EmbeddingProvider 资源。
 */
export async function disposeEmbeddingProvider(): Promise<void> {
  if (_provider) {
    await _provider.dispose();
    _provider = null;
  }
}

export type { EmbeddingProvider } from './types.js';
export { TransformersEmbeddingProvider } from './transformers-provider.js';
