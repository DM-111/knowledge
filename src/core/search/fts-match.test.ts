import { describe, expect, it } from 'vitest';
import { SearchError } from '../../errors/index.js';
import { buildFtsMatchQuery } from './fts-match.js';

describe('buildFtsMatchQuery', () => {
  it('对空白分词并 AND 组合，为每个词加前缀 *（unicode61 下更可靠）', () => {
    expect(buildFtsMatchQuery('TypeScript 泛型')).toBe('TypeScript* AND 泛型*');
  });

  it('在含双引号时抛出 SearchError', () => {
    expect(() => buildFtsMatchQuery('a "b" c')).toThrow(SearchError);
  });

  it('在仅空白时抛出 SearchError', () => {
    expect(() => buildFtsMatchQuery('  \t  ')).toThrow(SearchError);
  });
});
