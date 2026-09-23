import { createApp } from "./app.js";
import { loadConfig, type FrankConfig } from "./config.js";

let config: FrankConfig;
try {
  config = loadConfig();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const app = createApp(config);
const server = app.listen(config.port, () => {
  console.log(`Frank ${config.version} listening on http://localhost:${config.port}`);
  console.log(`  MCP:     POST http://localhost:${config.port}/mcp`);
  console.log(`  Health:  GET  http://localhost:${config.port}/healthz`);
});

server.on("error", (error: NodeJS.ErrnoException) => {
  const reason = error.code === "EADDRINUSE" ? `port ${config.port} is already in use` : error.message;
  console.error(`Frank could not start: ${reason}.`);
  process.exit(1);
});

function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down.`);
  server.close(() => process.exit(0));
  // Don't hang forever on a slow client.
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
