import { z } from 'zod';
import {
  createNote,
  getNote,
  updateNote,
  deleteNote,
  listNotes,
  prepareNoteGeneration,
  writeGeneratedNote,
} from '../../core/notes/index.js';
import type { NoteType } from '../../core/notes/index.js';
import { resolveDbPath } from '../resolve-db.js';
import { loadConfig, assertRequiredConfig } from '../../config/index.js';

export const noteToolSchema = {
  action: z.enum(['create', 'get', 'list', 'update', 'delete', 'generate'])
    .describe('create=创建笔记; get=获取笔记全文; list=列出/搜索笔记; update=编辑笔记; delete=删除笔记; generate=AI两阶段生成笔记'),

  // --- create / update ---
  title: z.string().optional()
    .describe('笔记标题（create必填, update可选）'),
  book_id: z.number().optional()
    .describe('关联的知识条目ID（create/generate时使用）'),
  chapter: z.string().optional()
    .describe('章节名称（可选）'),
  type: z.enum(['concept', 'chapter', 'summary', 'thought']).optional()
    .describe('笔记类型: concept=概念笔记, chapter=章节笔记, summary=总结, thought=思考感悟'),
  tags: z.array(z.string()).optional()
    .describe('标签列表'),
  content: z.string().optional()
    .describe('笔记正文 Markdown（create必填, update替换全文）'),
  append_content: z.string().optional()
    .describe('追加内容到笔记末尾（update时使用）'),
  quoted_text: z.array(z.string()).optional()
    .describe('引用的原文段落（自动转为 blockquote 格式嵌入笔记）'),
  chunk_refs: z.array(z.number()).optional()
    .describe('引用的 chunk 索引列表（用于溯源定位）'),

  // --- get / update / delete ---
  note_id: z.string().optional()
    .describe('笔记ID（get/update/delete时必填）'),

  // --- list ---
  query: z.string().optional()
    .describe('搜索关键词（list时走FTS全文检索）'),
  limit: z.number().optional()
    .describe('返回条数限制（默认20）'),

  // --- generate ---
  mode: z.enum(['prepare', 'write']).optional()
    .describe('generate专用: prepare=提取内容供分析; write=写入生成的笔记'),
  chunk_indices: z.array(z.number()).optional()
    .describe('generate时指定chunk范围（不填则自动选取代表性段落）'),
};

export const noteToolName = 'kb_note';
export const noteToolDescription =
  '读书笔记管理。支持创建/查看/编辑/删除读书笔记，以及从书籍内容自动生成笔记。' +
  '笔记存储为独立 Markdown 文件（含原文引用blockquote），可独立阅读和编辑。';

function resolveKnowledgeBasePath(): string {
  const { config } = loadConfig();
  assertRequiredConfig(config, ['knowledgeBasePath'], 'kb_note');
  return config.knowledgeBasePath!;
}

