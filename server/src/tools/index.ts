import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FrankTool, ToolContext } from "./define.js";
import { getStatus } from "./get-status.js";

/** The single registry. A tool that isn't listed here doesn't exist. */
export const tools: readonly FrankTool[] = [getStatus];

export function registerTools(server: McpServer, ctx: ToolContext): void {
  for (const tool of tools) {
    tool.register(server, ctx);
  }
}
