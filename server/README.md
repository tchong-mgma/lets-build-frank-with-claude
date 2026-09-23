# Frank's server

Frank is an MCP server (ADR-001): TypeScript on Node 22, the official
`@modelcontextprotocol/sdk`, and an Express app using stateless Streamable HTTP.
He is read-only by policy (ADR-002).

| Route | What it does |
|---|---|
| `POST /mcp` | MCP over Streamable HTTP. Stateless: no sessions. |
| `GET /mcp`, `DELETE /mcp` | 405. There is no server-initiated stream. |
| `GET /healthz` | 200 `{status, version, uptimeSeconds}` for health probes. |
| `GET /` | The console from `public/` if it was built (ADR-006), otherwise a plain "not built yet" page. |

## Run and test

```bash
npm ci
npm run dev        # tsx watch, http://localhost:3000
npm test           # vitest
npm run build      # tsc -> dist/ (dist/index.js is the container's CMD)
npm start          # node dist/index.js

npx vitest run test/config.test.ts   # one file
npx vitest run -t "rejects PORT"     # tests whose name matches
```

Connect Claude Code to a local Frank, then restart `claude`:

```bash
claude mcp add --transport http frank http://localhost:3000/mcp
```

## Environment

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `3000` | Whole number from 1 to 65535. Blank counts as unset. Anything else stops Frank at boot with a plain message. Must match the Dockerfile and `--target-port` in `deploy.yml`. |

Azure settings (ADR-009, ADR-010) aren't read yet.

## Layout

| Path | Purpose |
|---|---|
| `src/index.ts` | Loads config, listens, and shuts down on SIGTERM. |
| `src/config.ts` | `loadConfig(env)`: a zod schema over the environment, plus `publicDir` and `version`. |
| `src/app.ts` | `createApp(config)`: the Express app. It never listens, so tests inject config. |
| `src/mcp.ts` | `createMcpServer(config)`: an `McpServer` with every tool registered. |
| `src/jsonrpc.ts` | `jsonRpcError(code, message)` for responses that never reach the SDK. |
| `src/tools/define.ts` | `defineTool`, which enforces ADR-002 when a tool is defined. |
| `src/tools/index.ts` | The tool registry. |
| `src/tools/get-status.ts` | `get_status`: version, uptime, greeting. |
| `test/` | vitest suites. They run a real SDK client against an ephemeral port. |

## Adding a tool

Read `.claude/skills/frank-tools/SKILL.md` first. Then:

1. Create `src/tools/<verb>-<noun>.ts` that exports `defineTool({ name, description, input, run })`.
   - `input` must be a full `z.object({...}).strict()`, and every property needs `.describe(...)`.
   - `run` returns `{ summary, ...typedFields }`. If it throws, the caller gets a plain `isError` message and the details go to Frank's log.
2. Add it to the `tools` array in `src/tools/index.ts`.
3. Add tests in `test/`. `conventions.test.ts` already checks every registered tool.

`defineTool` throws at boot if a tool's name is not `get_`/`list_`/`search_`/`summarize_` + noun,
if the tool or one of its parameters has no description, or if the input isn't strict.
