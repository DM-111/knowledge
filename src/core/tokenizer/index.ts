import { JiebaTokenizer } from './jieba-tokenizer.js';
import { InMemorySynonymExpander } from './synonym-expander.js';
import type { SynonymEntry, SynonymExpander, Tokenizer, TokenizerResult } from './types.js';

let _tokenizer: JiebaTokenizer | null = null;
let _synonymExpander: InMemorySynonymExpander | null = null;

/**
 * 获取全局 Tokenizer 单例（懒初始化）
 */
export async function getTokenizer(): Promise<JiebaTokenizer> {
  if (!_tokenizer) {
    _tokenizer = new JiebaTokenizer();
    await _tokenizer.init();
  }
  return _tokenizer;
}

/**
 * 同步获取 Tokenizer（若已初始化）。
 * 未初始化时会在首次调用 segment 时自动初始化。
 */
export function getTokenizerSync(): JiebaTokenizer {
  if (!_tokenizer) {
    _tokenizer = new JiebaTokenizer();
  }
  return _tokenizer;
}

/**
 * 获取全局 SynonymExpander 单例
 */
export function getSynonymExpander(): InMemorySynonymExpander {
  if (!_synonymExpander) {
    _synonymExpander = new InMemorySynonymExpander();
  }
  return _synonymExpander;
}

/**
 * 加载同义词配置到全局 expander
 */
export function loadSynonyms(entries: SynonymEntry[]): void {
  getSynonymExpander().load(entries);
}

export type { Tokenizer, TokenizerResult, SynonymExpander, SynonymEntry } from './types.js';
export { JiebaTokenizer } from './jieba-tokenizer.js';
export { InMemorySynonymExpander } from './synonym-expander.js';
export { isStopWord, STOPWORDS } from './stopwords.js';
