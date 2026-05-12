import { z } from 'zod';
import { prepareSkillContent, writeSkillFile } from '../../core/learning/skill-generator.js';
import { resolveDbPath } from '../resolve-db.js';

export const skillGenerateToolSchema = {
  mode: z.enum(['prepare', 'write']).default('prepare')
    .describe('prepare=返回知识内容供你分析生成SKILL; write=将生成的SKILL.md写入磁盘'),
  item_id: z.number().describe('知识条目ID（使用 kb_list 查看可用条目）'),
  skill_name: z.string().optional().describe('技能名称，kebab-case（write模式必填，如 "design-patterns"）'),
  skill_content: z.string().optional().describe('完整的SKILL.md文件内容（write模式必填，含YAML frontmatter）'),
};

export const skillGenerateToolName = 'kb_skill_generate';
export const skillGenerateToolDescription =
  '从知识库条目生成 Claude Code Skill。两阶段使用：1) prepare 返回书籍核心内容供你分析提炼；2) write 将你生成的 SKILL.md 写入 ~/.claude/skills/ 使其生效。';

export async function skillGenerateToolHandler(args: {
  mode: string;
  item_id: number;
  skill_name?: string;
  skill_content?: string;
}) {
  const dbPath = resolveDbPath();
  const { mode, item_id, skill_name, skill_content } = args;

  if (mode === 'prepare') {
    try {
      const bundle = prepareSkillContent({ dbPath, itemId: item_id });

      let text = `## 📚 知识提取任务\n\n`;
      text += `请基于以下内容生成一份 SKILL.md 文件。\n\n`;
      text += `### 来源信息\n`;
      text += `- **标题**: ${bundle.title}\n`;
      text += `- **类型**: ${bundle.sourceType}\n`;
      text += `- **字数**: ${bundle.wordCount.toLocaleString()}\n`;
      text += `- **总段落**: ${bundle.totalChunks} (已选取 ${bundle.chunks.length} 段代表性内容)\n`;
      if (bundle.tags.length > 0) text += `- **标签**: ${bundle.tags.join(', ')}\n`;
      if (bundle.metadata?.author) text += `- **作者**: ${bundle.metadata.author}\n`;
      if (bundle.metadata?.description) text += `- **简介**: ${bundle.metadata.description}\n`;

      text += `\n### 内容摘要\n\n`;
      for (const chunk of bundle.chunks) {
        text += `---\n#### 段 ${chunk.index + 1}/${bundle.totalChunks}\n\n${chunk.content}\n\n`;
      }

      text += `---\n\n### 生成要求\n\n`;
      text += `请生成一份 SKILL.md，包含：\n`;
      text += `1. YAML frontmatter: name (kebab-case), description, triggers (3-5个自然语言触发短语)\n`;
      text += `2. 核心原则（5-10条关键洞见）\n`;
      text += `3. 关键概念表（概念 | 定义 | 使用场景）\n`;
      text += `4. 应用模式（具体场景 + 操作指南）\n`;
      text += `5. 快速参考（速查要点）\n\n`;
      text += `生成后请调用 \`kb_skill_generate\` mode=write, item_id=${item_id}, skill_name="<你选择的名称>", skill_content="<完整内容>"。\n`;

      return { content: [{ type: 'text' as const, text }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text' as const, text: `错误: ${message}` }], isError: true };
    }
  }

  if (mode === 'write') {
    if (!skill_name) {
      return { content: [{ type: 'text' as const, text: '错误: write 模式需要 skill_name' }], isError: true };
    }
    if (!skill_content) {
      return { content: [{ type: 'text' as const, text: '错误: write 模式需要 skill_content' }], isError: true };
    }

    try {
      const result = writeSkillFile({
        dbPath,
        itemId: item_id,
        skillName: skill_name,
        content: skill_content,
      });

      const text = `✅ Skill 已生成并保存!\n\n` +
        `- **名称**: ${result.skillName}\n` +
        `- **路径**: ${result.path}\n\n` +
        `现在可以通过 \`/${result.skillName}\` 触发此技能。重启 Claude Code 后生效。`;

      return { content: [{ type: 'text' as const, text }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text' as const, text: `错误: ${message}` }], isError: true };
    }
  }

  return { content: [{ type: 'text' as const, text: `未知模式: ${mode}` }], isError: true };
}
