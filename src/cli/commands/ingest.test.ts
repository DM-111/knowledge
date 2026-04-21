import { describe, expect, it } from 'vitest';
import { normalizeNoteOption, parseTagOption } from './ingest.js';

describe('ingest command helpers', () => {
  it('将 --tag 解析为去空白、去空项、去重且保持顺序的标签数组', () => {
    expect(parseTagOption('typescript, 学习笔记, ,typescript,  架构 ')).toEqual([
      'typescript',
      '学习笔记',
      '架构',
    ]);
  });

  it('缺少 --tag 时返回空数组', () => {
    expect(parseTagOption(undefined)).toEqual([]);
    expect(parseTagOption('')).toEqual([]);
  });

  it('将 --note 归一化为可选备注', () => {
    expect(normalizeNoteOption('  关于泛型的总结  ')).toBe('关于泛型的总结');
    expect(normalizeNoteOption('   ')).toBeUndefined();
    expect(normalizeNoteOption(undefined)).toBeUndefined();
  });
});
