import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { initializeStorage } from '../../storage/index.js';
import { SkillRepository } from '../../storage/repositories/skill-repository.js';
import type { ContentMetadata } from '../types.js';

export interface PrepareSkillContentOptions {
  dbPath: string;
  itemId: number;
  maxChunks?: number;
}

export interface SkillContentBundle {
  itemId: number;
  title: string;
  sourceType: string;
  sourcePath: string;
  wordCount: number;
  tags: string[];
  metadata?: ContentMetadata;
  chunks: Array<{ index: number; content: string }>;
  totalChunks: number;
}

export interface WriteSkillOptions {
  dbPath: string;
  itemId: number;
  skillName: string;
  content: string;
  skillsDir?: string;
}

export interface WriteSkillResult {
  path: string;
  skillName: string;
}

/**
 * Prepare content from a knowledge item for LLM analysis.
 * Selects representative chunks (first, last, evenly distributed in between).
 */
export function prepareSkillContent(options: PrepareSkillContentOptions): SkillContentBundle {
  const { dbPath, itemId, maxChunks = 20 } = options;
  const provider = initializeStorage({ dbPath });

  try {
    const db = provider.getConnection();

    // Get item info
    const item = db
      .prepare('SELECT id, title, source_type, source_path, word_count, metadata_json FROM knowledge_items WHERE id = ?')
      .get(itemId) as {
      id: number;
      title: string;
      source_type: string;
      source_path: string;
      word_count: number;
      metadata_json: string | null;
    } | undefined;

    if (!item) {
      throw new Error(`知识条目 #${itemId} 不存在`);
    }

    // Get tags
    const tagRows = db
      .prepare(
        `SELECT t.name FROM tags t
         INNER JOIN item_tags it ON it.tag_id = t.id
         WHERE it.knowledge_item_id = ?`,
      )
      .all(itemId) as Array<{ name: string }>;

    // Get all chunks
    const allChunks = db
      .prepare(
        'SELECT chunk_index, content FROM chunks WHERE knowledge_item_id = ? ORDER BY chunk_index ASC',
      )
      .all(itemId) as Array<{ chunk_index: number; content: string }>;

    // Select representative chunks
    const selectedChunks = selectRepresentativeChunks(allChunks, maxChunks);

    const metadata = item.metadata_json ? JSON.parse(item.metadata_json) as ContentMetadata : undefined;

    return {
      itemId: item.id,
      title: item.title,
      sourceType: item.source_type,
      sourcePath: item.source_path,
      wordCount: item.word_count,
      tags: tagRows.map((t) => t.name),
      metadata,
      chunks: selectedChunks.map((c) => ({ index: c.chunk_index, content: c.content })),
      totalChunks: allChunks.length,
    };
  } finally {
    provider.close();
  }
}

/**
 * Write a generated SKILL.md to disk and record in database.
 */
export function writeSkillFile(options: WriteSkillOptions): WriteSkillResult {
  const { dbPath, itemId, skillName, content, skillsDir } = options;
  const baseDir = skillsDir ?? join(homedir(), '.claude', 'skills');
  const skillDir = join(baseDir, skillName);
  const skillPath = join(skillDir, 'SKILL.md');

  // Write file
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(skillPath, content, 'utf-8');

  // Record in database
  const provider = initializeStorage({ dbPath });
  try {
    const repo = new SkillRepository(provider);
    const db = provider.getConnection();

    // Delete existing if same name
    repo.deleteByName(skillName, db);
    repo.create({ knowledgeItemId: itemId, skillName, skillPath }, db);

    return { path: skillPath, skillName };
  } finally {
    provider.close();
  }
}

/**
 * Select representative chunks: first, last, and evenly distributed middle chunks.
 */
function selectRepresentativeChunks(
  chunks: Array<{ chunk_index: number; content: string }>,
  maxCount: number,
): Array<{ chunk_index: number; content: string }> {
  if (chunks.length <= maxCount) {
    return chunks;
  }

  const selected: Array<{ chunk_index: number; content: string }> = [];

  // Always include first and last
  selected.push(chunks[0]);

  // Evenly distribute the rest
  const middleCount = maxCount - 2;
  const step = (chunks.length - 2) / (middleCount + 1);

  for (let i = 1; i <= middleCount; i++) {
    const idx = Math.round(i * step);
    if (idx > 0 && idx < chunks.length - 1) {
      selected.push(chunks[idx]);
    }
  }

  // Add last
  selected.push(chunks[chunks.length - 1]);

  // Deduplicate and sort
  const seen = new Set<number>();
  return selected
    .filter((c) => {
      if (seen.has(c.chunk_index)) return false;
      seen.add(c.chunk_index);
      return true;
    })
    .sort((a, b) => a.chunk_index - b.chunk_index);
}
