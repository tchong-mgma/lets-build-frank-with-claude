import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Frank serves this console and his MCP endpoint from one origin (ADR-006), so
// the console calls /mcp relatively. In dev, Vite proxies those paths to a
// local Frank, which keeps the calls relative here too: no VITE_FRANK_URL, no CORS.
const frank = "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/mcp": frank,
      "/healthz": frank,
    },
  },
  build: {
    outDir: "dist",
    // Cloudscape is large; one vendor chunk is expected, not a problem.
    chunkSizeWarningLimit: 2000,
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}"],
    setupFiles: ["test/setup.ts"],
    // Cloudscape ships ESM that imports its own CSS; let Vite transform it.
    server: { deps: { inline: [/@cloudscape-design\//] } },
    css: false,
  },
});
