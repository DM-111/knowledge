import { cut_for_search } from 'jieba-wasm';
import { isStopWord } from './stopwords.js';
import type { Tokenizer, TokenizerResult } from './types.js';

/** CJK 字符范围正则 */
const CJK_PATTERN = /[一-鿿㐀-䶿豈-﫿]/;

/**
 * 基于 jieba-wasm 的中文分词器。
 *
 * 策略：
 * - 含 CJK 字符的文本 → jieba cut_for_search（搜索模式，粒度更细）
 * - 纯 Latin 文本 → 按空白拆分
 * - 混合文本 → 整体交给 jieba（它能正确处理中英混合）
 */
export class JiebaTokenizer implements Tokenizer {
  private _ready = false;

  get ready(): boolean {
    return this._ready;
  }

  async init(): Promise<void> {
    if (this._ready) return;
    // jieba-wasm 在首次调用 cut 时自动加载 WASM 字典，
    // 这里做一次预热以确保后续调用不会有冷启动延迟
    cut_for_search('预热', true);
    this._ready = true;
  }

  segment(text: string): TokenizerResult {
    if (!this._ready) {
      // 允许同步调用（jieba-wasm 本身是同步的）
      cut_for_search('预热', true);
      this._ready = true;
    }

    const trimmed = text.trim();
    if (!trimmed) {
      return { segmented: '', tokens: [] };
    }

    const hasCJK = CJK_PATTERN.test(trimmed);

    let rawTokens: string[];
    if (hasCJK) {
      // jieba cut_for_search：搜索引擎模式，在精确模式基础上对长词再做细粒度切分
      rawTokens = cut_for_search(trimmed, true);
    } else {
      // 纯 ASCII/Latin：按空白分词，保持原有行为
      rawTokens = trimmed.split(/\s+/u);
    }

    // 清理：去除空白 token、trim、转小写
    const cleaned = rawTokens
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);

    // 去重（保序）
    const seen = new Set<string>();
    const tokens: string[] = [];
    for (const t of cleaned) {
      if (!seen.has(t)) {
        seen.add(t);
        tokens.push(t);
      }
    }

    return {
      segmented: tokens.join(' '),
      tokens,
    };
  }

  /**
   * 对查询文本分词，额外过滤停用词。
   * index-time 不过滤停用词以保留完整信息供 FTS 匹配。
   */
  segmentQuery(text: string): TokenizerResult {
    const result = this.segment(text);
    const filtered = result.tokens.filter((t) => !isStopWord(t));

    // 如果过滤后为空（全是停用词），退回到原始 tokens
    if (filtered.length === 0 && result.tokens.length > 0) {
      return result;
    }

    return {
      segmented: filtered.join(' '),
      tokens: filtered,
    };
  }
}