export async function noteToolHandler(args: {
  action: string;
  title?: string;
  book_id?: number;
  chapter?: string;
  type?: string;
  tags?: string[];
  content?: string;
  append_content?: string;
  quoted_text?: string[];
  chunk_refs?: number[];
  note_id?: string;
  query?: string;
  limit?: number;
  mode?: string;
  chunk_indices?: number[];
}) {
  const dbPath = resolveDbPath();
  const knowledgeBasePath = resolveKnowledgeBasePath();

  switch (args.action) {
    case 'create': {
      if (!args.title) {
        return { content: [{ type: 'text' as const, text: '错误: 创建笔记需要 title' }], isError: true };
      }
      if (!args.content) {
        return { content: [{ type: 'text' as const, text: '错误: 创建笔记需要 content' }], isError: true };
      }

      const noteType = (args.type as NoteType) ?? 'thought';
      const result = createNote({
        dbPath,
        knowledgeBasePath,
        input: {
          title: args.title,
          bookId: args.book_id,
          chapter: args.chapter,
          type: noteType,
          tags: args.tags,
          chunkRefs: args.chunk_refs,
          content: args.content,
          quotedText: args.quoted_text,
        },
      });

      const text = `✅ 笔记已创建\n\n` +
        `- **ID**: ${result.noteId}\n` +
        `- **标题**: ${result.title}\n` +
        `- **类型**: ${result.type}\n` +
        `- **文件**: ${result.filePath}\n` +
        `- **字数**: ${result.wordCount}\n`;

      return { content: [{ type: 'text' as const, text }] };
    }

    case 'get': {
      if (!args.note_id) {
        return { content: [{ type: 'text' as const, text: '错误: 获取笔记需要 note_id' }], isError: true };
      }

      const noteFile = getNote({ dbPath, knowledgeBasePath, noteId: args.note_id });
      if (!noteFile) {
        return { content: [{ type: 'text' as const, text: `笔记不存在: ${args.note_id}` }], isError: true };
      }

      let text = `# ${noteFile.frontmatter.title}\n\n`;
      text += `📖 ${noteFile.frontmatter.book}`;
      if (noteFile.frontmatter.chapter) text += ` > ${noteFile.frontmatter.chapter}`;
      text += `\n`;
      text += `🏷️ ${noteFile.frontmatter.tags.join(', ') || '无标签'}\n`;
      text += `📝 类型: ${noteFile.frontmatter.type} | 来源: ${noteFile.frontmatter.source}\n`;
      text += `📅 创建: ${noteFile.frontmatter.created_at} | 更新: ${noteFile.frontmatter.updated_at}\n\n`;
      text += `---\n\n`;
      text += noteFile.content;

      return { content: [{ type: 'text' as const, text }] };
    }

    case 'list': {
      const result = listNotes({
        dbPath,
        options: {
          bookId: args.book_id,
          type: args.type as NoteType | undefined,
          tag: args.tags?.[0],
          query: args.query,
          limit: args.limit ?? 20,
        },
      });

      if (result.notes.length === 0) {
        return { content: [{ type: 'text' as const, text: '没有找到匹配的笔记。' }] };
      }

      let text = `## 读书笔记 (${result.total} 条)\n\n`;
      for (const note of result.notes) {
        text += `### ${note.title}\n`;
        text += `- ID: \`${note.noteId}\` | 类型: ${note.type} | 来源: ${note.source}\n`;
        text += `- 文件: ${note.filePath}\n`;
        if (note.tags.length > 0) text += `- 标签: ${note.tags.join(', ')}\n`;
        if (note.contentPreview) text += `- 预览: ${note.contentPreview.slice(0, 100)}...\n`;
        text += `\n`;
      }

      if (result.total > result.notes.length) {
        text += `\n_显示 ${result.notes.length}/${result.total} 条，使用 limit/offset 翻页_`;
      }

      return { content: [{ type: 'text' as const, text }] };
    }

    case 'update': {
      if (!args.note_id) {
        return { content: [{ type: 'text' as const, text: '错误: 更新笔记需要 note_id' }], isError: true };
      }

      const result = updateNote({
        dbPath,
        knowledgeBasePath,
        input: {
          noteId: args.note_id,
          title: args.title,
          chapter: args.chapter,
          type: args.type as NoteType | undefined,
          tags: args.tags,
          content: args.content,
          appendContent: args.append_content,
        },
      });

      const text = `✅ 笔记已更新\n\n` +
        `- **ID**: ${result.noteId}\n` +
        `- **标题**: ${result.title}\n` +
        `- **字数**: ${result.wordCount}\n` +
        `- **更新时间**: ${result.updatedAt}\n`;

      return { content: [{ type: 'text' as const, text }] };
    }

    case 'delete': {
      if (!args.note_id) {
        return { content: [{ type: 'text' as const, text: '错误: 删除笔记需要 note_id' }], isError: true };
      }

      deleteNote({ dbPath, knowledgeBasePath, noteId: args.note_id });

      return { content: [{ type: 'text' as const, text: `✅ 笔记 ${args.note_id} 已删除` }] };
    }

    case 'generate': {
      const mode = args.mode ?? 'prepare';

      if (mode === 'prepare') {
        if (!args.book_id) {
          return { content: [{ type: 'text' as const, text: '错误: generate prepare 需要 book_id' }], isError: true };
        }

        const noteType = (args.type as NoteType) ?? 'chapter';
        const bundle = prepareNoteGeneration({
          dbPath,
          itemId: args.book_id,
          type: noteType,
          chunkIndices: args.chunk_indices,
          chapter: args.chapter,
        });

        let text = `## 📖 读书笔记生成任务\n\n`;
        text += `请基于以下内容生成读书笔记。\n\n`;
        text += `### 来源信息\n`;
        text += `- **书名**: ${bundle.bookTitle}\n`;
        text += `- **笔记类型**: ${bundle.type}\n`;
        if (bundle.chapter) text += `- **章节**: ${bundle.chapter}\n`;
        text += `- **总段落**: ${bundle.totalChunks} (已选取 ${bundle.chunks.length} 段)\n`;

        if (bundle.existingNotes.length > 0) {
          text += `\n### 已有笔记（避免重复）\n\n`;
          for (const n of bundle.existingNotes) {
            text += `- [${n.type}] ${n.title}\n`;
          }
        }

        text += `\n### 内容\n\n`;
        for (const chunk of bundle.chunks) {
          text += `---\n#### 段 ${chunk.index + 1}/${bundle.totalChunks}\n\n${chunk.content}\n\n`;
        }

        text += `---\n\n### 生成要求\n\n`;
        text += `请生成一份读书笔记，包含：\n`;
        text += `1. 核心要点（3-5条关键观点）\n`;
        text += `2. 原文引用（选取2-4段最有代表性的原文，用 > blockquote 格式）\n`;
        text += `3. 个人思考/关联（与其他知识的联系、应用场景）\n\n`;
        text += `生成后请调用：\n`;
        text += `\`\`\`\nkb_note action=generate mode=write book_id=${bundle.itemId} `;
        text += `title="<标题>" type="${noteType}" `;
        text += `tags=[...] content="<正文>" quoted_text=[...] chunk_refs=[...]\n\`\`\`\n`;

        return { content: [{ type: 'text' as const, text }] };
      }

      if (mode === 'write') {
        if (!args.book_id) {
          return { content: [{ type: 'text' as const, text: '错误: generate write 需要 book_id' }], isError: true };
        }
        if (!args.title) {
          return { content: [{ type: 'text' as const, text: '错误: generate write 需要 title' }], isError: true };
        }
        if (!args.content) {
          return { content: [{ type: 'text' as const, text: '错误: generate write 需要 content' }], isError: true };
        }

        const noteType = (args.type as NoteType) ?? 'chapter';
        const result = writeGeneratedNote({
          dbPath,
          knowledgeBasePath,
          itemId: args.book_id,
          title: args.title,
          type: noteType,
          chapter: args.chapter,
          tags: args.tags ?? [],
          content: args.content,
          chunkRefs: args.chunk_refs ?? [],
          quotedText: args.quoted_text ?? [],
        });

        const text = `✅ 读书笔记已生成\n\n` +
          `- **ID**: ${result.noteId}\n` +
          `- **标题**: ${result.title}\n` +
          `- **类型**: ${result.type}\n` +
          `- **文件**: ${result.filePath}\n` +
          `- **字数**: ${result.wordCount}\n\n` +
          `笔记已保存为独立 Markdown 文件，可直接打开阅读或编辑。`;

        return { content: [{ type: 'text' as const, text }] };
      }

      return { content: [{ type: 'text' as const, text: `未知 mode: ${mode}` }], isError: true };
    }

    default:
      return { content: [{ type: 'text' as const, text: `未知 action: ${args.action}` }], isError: true };
  }
}
