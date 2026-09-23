import { describe, expect, it, vi } from "vitest";
import { createFrankClient, toOutcome, type McpClientLike } from "../src/frank/client";

function stubSdk(overrides: Partial<McpClientLike> = {}): McpClientLike {
  return {
    listTools: vi.fn(async () => ({
      tools: [{ name: "get_status", description: "Status.", inputSchema: { type: "object", properties: {} } }],
    })),
    callTool: vi.fn(async () => ({ content: [] })),
    ...overrides,
  };
}

const STATUS = { summary: "Frank 0.1.0 is up.", version: "0.1.0", uptimeSeconds: 5, greeting: "Hi" };

describe("toOutcome", () => {
  it("uses structuredContent as the object it already is", () => {
    const outcome = toOutcome({
      structuredContent: STATUS,
      content: [{ type: "text", text: "not the same thing" }],
    });
    expect(outcome).toEqual({ isError: false, data: STATUS });
  });

  it("falls back to parsing the text content as JSON", () => {
    expect(toOutcome({ content: [{ type: "text", text: JSON.stringify(STATUS) }] })).toEqual({
      isError: false,
      data: STATUS,
    });
  });

  it("falls back to raw text when the text isn't JSON", () => {
    expect(toOutcome({ content: [{ type: "text", text: "plain words" }] })).toEqual({
      isError: false,
      data: "plain words",
    });
  });

  it("keeps the SDK's validation-error text as-is and never parses it", () => {
    const text = 'MCP error -32602: Input validation error: Invalid arguments for tool get_status: Unrecognized key: "bogus"';
    const parse = vi.spyOn(JSON, "parse");
    try {
      expect(toOutcome({ isError: true, content: [{ type: "text", text }] })).toEqual({ isError: true, message: text });
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
  });

  it("keeps a thrown tool error's message as-is", () => {
    const text = "get_broken could not complete. Check Frank's logs for details.";
    expect(toOutcome({ isError: true, content: [{ type: "text", text }] })).toEqual({ isError: true, message: text });
  });

  it("ignores structuredContent when isError is set", () => {
    const outcome = toOutcome({ isError: true, structuredContent: STATUS, content: [{ type: "text", text: "{" }] });
    expect(outcome).toEqual({ isError: true, message: "{" });
  });
});

describe("createFrankClient", () => {
  it("connects once, lazily, and reuses the connection", async () => {
    const sdk = stubSdk({ callTool: vi.fn(async () => ({ structuredContent: STATUS, content: [] })) });
    const connect = vi.fn(async () => sdk);
    const client = createFrankClient({ connect });
    expect(connect).not.toHaveBeenCalled();
    await client.listTools();
    await client.getStatus();
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("always sends arguments explicitly", async () => {
    const callTool = vi.fn(async () => ({ structuredContent: STATUS, content: [] }));
    const client = createFrankClient({ connect: async () => stubSdk({ callTool }) });
    await client.getStatus();
    await client.callTool("get_thing", { id: "x" });
    expect(callTool).toHaveBeenNthCalledWith(1, { name: "get_status", arguments: {} });
    expect(callTool).toHaveBeenNthCalledWith(2, { name: "get_thing", arguments: { id: "x" } });
  });

  it("getStatus returns the structured status", async () => {
    const client = createFrankClient({
      connect: async () => stubSdk({ callTool: async () => ({ structuredContent: STATUS, content: [] }) }),
    });
    await expect(client.getStatus()).resolves.toEqual(STATUS);
  });

  it("getStatus rejects with the tool's message when it reports an error", async () => {
    const client = createFrankClient({
      connect: async () =>
        stubSdk({ callTool: async () => ({ isError: true, content: [{ type: "text", text: "nope" }] }) }),
    });
    await expect(client.getStatus()).rejects.toThrow("nope");
  });

  it("callTool returns isError outcomes rather than throwing", async () => {
    const text = "MCP error -32602: Input validation error: bad";
    const client = createFrankClient({
      connect: async () =>
        stubSdk({ callTool: async () => ({ isError: true, content: [{ type: "text", text }] }) }),
    });
    await expect(client.callTool("get_status", { bogus: 1 })).resolves.toEqual({ isError: true, message: text });
  });

  it("reports an unreachable Frank plainly and retries the connection next time", async () => {
    const connect = vi
      .fn<() => Promise<McpClientLike>>()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValue(stubSdk());
    const client = createFrankClient({ connect });
    await expect(client.listTools()).rejects.toThrow("Could not reach Frank: fetch failed");
    await expect(client.listTools()).resolves.toHaveLength(1);
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("maps listTools into ToolInfo", async () => {
    const client = createFrankClient({ connect: async () => stubSdk() });
    await expect(client.listTools()).resolves.toEqual([
      { name: "get_status", description: "Status.", inputSchema: { type: "object", properties: {} } },
    ]);
  });
});
