import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { connectClient, rawRpc, startFrank, type RunningFrank } from "./helpers.js";

let frank: RunningFrank;
let client: Client;

beforeAll(async () => {
  frank = await startFrank();
  client = await connectClient(frank.url);
});

afterAll(async () => {
  await client?.close();
  await frank?.close();
});

function expectStatusShape(result: any) {
  expect(result.isError).toBeFalsy();
  const out = result.structuredContent;
  expect(typeof out.summary).toBe("string");
  expect(out.summary.length).toBeGreaterThan(0);
  expect(typeof out.version).toBe("string");
  expect(Number.isInteger(out.uptimeSeconds)).toBe(true);
  expect(typeof out.greeting).toBe("string");
  // Clients that ignore structured output get the same JSON as text.
  expect(JSON.parse(result.content[0].text)).toEqual(out);
}

describe("MCP over Streamable HTTP", () => {
  it("completes the handshake as frank", () => {
    expect(client.getServerVersion()?.name).toBe("frank");
    expect(client.getServerCapabilities()?.tools).toBeDefined();
  });

  it("lists get_status with a strict, described schema", async () => {
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "get_status");
    expect(tool).toBeDefined();
    expect(tool!.description).toBeTruthy();
    expect(tool!.inputSchema.type).toBe("object");
    expect(tool!.inputSchema.additionalProperties).toBe(false);
  });

  it("get_status succeeds with arguments omitted", async () => {
    const { status, message } = await rawRpc(frank.url, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "get_status" },
    });
    expect(status).toBe(200);
    expect(message.error).toBeUndefined();
    expectStatusShape(message.result);
  });

  it("get_status succeeds with empty arguments", async () => {
    const result = await client.callTool({ name: "get_status", arguments: {} });
    expectStatusShape(result);
  });

  it("get_status rejects an unknown argument with the SDK's validation text", async () => {
    const result: any = await client.callTool({ name: "get_status", arguments: { bogus: 1 } });
    expect(result.isError).toBe(true);
    const text: string = result.content[0].text;
    expect(text).toContain("Input validation error");
    expect(text).toContain("get_status");
    expect(text).not.toMatch(/\n\s+at /);
  });
});

describe("HTTP routes", () => {
  it("GET /healthz returns 200", async () => {
    const res = await fetch(`${frank.url}/healthz`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe("ok");
    expect(typeof body.version).toBe("string");
    expect(Number.isInteger(body.uptimeSeconds)).toBe(true);
  });

  it("GET /mcp returns 405 with a JSON-RPC error", async () => {
    const res = await fetch(`${frank.url}/mcp`);
    expect(res.status).toBe(405);
    const body = (await res.json()) as any;
    expect(body.jsonrpc).toBe("2.0");
    expect(body.error.message).toMatch(/Method not allowed/);
  });

  it("DELETE /mcp returns 405", async () => {
    const res = await fetch(`${frank.url}/mcp`, { method: "DELETE" });
    expect(res.status).toBe(405);
  });

  it("an unparseable body gets a plain JSON-RPC parse error, not a stack trace", async () => {
    const res = await fetch(`${frank.url}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe(-32700);
    expect(JSON.stringify(body)).not.toMatch(/\bat .*\.(js|ts):\d+/);
  });
});
