# Chat + the app-owned AI agent

`@monark/chat` is a generic conversation substrate whose first use is an
app-owned AI assistant. This note covers the load-bearing design decisions; the
per-export reference lives in the [module README](../../packages/chat/README.md).

## Why in-process tools, not our own MCP server

We already expose Monark to _external_ AI agents (Claude Desktop, Cursor) via
`@monark/mcp`, a stdio MCP server that authenticates with a static `mrk_` API key
and calls the public `/api/v1` surface. It is tempting to point the in-app agent
at the same server — but that is the wrong fit on every axis:

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

## One tool registry, two adapters

The valuable reuse isn't the transport — it's the **tool definitions**. Both the
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

## In-app-only tools (beyond the public API)

Some surfaces are deliberately kept OFF the public API / MCP but still given to
the in-app agent — automations are the first (an internal power-user surface we
don't want exposed to external agents). These live in
`services/api/src/chat/automation-tools.ts` as `InAppTool` defs (name,
description, a zod `inputSchema`, `mutates`, and a `run(caller, input)` closure);
`buildChatToolset` merges them alongside the route-derived tools. They call
`caller.automation.*` directly — same in-process caller, same per-procedure RBAC
(`automation.view` / `.create` / `.manage` / `.run`), same confirm-gate for
mutations. The tool set is discovery + whole-graph write: `automation_list` /
`_get` / `_list_node_types` / `_list_trigger_events` (reads), then
`automation_create` / `_update` (which pre-validate the graph with the exported
`validateGraph` against the live node registry, so the model gets an itemized fix
list instead of persisting something unrunnable), `_enable`, and `_test` +
`_get_run`. Automations are a single JSON graph blob written whole, so a
one-shot create/update tool fits better than incremental node/edge mutations.

## Layering: injection, not a dependency

The tool executor needs `appRouter`, which lives in `services/api`. Packages must
not import the api service, so `@monark/chat` defines the _contract_ (`tools.ts`:
`ChatToolExecutor`) and the api host injects the concrete executor at boot:

```ts
// services/api/src/server.ts
setChatToolExecutor(buildChatToolset());
```

This mirrors the existing `setWebhookSecretResolver` seam and keeps the dependency
direction clean (`services/api` → packages, never the reverse).

## The loop + the confirm-each-write gate

`advanceConversation(ctx, conversationId, opts?)` is **re-entrant and stateless
between turns**: each call reloads the conversation from the DB and replays it to
the model. Per step it streams the assistant turn, persists it, then for each
requested tool call:

- **read-only** → run immediately, record `SUCCEEDED`/`FAILED`, loop so the model
  can use the result;
- **mutating** → record `PROPOSED` and stop, returning `awaiting_confirmation`.

The UI then calls `chat.toolCalls.confirm` / `.reject`, which resolve the call and
simply call `advanceConversation` again. Because the loop reloads state, resume is
free — there's no in-memory turn state to reconstruct. Every message and tool call
(input, status, result) is persisted for replay + audit.

`buildLlmMessages` maps stored rows to the provider-agnostic message list; an
assistant message with tool calls is followed by a synthetic user message
carrying the matching `tool_result` blocks. The loop never calls the model while
any tool call is still `PROPOSED`/`EXECUTING` (the pending gate), so it can never
send a turn missing a tool result.

## Provider abstraction

`LlmProvider` (`llm/types.ts`) is a minimal streaming + tool-calling interface;
`AnthropicProvider` (`llm/anthropic.ts`) is the only file that imports a vendor
SDK. Resolution is lazy + cached (`getLlmProvider`) and overridable
(`setLlmProvider`) for tests / alternate hosts. Config: `ANTHROPIC_API_KEY`,
`CHAT_LLM_PROVIDER`, `CHAT_LLM_MODEL`, `CHAT_LLM_MAX_TOKENS`.

**Prompt caching.** The agent is input-heavy (the system prompt + all tool
schemas are resent every turn), so the Anthropic provider sets three ephemeral
`cache_control` breakpoints: the static system prompt, the tool set, and the
growing conversation prefix. For the cached prefix to stay byte-identical across
turns, the per-turn page context is injected into the **current user message**
(`injectContext`), never the system prompt. Cache reads bill at ~10% of input
after the first turn (default 5-min TTL); a prefix below the model's minimum
cacheable size just isn't cached (no error).

## Web companion

Mounted once in `(authed)/layout.tsx` via `ChatProvider` (like
`GlobalSearchProvider`), so the docked panel persists across navigation. It's a
non-modal right-side `Sheet` (full-screen on mobile) with two screens —
conversation list → thread — and inline confirm/reject cards for gated tool
calls. `messages.send` carries an optional page `context` (route + focused
model/record) that's folded into the system prompt so the agent can interpret
"this record".

## Streaming (SSE)

The assistant's reply streams token-by-token over a dedicated **`POST /chat/stream`**
Server-Sent Events endpoint (`services/api/src/server.ts`), not tRPC — the
app-wide tRPC client is httpBatch-only, so chat streaming rides its own fetch to
keep the shared client untouched. The endpoint authenticates with the same
Supabase bearer (`createContext`) and calls the shared `sendMessage(ctx, input,
hooks)` (also backing the `chat.messages.send` mutation) with an `onTextDelta`
hook that writes `event: token` frames; it ends with `event: done`
(`{ conversationId, status }`) or `event: error`. The web thread
(`components/chat/stream.ts`) POSTs with the bearer and reads the body stream,
appending tokens to a live bubble, then refetches the persisted messages on
`done`. `confirmToolCall` / `rejectToolCall` remain non-streamed (tRPC mutations

- refetch), so the assistant's _post-confirmation_ reply appears on refetch
  rather than streaming — a reasonable v1 seam.

## Not yet / deferred

- **Resizable panel** (fixed-width for now), **streaming the post-confirmation
  reply**, **human↔human conversations** (the schema supports them; no UI yet),
  and a structured "connections"/OAuth story.

## Trust boundary

Any tool the agent can call runs as the user through that procedure's own
permission gate — chat adds no bypass. A user can therefore only ever read or
change what they're already allowed to. The `chat.ai-agent` flag is an
org/user-level kill switch for the LLM-backed path.
