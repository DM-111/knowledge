import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  searchToolSchema, searchToolName, searchToolDescription, searchToolHandler,
  listToolSchema, listToolName, listToolDescription, listToolHandler,
  ingestToolSchema, ingestToolName, ingestToolDescription, ingestToolHandler,
  progressToolSchema, progressToolName, progressToolDescription, progressToolHandler,
  skillGenerateToolSchema, skillGenerateToolName, skillGenerateToolDescription, skillGenerateToolHandler,
  quizToolSchema, quizToolName, quizToolDescription, quizToolHandler,
  exerciseToolSchema, exerciseToolName, exerciseToolDescription, exerciseToolHandler,
  noteToolSchema, noteToolName, noteToolDescription, noteToolHandler,
} from './tools/index.js';
import { generateIndex } from '../core/index-generator.js';
import { resolveDbPath } from './resolve-db.js';

const server = new McpServer({
  name: 'kb',
  version: '0.1.0',
});

// Register kb_search
server.tool(
  searchToolName,
  searchToolDescription,
  searchToolSchema,
  async (args) => {
    try {
      return await searchToolHandler(args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text' as const, text: `错误: ${message}` }], isError: true };
    }
  },
);

// Register kb_list
server.tool(
  listToolName,
  listToolDescription,
  listToolSchema,
  async (args) => {
    try {
      return await listToolHandler(args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text' as const, text: `错误: ${message}` }], isError: true };
    }
  },
);

// Register kb_ingest
server.tool(
  ingestToolName,
  ingestToolDescription,
  ingestToolSchema,
  async (args) => {
    try {
      return await ingestToolHandler(args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text' as const, text: `错误: ${message}` }], isError: true };
    }
  },
);

// Register kb_progress
server.tool(
  progressToolName,
  progressToolDescription,
  progressToolSchema,
  async (args) => {
    try {
      return await progressToolHandler(args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text' as const, text: `错误: ${message}` }], isError: true };
    }
  },
);

// Register kb_skill_generate
server.tool(
  skillGenerateToolName,
  skillGenerateToolDescription,
  skillGenerateToolSchema,
  async (args) => {
    try {
      return await skillGenerateToolHandler(args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text' as const, text: `错误: ${message}` }], isError: true };
    }
  },
);

// Register kb_quiz
server.tool(
  quizToolName,
  quizToolDescription,
  quizToolSchema,
  async (args) => {
    try {
      return await quizToolHandler(args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text' as const, text: `错误: ${message}` }], isError: true };
    }
  },
);

// Register kb_exercise
server.tool(
  exerciseToolName,
  exerciseToolDescription,
  exerciseToolSchema,
  async (args) => {
    try {
      return await exerciseToolHandler(args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text' as const, text: `错误: ${message}` }], isError: true };
    }
  },
);

// Register kb_note
server.tool(
  noteToolName,
  noteToolDescription,
  noteToolSchema,
  async (args) => {
    try {
      return await noteToolHandler(args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text' as const, text: `错误: ${message}` }], isError: true };
    }
  },
);

// Register MCP resource: knowledge base index (llms.txt)
server.resource(
  'kb-index',
  'kb://index',
  { description: '知识库结构化索引（llms.txt 格式），包含所有已入库内容的概览', mimeType: 'text/markdown' },
  async () => {
    try {
      const dbPath = resolveDbPath();
      const text = generateIndex({ dbPath });
      return { contents: [{ uri: 'kb://index', text, mimeType: 'text/markdown' }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { contents: [{ uri: 'kb://index', text: `错误: ${message}`, mimeType: 'text/plain' }] };
    }
  },
);

// Start server with stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  process.stderr.write(`kb MCP Server 启动失败: ${error}\n`);
  process.exit(1);
});

export { server };
