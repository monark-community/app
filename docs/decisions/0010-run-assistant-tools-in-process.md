---
type: decision
status: accepted
date: 2026-08-05
---

# 0010. Run assistant tools in-process instead of through our MCP server

## Context

Monark already exposes itself to external AI agents (Claude Desktop, Cursor) through `@monark/mcp`, a stdio MCP server that authenticates with a static `mrk_` API key and calls the public `/api/v1` surface. The app-owned assistant needs tools too, and pointing it at that same server is the obvious shortcut.

Three forces push against it. The assistant must act as the signed-in user, so permissions, per-record access and the audit trail name the real person; an MCP connection acts as one fixed key holder. MCP here is stdio-only, so calling it from the api would mean spawning a process, or building an HTTP transport that doesn't exist, for the server to call itself. And MCP only sees routes marked for exposure, while the assistant also needs surfaces kept off the public API on purpose, such as automations.

The part worth sharing with MCP is the tool definitions, not the transport.

## Options

| Option                                                                                      | For                                                                                                                  | Against                                                                                                                                |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Call our own MCP server                                                                     | One integration path for every agent                                                                                 | Acts as a key holder, not the user, unless we mint a key per user; needs a process spawn or a new transport; limited to exposed routes |
| Hand-write a separate tool set for the assistant                                            | Full control over each tool                                                                                          | Two definitions of every action that drift apart; a second authorization path to keep correct                                          |
| Build tools from the public API route descriptors and run them through an in-process caller | One definition per action; runs as the user; no HTTP hop or API key; permissions, events and validation reused as-is | Tied to the api process; tools outside the public API need their own small definitions                                                 |

## Decision

Build the assistant's tools from the same `V1_ROUTES` descriptors that drive the MCP server, and run them in-process through a server-side tRPC caller created from the user's session, the pattern the public-API facade already uses. Surfaces kept off the public API get in-app-only tool definitions that call the same caller.

The deciding reason is identity: running as the session user means the assistant needs no authorization logic of its own.

```
V1_ROUTES --> MCP server ------------> external agents (stdio, API key)
          \-> buildChatToolset() ----> in-app assistant (in-process, as the user)
```

## Consequences

- A route is the single source of truth for both external and in-app tools. Marking a route for MCP exposure also gives it to the assistant, so each exposure decision has to suit both audiences.
- Each tool is gated by its procedure's own permission. A user can never do more through the assistant than in the UI.
- Writes are identified from the route's HTTP method (anything but `GET`), which drives the confirm-each-write gate.
- The assistant reaches nothing by default: only exposed routes plus the in-app tools, each added on purpose.
- In-app-only tools (automations, wiki, navigation) live in `services/api/src/chat/` and must be kept in step with their routers by hand.
- The assistant can only run inside the api process, which owns the router; a long turn holds an open streaming connection for its whole length. How the chat package gets the executor without importing the api is a separate decision: [Inject the assistant's tool executor at boot](0011-inject-the-assistant-tool-executor-at-boot.md).
