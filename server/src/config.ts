import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/**
 * All of Frank's settings come from environment variables (ADR-001).
 * Azure settings (ADR-009/010) are not read here yet.
 */
export interface FrankConfig {
  /** TCP port for the HTTP server. */
  port: number;
  /** Absolute path to the built console (`<server package root>/public`, ADR-006). */
  publicDir: string;
  /** Frank's version, from package.json. */
  version: string;
}

// A blank value (`PORT=`) counts as unset, so it falls back to the default.
const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const envSchema = z.object({
  PORT: z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ error: "PORT must be a number" })
      .int({ error: "PORT must be a whole number" })
      .min(1, { error: "PORT must be between 1 and 65535" })
      .max(65535, { error: "PORT must be between 1 and 65535" })
      .default(3000),
  ),
});

// Resolved relative to this module, so it is `server/public` under tsx
// (src/config.ts) and `/app/public` in the container (dist/config.js).
// fileURLToPath, not URL.pathname: pathname breaks on Windows drive letters
// and percent-encoded characters, and express.static needs a string.
const defaultPublicDir = fileURLToPath(new URL("../public", import.meta.url));

function readVersion(): string {
  const raw = readFileSync(new URL("../package.json", import.meta.url), "utf8");
  const pkg = JSON.parse(raw) as { version?: unknown };
  return typeof pkg.version === "string" ? pkg.version : "0.0.0";
}

/**
 * Reads and validates the environment. Throws one plain-language Error if
 * anything is wrong, so a bad deploy fails at boot with a readable message.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): FrankConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => {
        const key = issue.path.join(".") || "environment";
        return `${key}: ${issue.message} (got ${JSON.stringify(env[key] ?? "")})`;
      })
      .join("; ");
    throw new Error(`Frank's configuration is invalid. ${problems}`);
  }
  return {
    port: parsed.data.PORT,
    publicDir: defaultPublicDir,
    version: readVersion(),
  };
}

