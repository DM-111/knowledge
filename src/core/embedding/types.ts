export interface EmbeddingProvider {
  /** 模型标识 */
  readonly modelId: string;
  /** 向量维度 */
  readonly dimensions: number;

  /**
   * 初始化模型（下载/加载）。必须在 embed 前调用。
   */
  init(): Promise<void>;

  /** 模型是否已就绪 */
  readonly ready: boolean;

  /**
   * 批量生成 embeddings。
   * @param texts 文本数组
   * @returns 每条文本对应一个 Float32Array
   */
  embed(texts: string[]): Promise<Float32Array[]>;

  /**
   * 生成单条文本的 embedding。
   */
  embedOne(text: string): Promise<Float32Array>;

  /** 释放资源 */
  dispose(): Promise<void>;
}
