import { SearchError } from '../../errors/index.js';

/**
 * 将用户输入整理为可安全用于 FTS5 `MATCH` 的查询串：
 * 空白分词，各词以 `AND` 组合。
 *
 * 在默认 `unicode61` 分词器下，双引号短语对中文/混合文本常导致零命中，因此对各词使用**前缀**匹配
 * `term*`（用户已以 `*` 结尾时不再追加）。这与架构说明中「中文分词能力有限、MVP 不引入 jieba」一致。
 */
export function buildFtsMatchQuery(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new SearchError('请提供非空的检索关键词', {
      step: 'search',
      source: 'fts-match',
    });
  }

  const terms = tokenizeQuery(trimmed);
  if (terms.length === 0) {
    throw new SearchError('请提供非空的检索关键词', {
      step: 'search',
      source: 'fts-match',
    });
  }

  return terms.map((term) => toPrefixMatchToken(term)).join(' AND ');
}

function toPrefixMatchToken(term: string): string {
  const t = term.trim();
  if (t.length === 0) {
    return t;
  }
  if (t.includes('"')) {
    throw new SearchError('检索词中暂不支持双引号，请换用其它关键词', {
      step: 'search',
      source: 'fts-match',
    });
  }
  return t.endsWith('*') ? t : `${t}*`;
}

/**
 * 按空白分词，合并连续空白；支持含中日韩无空格时整段为单一词
 */
function tokenizeQuery(input: string): string[] {
  return input.split(/\s+/u).map((p) => p.trim()).filter((p) => p.length > 0);
}
