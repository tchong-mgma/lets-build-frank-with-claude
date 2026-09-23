import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FrankConfig } from "./config.js";
import { registerTools } from "./tools/index.js";

/** A fresh MCP server with every registered tool. One per request (stateless). */
export function createMcpServer(config: FrankConfig): McpServer {
  const server = new McpServer({ name: "frank", version: config.version });
  registerTools(server, { config });
  return server;
}
