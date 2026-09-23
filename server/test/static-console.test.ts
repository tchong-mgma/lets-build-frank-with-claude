import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { rawRpc, startFrank } from "./helpers.js";

const tempDirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "frank-public-"));
  tempDirs.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

const INDEX = "<!doctype html><title>Frank console</title><div id=root></div>";

async function expectMcpWorks(url: string) {
  const { status, message } = await rawRpc(url, {
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: { name: "get_status", arguments: {} },
  });
  expect(status).toBe(200);
  expect(message.result.structuredContent.summary).toBeTruthy();
}

describe("with a built console", () => {
  it("serves index.html at / and at deep links, and MCP still works", async () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, "index.html"), INDEX);
    const frank = await startFrank({ publicDir: dir });
    try {
      for (const route of ["/", "/tools/x"]) {
        const res = await fetch(`${frank.url}${route}`);
        expect(res.status, route).toBe(200);
        expect(await res.text()).toContain("Frank console");
      }
      const health = await fetch(`${frank.url}/healthz`);
      expect(((await health.json()) as { status: string }).status).toBe("ok");
      expect((await fetch(`${frank.url}/mcp`)).status).toBe(405);
      await expectMcpWorks(frank.url);
    } finally {
      await frank.close();
    }
  });
});

describe("without a console", () => {
  it.each([
    ["an empty public dir", () => tempDir()],
    ["a missing public dir", () => path.join(tempDir(), "does-not-exist")],
  ])("says so at / with %s, and MCP still works", async (_label, makeDir) => {
    const frank = await startFrank({ publicDir: makeDir() });
    try {
      const res = await fetch(`${frank.url}/`);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("The console isn't built yet (ADR-003)");
      await expectMcpWorks(frank.url);
    } finally {
      await frank.close();
    }
  });
});
