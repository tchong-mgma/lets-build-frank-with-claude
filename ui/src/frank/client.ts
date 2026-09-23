import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/**
 * The console's only way to reach Frank: MCP over Streamable HTTP at /mcp,
 * relative to wherever the console was served from (ADR-006). It holds no
 * secrets (ADR-003); it can only do what Frank's read-only tools allow.
 */

/** A JSON Schema object, as published by tools/list. */
export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  description?: string;
  additionalProperties?: boolean | JsonSchema;
  [key: string]: unknown;
}

export interface ToolInfo {
  name: string;
  description?: string;
  inputSchema: JsonSchema;
}

export interface Status {
  summary: string;
  version: string;
  uptimeSeconds: number;
  greeting: string;
}

/** A tool call either failed with a plain message, or returned data. */
export type ToolCallOutcome =
  | { isError: true; message: string }
  | { isError: false; data: unknown };

export interface FrankClient {
  getStatus(): Promise<Status>;
  listTools(): Promise<ToolInfo[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<ToolCallOutcome>;
}

/** The slice of the SDK Client this adapter uses. Tests stub it. */
export interface McpClientLike {
  listTools(): Promise<{ tools: Array<{ name: string; description?: string; inputSchema: unknown }> }>;
  callTool(params: { name: string; arguments: Record<string, unknown> }): Promise<unknown>;
}

export interface FrankClientOptions {
  /** Where Frank's MCP endpoint is, resolved against the page's origin. */
  endpoint?: string;
  /** Replaces the real SDK connection. Tests only. */
  connect?: () => Promise<McpClientLike>;
}

interface CallResultLike {
  isError?: boolean;
  structuredContent?: unknown;
  content?: Array<{ type: string; text?: string }>;
}

function textOf(result: CallResultLike): string {
  return (result.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("\n");
}

/**
 * Turns an MCP CallToolResult into an outcome, in this order:
 * 1. isError: the text content as-is. Never parsed.
 * 2. structuredContent: used as the object it already is.
 * 3. Otherwise: the text parsed as JSON, or the raw text if it isn't JSON.
 */
export function toOutcome(raw: unknown): ToolCallOutcome {
  const result = (raw ?? {}) as CallResultLike;
  if (result.isError === true) {
    return { isError: true, message: textOf(result) || "The tool reported an error with no message." };
  }
  if (result.structuredContent !== undefined && result.structuredContent !== null) {
    return { isError: false, data: result.structuredContent };
  }
  const text = textOf(result);
  try {
    return { isError: false, data: JSON.parse(text) };
  } catch {
    return { isError: false, data: text };
  }
}

function plainMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `Could not reach Frank: ${detail}`;
}

export function createFrankClient(options: FrankClientOptions = {}): FrankClient {
  const endpoint = options.endpoint ?? "/mcp";
  const connect =
    options.connect ??
    (async () => {
      const client = new Client({ name: "frank-console", version: "0.1.0" });
      const url = new URL(endpoint, window.location.origin);
      await client.connect(new StreamableHTTPClientTransport(url));
      return client as unknown as McpClientLike;
    });

  // Connect once, lazily. A failure is forgotten so the next call (Retry) tries again.
  let connection: Promise<McpClientLike> | undefined;
  const session = (): Promise<McpClientLike> => {
    connection ??= connect().catch((error: unknown) => {
      connection = undefined;
      throw error;
    });
    return connection;
  };

  async function withSession<T>(fn: (client: McpClientLike) => Promise<T>): Promise<T> {
    try {
      return await fn(await session());
    } catch (error) {
      connection = undefined;
      throw new Error(plainMessage(error));
    }
  }

  const callTool = (name: string, args: Record<string, unknown>) =>
    // `arguments` is always sent explicitly, `{}` when there are none.
    withSession(async (client) => toOutcome(await client.callTool({ name, arguments: args ?? {} })));

  return {
    callTool,

    listTools: () =>
      withSession(async (client) => {
        const { tools } = await client.listTools();
        return tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: (tool.inputSchema ?? { type: "object" }) as JsonSchema,
        }));
      }),

    async getStatus() {
      const outcome = await callTool("get_status", {});
      if (outcome.isError) throw new Error(outcome.message);
      return outcome.data as Status;
    },
  };
}
