# Why in-process tools, not our own MCP server

We already expose Monark to _external_ AI agents (Claude Desktop, Cursor) via
`@monark/mcp`, a stdio MCP server that authenticates with a static `mrk_` API key
and calls the public `/api/v1` surface. It is tempting to point the in-app agent
at the same server ; but that is the wrong fit on every axis:

- **Identity.** MCP acts as one fixed key principal. An in-app assistant must act
  as the _logged-in user_, so RBAC, per-record access, and audit reflect the real
  actor. Routing through MCP would lose that (or force per-user key minting).
- **Transport + latency.** MCP is stdio-only; using it would mean spawning a
  process (or building an HTTP transport that doesn't exist) to call ourselves.
- **Surface.** MCP only exposes routes marked `mcp: { expose }`. The in-app agent
  can reach the whole app router in-process.

So the app-owned agent runs **in-process**: it builds a server-side tRPC caller
over `appRouter` from the user's session context (`createCaller(ctx)`, the same
pattern as the public-API facade in `services/api/src/public/caller.ts`) and calls
the identical procedures the web app uses. RBAC/events/validation are reused
verbatim.
