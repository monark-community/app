# Chat + the app-owned AI agent

`@monark/chat` is a generic conversation substrate whose first use is an
app-owned AI assistant. This note covers the load-bearing design decisions; the
per-export reference lives in the [module README](../../../packages/chat/README.md).

## In this section

- **[Why in-process tools, not our own MCP server](why-in-process-tools-not-our-own-mcp-server.md)**
- **[One tool registry, two adapters](one-tool-registry-two-adapters.md)**
- **[In-app-only tools (beyond the public API)](in-app-only-tools-beyond-the-public-api.md)**
- **[Layering: injection, not a dependency](layering-injection-not-a-dependency.md)**
- **[The loop + the confirm-each-write gate](the-loop-the-confirm-each-write-gate.md)**
- **[Provider abstraction](provider-abstraction.md)**
- **[Web companion](web-companion.md)**
- **[Streaming (SSE)](streaming-sse.md)**
- **[Not yet / deferred](not-yet-deferred.md)**
- **[Trust boundary](trust-boundary.md)**
