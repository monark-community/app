# @monark/mcp

A **Model Context Protocol** server that exposes Monark's data to AI agents
(Claude Desktop, Cursor, …) as native tools. It's a thin **stdio client of the
public REST API** (`/api/v1`) — so it works against any Monark deployment and
inherits all of its authorization for free.

## How it fits

```
Agent host (Claude Desktop / Cursor)
  └─ launches → @monark/mcp (stdio)  ── Bearer mrk_… ──►  /api/v1  (the deployed Monark)
                                                            auth · RBAC · per-key ceiling · rate limit
```

The server holds no logic of its own : every tool is one HTTP call to a v1
endpoint. Whatever the key can do over `curl`, the agent can do — and nothing
more. Least-privilege is set where it belongs (a limited key, or a
service-account key), not here. See
[docs/user-guide/public-api.md](../../docs/user-guide/public-api.md).

## Configuration

Two environment variables (the MCP host passes these when it launches the server):

| Var              | What                                                                    |
| ---------------- | ----------------------------------------------------------------------- |
| `MONARK_API_URL` | Your Monark host, e.g. `https://app.example.com` (no `/api/v1`).        |
| `MONARK_API_KEY` | An `mrk_` key from **Account → API keys**. The server acts as this key. |

The public API must be enabled on the deployment (`public-api.enabled`), and for
a limited/service-account key its permissions determine what these tools can do.

## Tools

The tool set is **auto-generated at startup** from the deployment's OpenAPI. On
connect, the server fetches `GET /api/v1/openapi.json` and turns every operation
the API tagged with `x-mcp-tool` into a tool — name, description, and input
schema all come from the spec. So the tools **track the API automatically** : a
new endpoint the API exposes for agents appears here with no change to this
package. Today that's:

| Tool                       | Endpoint                     |
| -------------------------- | ---------------------------- |
| `monark_whoami`            | `GET /me`                    |
| `monark_list_models`       | `GET /models`                |
| `monark_get_model`         | `GET /models/{key}`          |
| `monark_list_model_fields` | `GET /models/{key}/fields`   |
| `monark_list_records`      | `GET /models/{key}/records`  |
| `monark_get_record`        | `GET /records/{id}`          |
| `monark_create_record`     | `POST /models/{key}/records` |
| `monark_update_record`     | `PATCH /records/{id}`        |
| `monark_delete_record`     | `DELETE /records/{id}`       |

Which routes become tools is decided on the API side : each route carries a
required `mcp: { expose } | { skip }` decision, validated by `pnpm check:mcp`, and
`expose` decisions are published in the OpenAPI as `x-mcp-tool`. Projects, tasks,
and every other entity are **Data Model records**, reached through the record
tools — there is no per-feature tool.

## Building

`pnpm --filter @monark/mcp build` bundles the server (via esbuild) into a single
self-contained, shebanged `dist/index.js` — runtime deps stay external and are
installed from `dependencies`. That file is the package's `bin` (`monark-mcp`),
so once published it runs as `npx @monark/mcp`.

## Running it (Claude Desktop example)

Add to your MCP host's config (`claude_desktop_config.json`). Use whichever
launch form fits:

```jsonc
{
  "mcpServers": {
    "monark": {
      // Published build : "command": "npx", "args": ["@monark/mcp"]
      // Local build     : "command": "node", "args": ["<repo>/services/mcp/dist/index.js"]
      // From source     : "command": "npx", "args": ["tsx", "<repo>/services/mcp/src/index.ts"]
      "command": "node",
      "args": ["<path-to-repo>/services/mcp/dist/index.js"],
      "env": {
        "MONARK_API_URL": "https://app.example.com",
        "MONARK_API_KEY": "mrk_your_key_here",
      },
    },
  },
}
```

Diagnostics go to **stderr** (stdout is the protocol channel).

## Structure

- `src/config.ts` — reads + validates `MONARK_API_URL` / `MONARK_API_KEY`.
- `src/client.ts` — `MonarkClient` : the `/api/v1` HTTP client + `MonarkApiError`.
- `src/openapi.ts` — `fetchTools` (fetch + parse the OpenAPI into tools), `toolsFromOpenApi` (the pure parser), and `executeTool` (turn a tool call's flat args back into the HTTP request its plan describes).
- `src/server.ts` — `createMcpServer` (fetch tools + build) / `buildServer` (wire a fixed tool set onto a low-level `Server` : `tools/list` + `tools/call`).
- `src/index.ts` — the stdio entrypoint.

## Testing

Unit + protocol tests run under `pnpm --filter @monark/mcp test` (the client,
tools, config, and a protocol smoke test over the SDK's in-memory transport). A
**live end-to-end** test lives with the api service
([services/api/tests/integration/mcp-e2e.test.ts](../api/tests/integration/mcp-e2e.test.ts)) :
it boots the real API + Postgres, mints a key, and drives these tools through a
real MCP client over real HTTP.

## Not yet (follow-ups)

- **Publishing** — the package is `private` ; publishing to a registry is what
  turns the built bin into a literal `npx @monark/mcp` for non-developers.
- **Resources / prompts** — only tools are exposed today.
- **Remote (HTTP/SSE) transport** — stdio only, for local agent hosts.
