import { describe, it, expect, beforeEach } from 'vitest';
import { InMemorySynonymExpander } from './synonym-expander.js';

describe('InMemorySynonymExpander', () => {
  let expander: InMemorySynonymExpander;

  beforeEach(() => {
    expander = new InMemorySynonymExpander();
  });

  describe('load', () => {
    it('加载同义词组后 empty 为 false', () => {
      expect(expander.empty).toBe(true);
      expander.load([{ group: ['AI', '人工智能', '机器智能'] }]);
      expect(expander.empty).toBe(false);
    });

    it('忽略少于 2 个词的组', () => {
      expander.load([{ group: ['单独'] }]);
      expect(expander.empty).toBe(true);
    });

    it('忽略空组', () => {
      expander.load([{ group: [] }]);
      expect(expander.empty).toBe(true);
    });

    it('重复 load 会清空之前的数据', () => {
      expander.load([{ group: ['a', 'b'] }]);
      expander.load([{ group: ['x', 'y'] }]);
      expect(expander.expand(['a'])).toEqual([['a']]);
      expect(expander.expand(['x'])).toEqual([['x', 'y']]);
    });
  });

  describe('expand', () => {
    it('将 token 扩展为同义词组', () => {
      expander.load([{ group: ['AI', '人工智能', '机器智能'] }]);
      const result = expander.expand(['ai']);
      expect(result).toEqual([['ai', '人工智能', '机器智能']]);
    });

    it('大小写不敏感匹配', () => {
      expander.load([{ group: ['TypeScript', 'TS'] }]);
      const result = expander.expand(['typescript']);
      expect(result).toEqual([['typescript', 'ts']]);
    });

    it('不在任何同义词组中的词保持原样', () => {
      expander.load([{ group: ['AI', '人工智能'] }]);
      const result = expander.expand(['数据库']);
      expect(result).toEqual([['数据库']]);
    });

    it('处理多个 token', () => {
      expander.load([
        { group: ['AI', '人工智能'] },
        { group: ['DB', '数据库', 'database'] },
      ]);
      const result = expander.expand(['ai', '优化', 'db']);
      expect(result).toEqual([
        ['ai', '人工智能'],
        ['优化'],
        ['db', '数据库', 'database'],
      ]);
    });

    it('空 token 列表返回空结果', () => {
      expander.load([{ group: ['AI', '人工智能'] }]);
      const result = expander.expand([]);
      expect(result).toEqual([]);
    });

    it('trim 和 lowercase 处理 group 中的词', () => {
      expander.load([{ group: ['  AI  ', '人工智能  '] }]);
      const result = expander.expand(['ai']);
      expect(result).toEqual([['ai', '人工智能']]);
    });
  });
});
