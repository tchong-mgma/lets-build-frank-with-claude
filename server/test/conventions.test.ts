import { describe, expect, it } from "vitest";
import { z } from "zod";
import { loadConfig } from "../src/config.js";
import { defineTool, inputJsonSchema, TOOL_VERBS } from "../src/tools/define.js";
import { tools } from "../src/tools/index.js";

const ctx = { config: loadConfig({}) };

/** Runs `fn` with console.error captured, so expected error logs stay quiet. */
async function withCapturedErrors<T>(fn: () => Promise<T>): Promise<{ value: T; logged: unknown[][] }> {
  const logged: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };
  try {
    return { value: await fn(), logged };
  } finally {
    console.error = original;
  }
}

describe("every registered tool follows ADR-002", () => {
  it("includes get_status", () => {
    expect(tools.map((t) => t.name)).toContain("get_status");
  });

  it("has unique names", () => {
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  describe.each(tools.map((t) => [t.name, t] as const))("%s", (_name, tool) => {
    it("is verb_noun with a verb from the closed set", () => {
      const [verb, ...rest] = tool.name.split("_");
      expect(TOOL_VERBS).toContain(verb);
      expect(rest.length).toBeGreaterThan(0);
      expect(tool.name).toMatch(/^[a-z0-9_]+$/);
    });

    it("has a description", () => {
      expect(tool.description.trim().length).toBeGreaterThan(0);
    });

    it("describes every parameter", () => {
      const props = (inputJsonSchema(tool.input).properties ?? {}) as Record<string, { description?: string }>;
      for (const [key, prop] of Object.entries(props)) {
        expect(prop.description, `parameter ${key}`).toBeTruthy();
      }
    });

    it("rejects unknown fields", () => {
      expect(inputJsonSchema(tool.input).additionalProperties).toBe(false);
      expect(tool.input.safeParse({ __unknown_field__: true }).success).toBe(false);
    });
  });

  it("get_status returns a summary plus typed fields", async () => {
    const tool = tools.find((t) => t.name === "get_status")!;
    const result = await tool.call({}, ctx);
    expect(result.isError).toBeFalsy();
    const out = result.structuredContent as Record<string, unknown>;
    expect(typeof out.summary).toBe("string");
    expect(typeof out.version).toBe("string");
    expect(typeof out.uptimeSeconds).toBe("number");
    expect(typeof out.greeting).toBe("string");
  });
});

describe("defineTool refuses tools that break ADR-002", () => {
  const ok = {
    description: "Does a thing.",
    input: z.object({}).strict(),
    run: () => ({ summary: "ok" }),
  };

  it.each([
    "delete_thing",
    "create_thing",
    "update_thing",
    "run_thing",
    "getStatus",
    "get",
    "get-status",
    "fetch_status",
    "Get_status",
  ])("rejects the name %s", (name) => {
    expect(() => defineTool({ ...ok, name })).toThrow(/ADR-002/);
  });

  it("rejects an empty description", () => {
    expect(() => defineTool({ ...ok, name: "get_thing", description: "  " })).toThrow(/description/);
  });

  it("rejects an undescribed parameter", () => {
    expect(() =>
      defineTool({ ...ok, name: "get_thing", input: z.object({ id: z.string() }).strict() }),
    ).toThrow(/missing: id/);
  });

  it("sees a description through .describe().optional()", () => {
    const input = z.object({ id: z.string().describe("The thing's id.").optional() }).strict();
    // zod 4 hides the description from the wrapper node...
    expect(input.shape.id.description).toBeUndefined();
    // ...but it is published, and defineTool reads the published schema.
    expect(() => defineTool({ ...ok, name: "get_thing", input })).not.toThrow();
  });

  it("rejects a non-strict input", () => {
    const input = z.object({ id: z.string().describe("The thing's id.") });
    expect(() => defineTool({ ...ok, name: "get_thing", input: input as any })).toThrow(/unknown fields/);
  });

  it("turns a thrown error into a plain isError result, logged server-side", async () => {
    const tool = defineTool({
      ...ok,
      name: "get_broken",
      run: () => {
        throw new Error("secret internals at /some/path.js:12");
      },
    });
    const { value: result, logged } = await withCapturedErrors(() => tool.call({}, ctx));
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: "text", text: "get_broken could not complete. Check Frank's logs for details." },
    ]);
    expect(logged.length).toBe(1);
  });

  it("treats a result with no summary as an error", async () => {
    const tool = defineTool({ ...ok, name: "get_thing", run: () => ({ nope: 1 }) as any });
    const { value: result } = await withCapturedErrors(() => tool.call({}, ctx));
    expect(result.isError).toBe(true);
  });
});
