import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  searchToolSchema, searchToolName, searchToolDescription, searchToolHandler,
  listToolSchema, listToolName, listToolDescription, listToolHandler,
  ingestToolSchema, ingestToolName, ingestToolDescription, ingestToolHandler,
} from './tools/index.js';

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
