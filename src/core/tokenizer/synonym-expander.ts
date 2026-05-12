import type { SynonymEntry, SynonymExpander } from './types.js';

/**
 * 基于内存 Map 的双向同义词扩展器。
 *
 * 同义词组中的任意一个词都可以扩展到组内其他所有词。
 * 例如 group: ["AI", "人工智能", "机器智能"]
 * 查询 "AI" → ["AI", "人工智能", "机器智能"]
 */
export class InMemorySynonymExpander implements SynonymExpander {
  /** term(lowercase) → 同组所有词（含自身） */
  private map = new Map<string, string[]>();

  get empty(): boolean {
    return this.map.size === 0;
  }

  load(entries: SynonymEntry[]): void {
    this.map.clear();

    for (const entry of entries) {
      if (!entry.group || entry.group.length < 2) continue;

      const normalizedGroup = entry.group.map((w) => w.trim().toLowerCase()).filter((w) => w.length > 0);

      if (normalizedGroup.length < 2) continue;

      for (const word of normalizedGroup) {
        // 每个词映射到整组（含自身，用于生成 OR 表达式）
        this.map.set(word, normalizedGroup);
      }
    }
  }

  expand(tokens: string[]): string[][] {
    return tokens.map((token) => {
      const key = token.toLowerCase();
      const group = this.map.get(key);
      if (group) {
        return group;
      }
      return [token];
    });
  }
}
