import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { FrankConfig } from "../config.js";

/**
 * ADR-002 in one place. Every tool goes through `defineTool`, which refuses a
 * tool that breaks the conventions at definition time, so a bad tool fails at
 * boot and in tests rather than in review.
 */

/** The closed verb set. Adding a verb means superseding ADR-002. */
export const TOOL_VERBS = ["get", "list", "search", "summarize"] as const;

export const TOOL_NAME_PATTERN = /^(get|list|search|summarize)_[a-z0-9]+(_[a-z0-9]+)*$/;

/** What a tool is given besides its input. */
export interface ToolContext {
  config: FrankConfig;
}

/** Every tool returns a human/model-readable summary plus typed detail fields. */
export type ToolOutput = { summary: string } & Record<string, unknown>;

// A strict z.object({...}). Raw shapes are not accepted: the SDK wraps them in
// a non-strict object that silently drops unknown keys.
type ToolInput = z.ZodObject<z.ZodRawShape, z.core.$strict>;

export interface ToolSpec<I extends ToolInput> {
  name: string;
  description: string;
  input: I;
  run: (input: z.output<I>, ctx: ToolContext) => ToolOutput | Promise<ToolOutput>;
}

export interface FrankTool {
  readonly name: string;
  readonly description: string;
  readonly input: ToolInput;
  /** Calls the tool and shapes the MCP result. Never throws. */
  call(input: unknown, ctx: ToolContext): Promise<CallToolResult>;
  register(server: McpServer, ctx: ToolContext): void;
}

/** JSON Schema for a tool's input, as a client would see it. */
export function inputJsonSchema(input: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(input, { io: "input" }) as Record<string, unknown>;
}

function assertConventions(spec: ToolSpec<ToolInput>): void {
  const where = `Tool "${spec.name}"`;
  if (!TOOL_NAME_PATTERN.test(spec.name)) {
    throw new Error(
      `${where} breaks ADR-002: names are verb_noun in snake_case, with the verb one of ${TOOL_VERBS.join(", ")}.`,
    );
  }
  if (typeof spec.description !== "string" || spec.description.trim() === "") {
    throw new Error(`${where} breaks ADR-002: it needs a description.`);
  }
  if (!(spec.input instanceof z.ZodObject)) {
    throw new Error(`${where} breaks ADR-002: its input must be a z.object({...}).strict().`);
  }
  // Read descriptions from the published JSON Schema, not from `.description`
  // on the zod node: in zod 4, `z.string().describe("x").optional().description`
  // is undefined even though the description is published.
  const schema = inputJsonSchema(spec.input);
  if (schema.additionalProperties !== false) {
    throw new Error(`${where} breaks ADR-002: its input must reject unknown fields (use .strict()).`);
  }
  const properties = (schema.properties ?? {}) as Record<string, { description?: unknown }>;
  const undescribed = Object.entries(properties)
    .filter(([, prop]) => typeof prop.description !== "string" || prop.description.trim() === "")
    .map(([key]) => key);
  if (undescribed.length > 0) {
    throw new Error(`${where} breaks ADR-002: every parameter needs a description (missing: ${undescribed.join(", ")}).`);
  }
}

function errorResult(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

export function defineTool<I extends ToolInput>(spec: ToolSpec<I>): FrankTool {
  assertConventions(spec as unknown as ToolSpec<ToolInput>);

  // Input validation happens in the SDK before this runs; its own isError text
  // ("MCP error -32602: Input validation error: ...") reaches the caller.
  const call = async (input: unknown, ctx: ToolContext): Promise<CallToolResult> => {
    try {
      const output = await spec.run(input as z.output<I>, ctx);
      if (!output || typeof output.summary !== "string") {
        throw new Error(`tool ${spec.name} returned no summary string`);
      }
      return {
        structuredContent: output,
        content: [{ type: "text", text: JSON.stringify(output) }],
      };
    } catch (error) {
      // The full error stays in Frank's log; the caller gets a plain sentence.
      console.error(`[frank] ${spec.name} failed:`, error);
      return errorResult(`${spec.name} could not complete. Check Frank's logs for details.`);
    }
  };

  return {
    name: spec.name,
    description: spec.description,
    input: spec.input,
    call,
    register(server, ctx) {
      server.registerTool(
        spec.name,
        { description: spec.description, inputSchema: spec.input as ToolInput },
        async (args: unknown) => call(args, ctx),
      );
    },
  };
}
