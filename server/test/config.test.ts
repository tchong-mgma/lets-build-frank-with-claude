import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("defaults PORT to 3000", () => {
    expect(loadConfig({}).port).toBe(3000);
  });

  it("treats a blank PORT as unset", () => {
    expect(loadConfig({ PORT: "" }).port).toBe(3000);
    expect(loadConfig({ PORT: "   " }).port).toBe(3000);
  });

  it("accepts an override", () => {
    expect(loadConfig({ PORT: "8080" }).port).toBe(8080);
  });

  it.each(["0", "-1", "3.5", "70000", "abc"])("rejects PORT=%s with a plain message", (value) => {
    let thrown: unknown;
    try {
      loadConfig({ PORT: value });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toMatch(/^Frank's configuration is invalid\. PORT: /);
    expect(message).toContain(JSON.stringify(value));
    expect(message).not.toMatch(/\n\s+at /); // no stack trace in the message
  });

  it("resolves publicDir to an absolute string path ending in public", () => {
    const { publicDir } = loadConfig({});
    expect(typeof publicDir).toBe("string");
    expect(path.isAbsolute(publicDir)).toBe(true);
    expect(path.basename(publicDir)).toBe("public");
  });

  it("reads the version from package.json", () => {
    expect(loadConfig({}).version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
