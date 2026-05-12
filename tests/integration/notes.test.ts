import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeStorage } from '../../src/storage/index.js';
import { NotesRepository } from '../../src/storage/repositories/notes-repository.js';
import {
  createNote,
  getNote,
  updateNote,
  deleteNote,
  listNotes,
  prepareNoteGeneration,
  writeGeneratedNote,
} from '../../src/core/notes/index.js';

const cleanupPaths: string[] = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    const target = cleanupPaths.pop();
    if (target) rmSync(target, { recursive: true, force: true });
  }
});

function setupTestDb() {
  const root = mkdtempSync(join(tmpdir(), 'kb-notes-test-'));
  const dbPath = join(root, 'knowledge.db');
  const knowledgeBasePath = root;
  cleanupPaths.push(root);

  const provider = initializeStorage({ dbPath });
  const db = provider.getConnection();

  // Insert a test book
  db.prepare(
    `INSERT INTO knowledge_items (title, content, source_type, source_path, word_count, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
  ).run('苏菲的世界', '# 苏菲的世界\n\n这是一本关于哲学的书...', 'epub', '/books/sophie.epub', 50000);

  // Insert some chunks
  const itemId = 1;
  for (let i = 0; i < 10; i++) {
    db.prepare(
      `INSERT INTO chunks (knowledge_item_id, chunk_index, content, start_offset, end_offset)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(itemId, i, `这是第${i + 1}段内容。苏格拉底认为哲学是追问的艺术。`, i * 100, (i + 1) * 100);
  }

  provider.close();
  return { dbPath, knowledgeBasePath, itemId };
}

