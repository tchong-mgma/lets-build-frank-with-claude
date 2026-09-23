# Frank's console

A web console for Frank (ADR-003): React 18, Vite and Cloudscape components.
It has two pages:

- **Overview** calls `get_status` and shows the version, uptime, greeting and connection health.
- **Tools** lists Frank's tools from MCP discovery. Pick one and the console builds a form from
  its input schema, calls the tool, and shows the summary and the full JSON result.

Frank serves this console from his own container at `/` (ADR-006), so it calls `/mcp`
**relatively**. There is no `VITE_FRANK_URL` and no CORS. The console holds no secrets.

## Run it against a local Frank

```bash
# terminal 1: Frank on :3000
cd server && npm ci && npm run dev

# terminal 2: the console on :5173
cd ui && npm ci && npm run dev
```

Open http://localhost:5173. In dev, Vite proxies `/mcp` and `/healthz` to
`http://localhost:3000` (see `vite.config.ts`), so the relative calls work here as they
do in the container.

## Test and build

```bash
npm test          # vitest + jsdom
npm run build     # tsc -b && vite build -> ui/dist (the Dockerfile copies it to /app/public)

npx vitest run test/client.test.ts   # one file
npx vitest run -t "Frank did not answer"
```

To try the built console without Docker, copy `ui/dist` to `server/public` and start
Frank. `server/public` is gitignored.

## Source map

| Path | Purpose |
|---|---|
| `src/main.tsx` | Loads Cloudscape global styles and renders `<App client={createFrankClient()} />`. |
| `src/App.tsx` | `AppLayout`, `SideNavigation` and `Flashbar`. Props are `client` and `initialPage` (the test seam). Switches pages with state and no router. |
| `src/frank/client.ts` | `createFrankClient()`: the `FrankClient` interface over the MCP SDK's browser client. It connects lazily, once. |
| `src/pages/Overview.tsx` | Shows the `get_status` output. If Frank doesn't answer, shows "Frank did not answer" with a Retry button. |
| `src/pages/Tools.tsx` | The tool table, the generated form, and the result. |
| `src/components/SchemaForm.tsx` | Renders the form for a tool's JSON input schema. |
| `src/components/schema.ts` | `schemaToFields()` and `buildArguments()`: the pure schema-to-widget mapping and value conversion. |
| `test/` | `client.test.ts` (result handling), `schema-form.test.tsx` (mapping and form), `pages.test.tsx` (pages with a fake client). |

## How schemas become forms

| Schema | Widget | Value sent |
|---|---|---|
| `enum` (checked before `type`) | Select | The original enum value, so numbers stay numbers |
| `string` | Input | The text |
| `number` / `integer` | Number input | `Number(text)`. An integer must be a whole number |
| required `boolean` | Toggle | `true` / `false` |
| optional `boolean` | Select: (unset) / true / false | Omitted unless set |
| anything else | JSON textarea | The parsed JSON. A parse error blocks the submit |

Empty optional fields are left out of `arguments`, so the server's defaults apply. A tool
with no parameters gets a plain **Call** button that sends `{}`.
