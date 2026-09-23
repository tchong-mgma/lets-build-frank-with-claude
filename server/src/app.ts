import { existsSync } from "node:fs";
import path from "node:path";
import express, { type ErrorRequestHandler, type Express, type Request } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { FrankConfig } from "./config.js";
import { jsonRpcError } from "./jsonrpc.js";
import { createMcpServer } from "./mcp.js";

const NO_CONSOLE_TEXT =
  "Frank is running. The console isn't built yet (ADR-003). MCP is at POST /mcp.\n";

/**
 * MCP lets `tools/call` omit `arguments`, but SDK 1.30.1 validates `undefined`
 * against the tool's object schema and fails. Normalise it to `{}` here, not
 * with z.preprocess/.default() on the tool schema: that would stop the SDK
 * recognising the object and `tools/list` would publish an empty schema.
 */
function defaultToolArguments(body: unknown): void {
  const messages = Array.isArray(body) ? body : [body];
  for (const message of messages) {
    if (
      message &&
      typeof message === "object" &&
      (message as { method?: unknown }).method === "tools/call"
    ) {
      const params = (message as { params?: Record<string, unknown> }).params;
      if (params && typeof params === "object" && params.arguments === undefined) {
        params.arguments = {};
      }
    }
  }
}

function isReservedPath(req: Request): boolean {
  return req.path === "/mcp" || req.path.startsWith("/mcp/") || req.path === "/healthz";
}

/** Builds Frank's Express app. It never listens, so tests can inject config. */
export function createApp(config: FrankConfig): Express {
  const app = express();
  app.disable("x-powered-by");

  app.get("/healthz", (_req, res) => {
    res.status(200).json({
      status: "ok",
      version: config.version,
      uptimeSeconds: Math.floor(process.uptime()),
    });
  });

  // Stateless Streamable HTTP: a fresh server and transport per request.
  app.post("/mcp", express.json({ limit: "1mb" }), async (req, res, next) => {
    const server = createMcpServer(config);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      defaultToolArguments(req.body);
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      next(error);
    }
  });

  // No sessions and no server-initiated stream: the SDK client treats a 405
  // on GET as "no notifications", which is what we mean.
  const methodNotAllowed = (_req: Request, res: express.Response) => {
    res
      .status(405)
      .set("Allow", "POST")
      .json(jsonRpcError(-32000, "Method not allowed. Frank's MCP endpoint takes POST only."));
  };
  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  // The console (ADR-006) is optional (ADR-003): serve it if it was built.
  const indexHtml = path.join(config.publicDir, "index.html");
  if (existsSync(indexHtml)) {
    app.use(express.static(config.publicDir, { index: "index.html" }));
    // SPA fallback so deep links load the console. Express 5 syntax.
    app.get("/{*splat}", (req, res, next) => {
      if (isReservedPath(req)) return next();
      res.sendFile(indexHtml);
    });
  } else {
    app.get("/", (_req, res) => {
      res.status(200).type("text/plain").send(NO_CONSOLE_TEXT);
    });
  }

  // Last resort. A plain message, never a stack trace.
  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    const info = (err ?? {}) as { type?: string };
    let httpStatus = 500;
    let body = jsonRpcError(-32603, "Frank hit an internal error. Check his logs for details.");
    if (info.type === "entity.parse.failed") {
      httpStatus = 400;
      body = jsonRpcError(-32700, "Parse error: the request body is not valid JSON.");
    } else if (info.type === "entity.too.large") {
      httpStatus = 413;
      body = jsonRpcError(-32600, "The request body is too large (the limit is 1 MB).");
    } else {
      console.error("[frank] request failed:", err);
    }
    if (res.headersSent) return;
    res.status(httpStatus).json(body);
  };
  app.use(errorHandler);

  return app;
}
