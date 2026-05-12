export interface TokenizerResult {
  /** 以空格连接的分词结果（用于 FTS5 索引/匹配） */
  segmented: string;
  /** 分词后的 token 数组（已过滤停用词） */
  tokens: string[];
}

export interface Tokenizer {
  /** 初始化分词器（加载词典）。首次调用前必须执行。 */
  init(): Promise<void>;
  /** 分词器是否已就绪 */
  readonly ready: boolean;
  /** 对文本进行分词 */
  segment(text: string): TokenizerResult;
}

export interface SynonymEntry {
  /** 同义词组（双向等价） */
  group: string[];
}

export interface SynonymExpander {
  /** 加载同义词配置 */
  load(entries: SynonymEntry[]): void;
  /** 将一组 token 扩展为包含同义词的二维数组 */
  expand(tokens: string[]): string[][];
  /** 同义词表是否为空 */
  readonly empty: boolean;
}