describe('reading notes integration', () => {
  it('创建、获取、更新、删除笔记的完整流程', () => {
    const { dbPath, knowledgeBasePath } = setupTestDb();

    // Create
    const created = createNote({
      dbPath,
      knowledgeBasePath,
      input: {
        title: '苏格拉底的对话法',
        bookId: 1,
        chapter: '第8章',
        type: 'concept',
        tags: ['哲学', '苏格拉底'],
        chunkRefs: [3, 4, 5],
        content: '## 核心观点\n\n苏格拉底通过追问揭示真理。',
        quotedText: ['最聪明的是明白自己无知的人。'],
      },
    });

    expect(created.noteId).toMatch(/^note-\d{8}-[a-f0-9]{3}$/);
    expect(created.title).toBe('苏格拉底的对话法');
    expect(created.type).toBe('concept');
    expect(created.tags).toEqual(['哲学', '苏格拉底']);
    expect(created.filePath).toContain('notes/苏菲的世界/concept-');

    // Verify file was written
    const absolutePath = join(knowledgeBasePath, created.filePath);
    expect(existsSync(absolutePath)).toBe(true);
    const fileContent = readFileSync(absolutePath, 'utf-8');
    expect(fileContent).toContain('---');
    expect(fileContent).toContain('title: "苏格拉底的对话法"');
    expect(fileContent).toContain('> 最聪明的是明白自己无知的人。');

    // Get
    const retrieved = getNote({ dbPath, knowledgeBasePath, noteId: created.noteId });
    expect(retrieved).not.toBeNull();
    expect(retrieved!.frontmatter.title).toBe('苏格拉底的对话法');
    expect(retrieved!.content).toContain('苏格拉底通过追问揭示真理');
    expect(retrieved!.content).toContain('> 最聪明的是明白自己无知的人。');

    // Update
    const updated = updateNote({
      dbPath,
      knowledgeBasePath,
      input: {
        noteId: created.noteId,
        tags: ['哲学', '苏格拉底', '对话法'],
        appendContent: '## 补充\n\n这个方法在现代教育中仍有应用。',
      },
    });

    expect(updated.tags).toEqual(['哲学', '苏格拉底', '对话法']);
    expect(updated.wordCount).toBeGreaterThan(created.wordCount);

    // Verify updated file
    const updatedFile = getNote({ dbPath, knowledgeBasePath, noteId: created.noteId });
    expect(updatedFile!.content).toContain('这个方法在现代教育中仍有应用');

    // Delete
    deleteNote({ dbPath, knowledgeBasePath, noteId: created.noteId });
    expect(existsSync(absolutePath)).toBe(false);
    const deleted = getNote({ dbPath, knowledgeBasePath, noteId: created.noteId });
    expect(deleted).toBeNull();
  });

  it('列出和搜索笔记', () => {
    const { dbPath, knowledgeBasePath } = setupTestDb();

    // Create multiple notes
    createNote({
      dbPath,
      knowledgeBasePath,
      input: { title: '柏拉图的理型论', bookId: 1, type: 'concept', tags: ['哲学'], content: '理型论...' },
    });
    createNote({
      dbPath,
      knowledgeBasePath,
      input: { title: '亚里士多德的逻辑', bookId: 1, type: 'concept', tags: ['哲学', '逻辑'], content: '三段论...' },
    });
    createNote({
      dbPath,
      knowledgeBasePath,
      input: { title: '第一章总结', bookId: 1, type: 'chapter', tags: ['总结'], content: '本章讲述了...' },
    });

    // List all for book
    const all = listNotes({ dbPath, options: { bookId: 1 } });
    expect(all.total).toBe(3);
    expect(all.notes).toHaveLength(3);

    // Filter by type
    const concepts = listNotes({ dbPath, options: { bookId: 1, type: 'concept' } });
    expect(concepts.total).toBe(2);

    // Filter by tag
    const logic = listNotes({ dbPath, options: { tag: '逻辑' } });
    expect(logic.total).toBe(1);
    expect(logic.notes[0].title).toBe('亚里士多德的逻辑');

    // FTS search
    const searchResult = listNotes({ dbPath, options: { query: '柏拉图' } });
    expect(searchResult.notes.length).toBeGreaterThanOrEqual(1);
    expect(searchResult.notes[0].title).toBe('柏拉图的理型论');
  });

  it('auto-generate 两阶段流程', () => {
    const { dbPath, knowledgeBasePath, itemId } = setupTestDb();

    // Phase 1: prepare
    const bundle = prepareNoteGeneration({
      dbPath,
      itemId,
      type: 'chapter',
      chunkIndices: [0, 1, 2],
    });

    expect(bundle.bookTitle).toBe('苏菲的世界');
    expect(bundle.type).toBe('chapter');
    expect(bundle.chunks).toHaveLength(3);
    expect(bundle.chunks[0].content).toContain('苏格拉底');

    // Phase 2: write
    const generated = writeGeneratedNote({
      dbPath,
      knowledgeBasePath,
      itemId,
      title: '第1章：哲学的起源',
      type: 'chapter',
      chapter: '第1章',
      tags: ['哲学', '起源'],
      content: '## 章节概要\n\n本章介绍了哲学的基本问题。',
      chunkRefs: [0, 1, 2],
      quotedText: ['苏格拉底认为哲学是追问的艺术。'],
    });

    expect(generated.noteId).toMatch(/^note-/);
    expect(generated.source).toBe('auto');
    expect(generated.filePath).toContain('notes/苏菲的世界/chapter-');

    // Verify file
    const noteFile = getNote({ dbPath, knowledgeBasePath, noteId: generated.noteId });
    expect(noteFile!.frontmatter.source).toBe('auto');
    expect(noteFile!.content).toContain('本章介绍了哲学的基本问题');
    expect(noteFile!.content).toContain('> 苏格拉底认为哲学是追问的艺术。');
  });

  it('NotesRepository FTS 搜索独立于书籍 FTS', () => {
    const { dbPath } = setupTestDb();
    const provider = initializeStorage({ dbPath });

    try {
      const db = provider.getConnection();
      const repo = new NotesRepository(provider);

      // Insert directly for repo-level testing
      repo.create({
        noteId: 'note-test-001',
        knowledgeItemId: 1,
        title: '存在主义的核心思想',
        type: 'concept',
        filePath: 'notes/test/concept-存在主义.md',
        chapter: null,
        tagsJson: JSON.stringify(['哲学', '存在主义']),
        source: 'manual',
        chunkRefsJson: '[]',
        contentPreview: '存在先于本质是萨特的核心论断',
        wordCount: 100,
      }, db);

      // Search by FTS
      const results = repo.searchByFts('存在主义*', 10, db);
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('存在主义的核心思想');

      // Search by title
      const titleResults = repo.searchByFts('存在主义*', 10, db);
      expect(titleResults).toHaveLength(1);
    } finally {
      provider.close();
    }
  });

  it('更新自动生成的笔记时 source 变为 mixed', () => {
    const { dbPath, knowledgeBasePath, itemId } = setupTestDb();

    // Create auto note
    const auto = writeGeneratedNote({
      dbPath,
      knowledgeBasePath,
      itemId,
      title: 'AI生成的笔记',
      type: 'summary',
      tags: ['自动'],
      content: '这是自动生成的内容。',
      chunkRefs: [0],
      quotedText: [],
    });

    expect(auto.source).toBe('auto');

    // User edits it
    const updated = updateNote({
      dbPath,
      knowledgeBasePath,
      input: {
        noteId: auto.noteId,
        appendContent: '## 我的补充\n\n这是手动补充的内容。',
      },
    });

    expect(updated.source).toBe('mixed');
  });
});
