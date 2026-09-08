# One tool registry, two adapters

The valuable reuse isn't the transport ; it's the **tool definitions**. Both the
MCP server and the in-app agent derive their tools from the SAME
`V1_ROUTES` descriptors (`services/api/src/public/routes.ts`):

```
V1_ROUTES  ──►  MCP server (openapi x-mcp-tool)  ──►  external agents (stdio)
           └─►  buildChatToolset()               ──►  in-app agent (in-process)
```

`buildChatToolset()` (`services/api/src/chat/tools.ts`) turns each `mcp: { expose }`
route into an LLM tool spec (flattening path params + query + body into one input
schema) and, on invocation, re-splits the model's arguments, validates them with
the route's own zod schemas, and calls `route.handler({ caller, principal, … })`.
A route is thus the single source of truth for both external and in-app tools.
`method !== "get"` marks a tool as _mutating_ (drives the confirm gate).
