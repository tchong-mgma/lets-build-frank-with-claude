import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "../src/app.js";
import { loadConfig, type FrankConfig } from "../src/config.js";

export interface RunningFrank {
  url: string;
  close(): Promise<void>;
}

/** Boots Frank on an ephemeral port. Tests only; production listens on PORT. */
export async function startFrank(overrides: Partial<FrankConfig> = {}): Promise<RunningFrank> {
  const config = { ...loadConfig({}), ...overrides };
  const app = createApp(config);
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

/** A real SDK client connected over Streamable HTTP. */
export async function connectClient(baseUrl: string): Promise<Client> {
  const client = new Client({ name: "frank-tests", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", baseUrl)));
  return client;
}

/**
 * One raw JSON-RPC request, for cases the SDK client won't produce (such as a
 * tools/call with no `arguments`). Handles both JSON and SSE responses.
 */
export async function rawRpc(baseUrl: string, body: unknown): Promise<{ status: number; message: any }> {
  const res = await fetch(new URL("/mcp", baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("text/event-stream")) {
    const data = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);
    return { status: res.status, message: data.length ? JSON.parse(data[data.length - 1]!) : undefined };
  }
  return { status: res.status, message: text ? JSON.parse(text) : undefined };
}
