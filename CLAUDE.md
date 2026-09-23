# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

The classroom repo for a one-day course. Students fork it and have agents build
**Frank**: an MCP server plus a Cloudscape web console, shipped as one container
to Azure Container Apps. `server/` and `ui/` start empty (only `.gitkeep`) on
purpose. They are built from the ADRs in `docs/adr/`, so **read the relevant ADRs
before writing code**. Implementation requests usually name an ADR by number
("implement ADR-009").

Frank has no LLM of his own. He is a tool provider that MCP clients (Claude Code,
Claude Desktop, the console) call. ADR-001 mentions "Anthropic settings introduced
by later ADRs", but no ADR introduces any. Adding a model dependency needs an ADR.

## Commands

These are the contracts the Dockerfile and CI rely on:

- `server/` and `ui/` are each a self-contained npm package with `npm run dev`,
  `npm test`, and `npm run build`. Both CI and the Dockerfile run
  `npm ci && npm test && npm run build`.
- **Commit `package-lock.json`.** The PR jobs in `deploy.yml` skip a package
  (and report success) until its lockfile exists. The Dockerfile also needs
  `server/package-lock.json`.
- The server's build output must include `dist/index.js` (the container's `CMD`).
- Both packages test with **vitest** (`npm test` is `vitest run`; the console
  uses jsdom). To run one file or the tests whose name matches, from inside
  `server/` or `ui/`:

  ```bash
  npx vitest run test/config.test.ts
  npx vitest run -t "rejects PORT"
  ```

Full image, locally, from the repo root:

```bash
docker build -t frank .
docker run -p 3000:3000 frank          # MCP: POST /mcp, health: GET /healthz, console: /
claude mcp add --transport http frank http://localhost:3000/mcp   # then restart claude
```

## Effective architecture

Several ADRs are partly superseded, so no single ADR gives the whole picture.
Read each ADR's **Status** line: the ADR files are authoritative, and the tables
in `README.md` can lag behind them. As of ADR-010, the combined result is:

- **Server (ADR-001):** TypeScript on Node 22, the official `@modelcontextprotocol/sdk`,
  and an Express app using the Streamable HTTP transport at `POST /mcp`, plus
  `GET /healthz`. All config comes from env vars. `PORT` defaults to 3000 and must
  match the Dockerfile and `--target-port 3000` in `deploy.yml`.
- **One container (ADR-006):** Frank's Express app also serves the built console
  as static files at `/`. At runtime the console lives at `<server package root>/public`
  (the Dockerfile copies `ui/dist` into `/app/public`). The console calls `/mcp`
  **relatively**. There is no `VITE_FRANK_URL`, no CORS, and no Static Web Apps.
- **The console is optional.** It is built late in the class. The Dockerfile
  tolerates an empty `ui/`, and the server must handle a missing `public/` by
  saying so at `/` instead of crashing.
- **Console (ADR-003):** React 18, Vite, and Cloudscape components only. It has
  two pages: *Overview* (`get_status`) and *Tools* (forms generated from each
  tool's input schema). It holds no secrets.
- **Azure access (ADR-010, which supersedes ADR-006's credential model):** the
  deploy injects `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`,
  `AZURE_SUBSCRIPTION_ID`, and `AZURE_RESOURCE_GROUP`. Frank authenticates with
  `DefaultAzureCredential`. There is no managed identity. The resource group comes
  from the environment at boot and is **never** a tool parameter, so a caller
  can't point Frank at a different group.
- **No auth on `/mcp`:** ADR-007 was rejected. Don't add authentication without
  a new ADR.

## Tool conventions (ADR-002, policy, not style)

Detailed guidance is in `.claude/skills/frank-tools/SKILL.md`. The essentials:

- Tool names are `verb_noun` in snake_case, with the verb from the closed set
  `get` / `list` / `search` / `summarize`. `create_`, `update_`, `delete_`, and
  `run_` are **out of policy** and need a superseding ADR.
- **Read-only:** no tool may change Azure, GitHub, or the filesystem outside temp
  space. The deploy credential is Contributor, so this rule is the only thing
  keeping Frank read-only.
- Input schemas use strict `zod` (unknown fields rejected), and every parameter
  has a description. Output is JSON with a top-level `summary` string plus typed
  fields. Errors return `isError: true` with a plain message, never a stack trace.
- Each tool gets its own module in `server/src/tools/` and is registered in
  `server/src/tools/index.ts`, with tests in `server/test/`. The first tool is
  `get_status` (version, uptime, greeting).

## Pipeline (`.github/workflows/deploy.yml`)

- **PRs** build and test `server/` and `ui/`. No Azure involvement.
- **Push to `main` deploys.** The deploy job fetches the classroom credential
  from `CREDENTIAL_URL`, runs `az acr build --file Dockerfile .`, then runs
  `az containerapp create`/`update` for an app named `frank-<github owner>`.
  On `main` the Docker build is the **only** test gate, because the PR jobs are
  skipped.
- Don't use `az containerapp up --source` (it crashes on some azure-cli builds),
  and don't reintroduce OIDC or `environment: production`. The workflow's header
  comment explains why.
- Pushing to `main` deploys to Azure. Work on branches and open PRs; a human merges.

## ADR workflow (ADR-000)

- Use `/adr <title>` (`.claude/commands/adr.md`). It takes the next number, uses
  `docs/adr/template.md`, and hands the draft to the `adr-reviewer` agent. Keep
  each ADR to one page (roughly 290–375 words, like ADR-001 to ADR-005).
- **Accepted ADRs are immutable.** To change one, write a new ADR that supersedes
  it, naming the exact clauses it replaces. The only permitted edit to an old ADR
  is its Status line. Rejected ADRs stay in the repo.
- When adding an ADR, update the tables in **both** `docs/adr/README.md` and
  `README.md`.
- Leave new ADRs uncommitted with Status: Proposed. Accepting one is a human's call.

## Team agents in `.claude/agents/`

All three are read-only (`Read, Grep, Glob`):

- `adr-reviewer` (opus): reviews ADR drafts.
- `tool-conventions` (haiku): checks `server/src/tools/` against ADR-002. Run it
  before a PR that touches tools.
- `secret-scanner` (haiku): checks for leaked credentials, including in
  `CLAUDE.md`, ADRs, and fixtures. Run it before committing.
