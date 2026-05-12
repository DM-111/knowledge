import { describe, it, expect, beforeAll } from 'vitest';
import { JiebaTokenizer } from './jieba-tokenizer.js';

describe('JiebaTokenizer', () => {
  let tokenizer: JiebaTokenizer;

  beforeAll(async () => {
    tokenizer = new JiebaTokenizer();
    await tokenizer.init();
  });

  describe('segment', () => {
    it('对中文文本进行分词', () => {
      const result = tokenizer.segment('知识管理工具非常好用');
      expect(result.tokens).toContain('知识');
      expect(result.tokens).toContain('管理');
      expect(result.tokens).toContain('工具');
      expect(result.segmented).toContain('知识');
      expect(result.segmented.split(' ').length).toBeGreaterThan(1);
    });

    it('对纯英文文本按空白拆分', () => {
      const result = tokenizer.segment('hello world foo');
      expect(result.tokens).toEqual(['hello', 'world', 'foo']);
      expect(result.segmented).toBe('hello world foo');
    });

    it('处理中英混合文本', () => {
      const result = tokenizer.segment('使用TypeScript开发前端');
      expect(result.tokens).toContain('typescript');
      expect(result.tokens).toContain('使用');
      expect(result.tokens).toContain('开发');
      expect(result.tokens).toContain('前端');
    });

    it('对空字符串返回空结果', () => {
      const result = tokenizer.segment('');
      expect(result.tokens).toEqual([]);
      expect(result.segmented).toBe('');
    });

    it('对纯空白字符串返回空结果', () => {
      const result = tokenizer.segment('   \n\t  ');
      expect(result.tokens).toEqual([]);
      expect(result.segmented).toBe('');
    });

    it('token 全部转为小写', () => {
      const result = tokenizer.segment('TypeScript React Vue');
      expect(result.tokens).toEqual(['typescript', 'react', 'vue']);
    });

    it('去除重复 token（保序）', () => {
      const result = tokenizer.segment('学习 学习 再学习');
      // "学习" 应只出现一次
      const count = result.tokens.filter((t) => t === '学习').length;
      expect(count).toBe(1);
    });

    it('cut_for_search 模式对长词做细粒度切分', () => {
      // "机器学习" 在搜索模式下应被切为 "机器" + "学习" + "机器学习"
      const result = tokenizer.segment('机器学习模型');
      expect(result.tokens).toContain('机器');
      expect(result.tokens).toContain('学习');
    });
  });

  describe('segmentQuery', () => {
    it('过滤中文停用词', () => {
      const result = tokenizer.segmentQuery('这是一个关于知识管理的工具');
      expect(result.tokens).not.toContain('这');
      expect(result.tokens).not.toContain('是');
      expect(result.tokens).not.toContain('一个');
      expect(result.tokens).not.toContain('的');
      expect(result.tokens).toContain('知识');
      expect(result.tokens).toContain('管理');
      expect(result.tokens).toContain('工具');
    });

    it('过滤英文停用词', () => {
      const result = tokenizer.segmentQuery('this is a test for search');
      expect(result.tokens).not.toContain('this');
      expect(result.tokens).not.toContain('is');
      expect(result.tokens).not.toContain('a');
      expect(result.tokens).not.toContain('for');
      expect(result.tokens).toContain('test');
      expect(result.tokens).toContain('search');
    });

    it('全停用词输入时退回原始 tokens', () => {
      const result = tokenizer.segmentQuery('的了是');
      // 不应返回空结果
      expect(result.tokens.length).toBeGreaterThan(0);
    });
  });
});
