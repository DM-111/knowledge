import { beforeAll, describe, expect, it } from 'vitest';
import { SearchError } from '../../errors/index.js';
import { buildFtsMatchQuery, buildSimpleFtsMatchQuery } from './fts-match.js';
import { JiebaTokenizer } from '../tokenizer/jieba-tokenizer.js';
import { InMemorySynonymExpander } from '../tokenizer/synonym-expander.js';

describe('buildFtsMatchQuery', () => {
  let tokenizer: JiebaTokenizer;

  beforeAll(async () => {
    tokenizer = new JiebaTokenizer();
    await tokenizer.init();
  });

  it('对中文文本分词并 AND 组合', () => {
    const result = buildFtsMatchQuery({ raw: '知识管理', tokenizer });
    // jieba 对 "知识管理" 分词后产生多个 token
    expect(result.matchExpr).toContain('*');
    expect(result.tokens.length).toBeGreaterThanOrEqual(1);
  });

  it('对英文按空白分词并加前缀 *', () => {
    const result = buildFtsMatchQuery({ raw: 'TypeScript generics', tokenizer });
    expect(result.matchExpr).toBe('typescript* AND generics*');
    expect(result.tokens).toEqual(['typescript', 'generics']);
  });

  it('支持 OR 模式', () => {
    const result = buildFtsMatchQuery({ raw: 'TypeScript generics', tokenizer, mode: 'or' });
    expect(result.matchExpr).toBe('typescript* OR generics*');
  });

  it('同义词扩展生成 OR 子句', () => {
    const expander = new InMemorySynonymExpander();
    expander.load([{ group: ['AI', '人工智能', '机器智能'] }]);

    const result = buildFtsMatchQuery({
      raw: 'AI 优化',
      tokenizer,
      synonymExpander: expander,
      mode: 'and',
    });

    expect(result.matchExpr).toContain('ai*');
    expect(result.matchExpr).toContain('人工智能*');
    expect(result.matchExpr).toContain('机器智能*');
    expect(result.matchExpr).toContain(' OR ');
    expect(result.matchExpr).toContain(' AND ');
  });

  it('过滤中文停用词', () => {
    const result = buildFtsMatchQuery({ raw: '这是一个关于数据库的工具', tokenizer });
    // "这" "是" "一个" "的" 都是停用词，应被过滤
    expect(result.tokens).not.toContain('这');
    expect(result.tokens).not.toContain('是');
    expect(result.tokens).not.toContain('的');
  });

  it('在仅空白/空字符串时抛出 SearchError', () => {
    expect(() => buildFtsMatchQuery({ raw: '  \t  ', tokenizer })).toThrow(SearchError);
    expect(() => buildFtsMatchQuery({ raw: '', tokenizer })).toThrow(SearchError);
  });

  it('清理 FTS 特殊字符而非直接报错', () => {
    // 新版本对特殊字符做 sanitize 而非报错
    const result = buildFtsMatchQuery({ raw: 'C++ programming', tokenizer });
    // jieba 可能将 C++ 拆为 "c+" 等 token，sanitize 后仍可产生有效查询
    expect(result.matchExpr).toContain('programming*');
    expect(result.tokens.length).toBeGreaterThanOrEqual(1);
  });
});

describe('buildSimpleFtsMatchQuery', () => {
  it('对空白分词并 AND 组合，为每个词加前缀 *', () => {
    expect(buildSimpleFtsMatchQuery('TypeScript 泛型')).toBe('TypeScript* AND 泛型*');
  });

  it('保留用户显式提供的尾随通配符', () => {
    expect(buildSimpleFtsMatchQuery('TypeScript* 泛型')).toBe('TypeScript* AND 泛型*');
  });

  it('在仅空白时抛出 SearchError', () => {
    expect(() => buildSimpleFtsMatchQuery('  \t  ')).toThrow(SearchError);
  });
});
